//! In-memory guards for the renderer: finished PNGs kept by what they show, so a card asked for again (another
//! Cloudflare data center, the old host, a junk query parameter, a refreshed edge cache) costs no render; and a
//! per-IP budget of fresh renders, so one client can't keep the renderer busy for everyone.
use std::collections::hash_map::DefaultHasher;
use std::collections::{HashMap, VecDeque};
use std::hash::{Hash, Hasher};
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

/// Least recently used PNGs up to a byte budget. Eviction drops the oldest tenth at once, so it runs rarely.
pub struct RenderCache {
    budget: usize,
    inner: Mutex<Lru>,
}

#[derive(Default)]
struct Lru {
    map: HashMap<u64, (Arc<Vec<u8>>, u64)>,
    bytes: usize,
    tick: u64,
    hits: u64,
    misses: u64,
}

impl RenderCache {
    pub fn new(budget: usize) -> RenderCache {
        RenderCache { budget, inner: Mutex::new(Lru::default()) }
    }

    pub fn get(&self, key: u64) -> Option<Arc<Vec<u8>>> {
        let mut l = self.inner.lock().unwrap();
        l.tick += 1;
        let tick = l.tick;
        match l.map.get_mut(&key) {
            Some((bytes, used)) => {
                *used = tick;
                let bytes = bytes.clone();
                l.hits += 1;
                Some(bytes)
            }
            None => {
                l.misses += 1;
                None
            }
        }
    }

    pub fn put(&self, key: u64, bytes: Arc<Vec<u8>>) {
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

    /// (entries, bytes, hits, misses) for /health.
    pub fn stats(&self) -> (usize, usize, u64, u64) {
        let l = self.inner.lock().unwrap();
        (l.map.len(), l.bytes, l.hits, l.misses)
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
