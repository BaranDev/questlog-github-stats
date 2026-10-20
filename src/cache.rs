//! Guards for the renderer: finished PNGs kept by what they show, in memory and on disk, so a card asked for again
//! (another Cloudflare data center, the old host, a junk query parameter, a refreshed edge cache, a restart) costs
//! no render; and a per-IP budget of fresh renders, so one client can't keep the renderer busy for everyone.
use std::collections::hash_map::DefaultHasher;
use std::collections::{HashMap, VecDeque};
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// What a render shows, as a key: every part hashed in order (the caller lists them in a fixed order).
pub fn key(parts: &[&str]) -> u64 {
    let mut h = DefaultHasher::new();
    for p in parts {
        p.hash(&mut h);
    }
    h.finish()
}

/// Least recently used PNGs up to a byte budget in memory, and every card also saved as <disk>/<key>.png, so it
/// is drawn once per build. Eviction drops the oldest tenth at once, so it runs rarely; the disk is trimmed by
/// trim_disk().
pub struct RenderCache {
    budget: usize,
    inner: Mutex<Lru>,
    disk: Option<PathBuf>,
}

#[derive(Default)]
struct Lru {
    map: HashMap<u64, (Arc<Vec<u8>>, u64)>,
    bytes: usize,
    tick: u64,
    hits: u64,
    disk_hits: u64,
    misses: u64,
}

impl RenderCache {
    pub fn new(budget: usize) -> RenderCache {
        RenderCache { budget, inner: Mutex::new(Lru::default()), disk: None }
    }

    /// Also keep cards on disk under `root`/<version>/; folders of other versions are deleted (their cards were
    /// drawn from other art or code).
    pub fn with_disk(mut self, root: impl Into<PathBuf>, version: &str) -> RenderCache {
        let root = root.into();
        if let Ok(entries) = std::fs::read_dir(&root) {
            for e in entries.flatten() {
                if e.file_name().to_string_lossy() != version {
                    let _ = std::fs::remove_dir_all(e.path());
                }
            }
        }
        let dir = root.join(version);
        if std::fs::create_dir_all(&dir).is_ok() {
            self.disk = Some(dir);
        }
        self
    }

    fn file(&self, key: u64) -> Option<PathBuf> {
        self.disk.as_ref().map(|d| d.join(format!("{key:016x}.png")))
    }

    pub fn get(&self, key: u64) -> Option<Arc<Vec<u8>>> {
        self.lookup(key).map(|(bytes, _)| bytes)
    }

    /// Like get, and says where the card was found: "memory" or "disk".
    pub fn lookup(&self, key: u64) -> Option<(Arc<Vec<u8>>, &'static str)> {
        {
            let mut l = self.inner.lock().unwrap();
            l.tick += 1;
            let tick = l.tick;
            if let Some((bytes, used)) = l.map.get_mut(&key) {
                *used = tick;
                let bytes = bytes.clone();
                l.hits += 1;
                return Some((bytes, "memory"));
            }
        }
        // not in memory: a card saved on disk is read without holding the lock, then kept in memory
        match self.file(key).and_then(|f| std::fs::read(f).ok()) {
            Some(bytes) => {
                let bytes = Arc::new(bytes);
                self.remember(key, bytes.clone());
                self.inner.lock().unwrap().disk_hits += 1;
                Some((bytes, "disk"))
            }
            None => {
                self.inner.lock().unwrap().misses += 1;
                None
            }
        }
    }

    /// A newly drawn card: kept in memory and saved on disk (written aside, then renamed in, so a reader never
    /// sees half a file).
    pub fn put(&self, key: u64, bytes: Arc<Vec<u8>>) {
        if let Some(f) = self.file(key) {
            let tmp = f.with_extension("tmp");
            if std::fs::write(&tmp, &*bytes).is_ok() {
                let _ = std::fs::rename(&tmp, &f);
            }
        }
        self.remember(key, bytes);
    }

    /// Deletes the least recently used saved cards (by modification time) until the disk holds at most `budget`
    /// bytes. Returns how many it deleted.
    pub fn trim_disk(&self, budget: u64) -> usize {
        let Some(dir) = &self.disk else { return 0 };
        let Ok(entries) = std::fs::read_dir(dir) else { return 0 };
        let mut files: Vec<(std::time::SystemTime, u64, PathBuf)> = entries
            .flatten()
            .filter_map(|e| {
                let m = e.metadata().ok()?;
                Some((m.modified().ok()?, m.len(), e.path()))
            })
            .collect();
        let mut total: u64 = files.iter().map(|f| f.1).sum();
        files.sort();
        let mut removed = 0;
        for (_, len, path) in files {
            if total <= budget {
                break;
            }
            if std::fs::remove_file(&path).is_ok() {
                total -= len;
                removed += 1;
            }
        }
        removed
    }

    fn remember(&self, key: u64, bytes: Arc<Vec<u8>>) {
        let mut l = self.inner.lock().unwrap();
        l.tick += 1;
        let tick = l.tick;
        l.bytes += bytes.len();
        if let Some((old, _)) = l.map.insert(key, (bytes, tick)) {
            l.bytes -= old.len();
        }
        if l.bytes > self.budget {
            let mut ages: Vec<(u64, u64)> = l.map.iter().map(|(&k, &(_, used))| (used, k)).collect();
            ages.sort_unstable();
            for (_, k) in ages.into_iter().take(l.map.len() / 10 + 1) {
                if let Some((old, _)) = l.map.remove(&k) {
                    l.bytes -= old.len();
                }
            }
        }
    }

    /// (entries, bytes, hits, misses) for /health; disk hits count as hits.
    pub fn stats(&self) -> (usize, usize, u64, u64) {
        let l = self.inner.lock().unwrap();
        (l.map.len(), l.bytes, l.hits + l.disk_hits, l.misses)
    }
}

/// At most `per_minute` fresh renders per IP in any sliding minute.
pub struct IpBudget {
    per_minute: usize,
    inner: Mutex<(HashMap<String, VecDeque<Instant>>, Instant)>,
}

impl IpBudget {
    pub fn new(per_minute: usize) -> IpBudget {
        IpBudget { per_minute, inner: Mutex::new((HashMap::new(), Instant::now())) }
    }

    /// Takes one render from the IP's budget; false when it has none left.
    pub fn take(&self, ip: &str) -> bool {
        let now = Instant::now();
        let minute = Duration::from_secs(60);
        let mut g = self.inner.lock().unwrap();
        let (logs, next_sweep) = &mut *g;
        if now >= *next_sweep {
            // forget IPs quiet for a minute, so the map stays the size of the last minute's clients
            logs.retain(|_, log| log.back().is_some_and(|&t| now.duration_since(t) < minute));
            *next_sweep = now + minute;
        }
        let log = logs.entry(ip.to_string()).or_default();
        while log.front().is_some_and(|&t| now.duration_since(t) >= minute) {
            log.pop_front();
        }
        if log.len() >= self.per_minute {
            return false;
        }
        log.push_back(now);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_recent_entries_within_the_budget() {
        let c = RenderCache::new(1000);
        for k in 0..30u64 {
            c.put(k, Arc::new(vec![0; 100]));
            c.get(0); // 0 stays in use
        }
        let (entries, bytes, _, _) = c.stats();
        assert!(bytes <= 1000 && entries <= 10, "{entries} entries, {bytes} bytes");
        assert!(c.get(0).is_some(), "the entry in use survives");
        assert!(c.get(1).is_none(), "an old one went");
        assert!(c.get(29).is_some(), "the newest stays");
    }

    #[test]
    fn cards_on_disk_outlive_the_memory_and_other_versions_are_dropped() {
        let root = crate::store::temp_dir("render-disk");
        let c = RenderCache::new(1 << 20).with_disk(&root, "v1");
        c.put(7, Arc::new(vec![1, 2, 3]));
        let after_restart = RenderCache::new(1 << 20).with_disk(&root, "v1");
        assert_eq!(after_restart.get(7).as_deref(), Some(&vec![1, 2, 3]), "read back from disk");
        let next_build = RenderCache::new(1 << 20).with_disk(&root, "v2");
        assert!(next_build.get(7).is_none(), "another build draws again");
        assert!(!root.join("v1").exists(), "the old version's folder is gone");
        next_build.put(1, Arc::new(vec![0; 100]));
        next_build.put(2, Arc::new(vec![0; 100]));
        assert_eq!(next_build.trim_disk(150), 1, "trimmed to the budget");
    }

    #[test]
    fn same_parts_same_key() {
        assert_eq!(key(&["a", "b"]), key(&["a", "b"]));
        assert_ne!(key(&["a", "b"]), key(&["ab", ""]));
    }

    #[test]
    fn ip_budget_per_minute() {
        let b = IpBudget::new(2);
        assert!(b.take("1.1.1.1") && b.take("1.1.1.1"));
        assert!(!b.take("1.1.1.1"), "third in a minute");
        assert!(b.take("2.2.2.2"), "another IP has its own budget");
    }
}
