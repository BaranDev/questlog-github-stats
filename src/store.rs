//! Per-user stats cache: one small JSON file per login under <dir>/users/, mirrored in memory, plus a short
//! memory of logins GitHub doesn't know (so typos don't cost API calls).
use crate::BoxError;
use crate::stats::UserStats;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

pub const FRESH_SECS: u64 = 43200;
pub const UNKNOWN_SECS: u64 = 3600;
pub const EVICT_SECS: u64 = 30 * 86400;

pub struct Store {
    dir: PathBuf,
    mem: Mutex<Mem>,
}

#[derive(Default)]
struct Mem {
    users: HashMap<String, UserStats>,
    touched: HashMap<String, u64>, // last request time per login, persisted by sweep()
    unknown: HashMap<String, u64>,
}

/// Logins become file names, so only GitHub's login alphabet is allowed.
fn safe(login: &str) -> bool {
    !login.is_empty() && login.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

impl Store {
    pub fn open(dir: impl Into<PathBuf>) -> Result<Store, BoxError> {
        let dir = dir.into();
        std::fs::create_dir_all(dir.join("users"))?;
        let touched = std::fs::read(dir.join("touched.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        Ok(Store { dir, mem: Mutex::new(Mem { touched, ..Default::default() }) })
    }

    fn path(&self, login: &str) -> PathBuf {
        self.dir.join("users").join(format!("{login}.json"))
    }

    /// The cached stats and whether they are still fresh. Records the request time for eviction.
    pub fn get(&self, login: &str, now: u64) -> Option<(UserStats, bool)> {
        if !safe(login) {
            return None;
        }
        let mut m = self.mem.lock().unwrap();
        if !m.users.contains_key(login) {
            let s: UserStats = serde_json::from_slice(&std::fs::read(self.path(login)).ok()?).ok()?;
            m.users.insert(login.to_string(), s);
        }
        m.touched.insert(login.to_string(), now);
        let s = m.users[login].clone();
        let fresh = now.saturating_sub(s.fetched_at) <= FRESH_SECS;
        Some((s, fresh))
    }

    pub fn put(&self, stats: UserStats) -> Result<(), BoxError> {
        if !safe(&stats.login) {
            return Err(format!("unsafe login {:?}", stats.login).into());
        }
        let path = self.path(&stats.login);
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec(&stats)?)?;
        std::fs::rename(&tmp, &path)?; // atomic: readers never see half a file
        let mut m = self.mem.lock().unwrap();
        m.unknown.remove(&stats.login);
        m.users.insert(stats.login.clone(), stats);
        Ok(())
    }

    /// Drops a user's file and memory entries, so a deleted or renamed account stops being served.
    pub fn forget(&self, login: &str) {
        if !safe(login) {
            return;
        }
        let mut m = self.mem.lock().unwrap();
        let _ = std::fs::remove_file(self.path(login));
        m.users.remove(login);
        m.touched.remove(login);
    }

    pub fn mark_unknown(&self, login: &str, now: u64) {
        self.mem.lock().unwrap().unknown.insert(login.to_string(), now);
    }

    pub fn is_unknown(&self, login: &str, now: u64) -> bool {
        self.mem.lock().unwrap().unknown.get(login).is_some_and(|&t| now.saturating_sub(t) < UNKNOWN_SECS)
    }

    /// Deletes users nobody requested for 30 days (a user never requested since a restart counts from its fetch
    /// time), forgets expired unknowns and persists request times. Returns how many users were deleted.
    pub fn sweep(&self, now: u64) -> Result<usize, BoxError> {
        let mut m = self.mem.lock().unwrap();
        let mut removed = 0;
        for entry in std::fs::read_dir(self.dir.join("users"))? {
            let path = entry?.path();
            if path.extension().is_none_or(|e| e != "json") {
                continue;
            }
            let Some(login) = path.file_stem().and_then(|s| s.to_str()).map(str::to_string) else { continue };
            let last = match m.touched.get(&login) {
                Some(&t) => t,
                None => std::fs::read(&path)
                    .ok()
                    .and_then(|b| serde_json::from_slice::<UserStats>(&b).ok())
                    .map_or(0, |s| s.fetched_at),
            };
            if now.saturating_sub(last) > EVICT_SECS {
                std::fs::remove_file(&path)?;
                m.users.remove(&login);
                m.touched.remove(&login);
                removed += 1;
            }
        }
        m.unknown.retain(|_, t| now.saturating_sub(*t) < UNKNOWN_SECS);
        // Bound the memory mirror: disk stays the source of truth and get() reloads lazily.
        let Mem { users, touched, .. } = &mut *m;
        users.retain(|login, _| touched.get(login).is_some_and(|&t| now.saturating_sub(t) <= FRESH_SECS));
        std::fs::write(self.dir.join("touched.json"), serde_json::to_vec(&m.touched)?)?;
        Ok(removed)
    }
}

#[cfg(test)]
pub fn temp_dir(name: &str) -> PathBuf {
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    std::env::temp_dir().join(format!("questlog-{name}-{}-{nanos}", std::process::id()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stats::{RawUser, derive};

    fn stats(login: &str, fetched_at: u64) -> UserStats {
        derive(&RawUser { login: login.into(), ..Default::default() }, 0, fetched_at)
    }

    #[test]
    fn fresh_then_stale_and_persisted() {
        let dir = temp_dir("store-fresh");
        let s = Store::open(&dir).unwrap();
        assert!(s.get("octocat", 1000).is_none());
        s.put(stats("octocat", 1000)).unwrap();
        assert!(s.get("octocat", 1000 + FRESH_SECS).unwrap().1, "12 h old is still fresh");
        assert!(!s.get("octocat", 1001 + FRESH_SECS).unwrap().1);
        let reopened = Store::open(&dir).unwrap();
        assert_eq!(reopened.get("octocat", 1000).unwrap().0.login, "octocat");
    }

    #[test]
    fn unknown_users_are_remembered_for_an_hour() {
        let s = Store::open(temp_dir("store-unknown")).unwrap();
        s.mark_unknown("ghost", 100);
        assert!(s.is_unknown("ghost", 100 + UNKNOWN_SECS - 1));
        assert!(!s.is_unknown("ghost", 100 + UNKNOWN_SECS));
        s.put(stats("ghost", 200)).unwrap();
        assert!(!s.is_unknown("ghost", 201), "a successful fetch clears it");
    }

    #[test]
    fn sweep_evicts_untouched_users() {
        let dir = temp_dir("store-sweep");
        let s = Store::open(&dir).unwrap();
        s.put(stats("old", 0)).unwrap();
        s.put(stats("kept", 0)).unwrap();
        s.get("kept", EVICT_SECS); // requested recently
        assert_eq!(s.sweep(EVICT_SECS + 10).unwrap(), 1);
        assert!(s.get("old", EVICT_SECS + 10).is_none());
        assert!(s.get("kept", EVICT_SECS + 10).is_some());
        assert!(dir.join("touched.json").exists());
    }

    #[test]
    fn sweep_bounds_the_memory_mirror() {
        let s = Store::open(temp_dir("store-mirror")).unwrap();
        s.put(stats("idle", 0)).unwrap();
        s.put(stats("busy", 0)).unwrap();
        s.get("idle", 100);
        s.get("busy", 100 + FRESH_SECS + 5);
        s.sweep(100 + FRESH_SECS + 6).unwrap();
        let m = s.mem.lock().unwrap();
        assert!(!m.users.contains_key("idle"), "untouched for 12 h: dropped from memory");
        assert!(m.users.contains_key("busy"));
        drop(m);
        assert_eq!(s.get("idle", 100 + FRESH_SECS + 7).unwrap().0.login, "idle", "still loads from disk");
    }

    #[test]
    fn forget_removes_file_and_memory() {
        let dir = temp_dir("store-forget");
        let s = Store::open(&dir).unwrap();
        s.put(stats("gone", 0)).unwrap();
        s.get("gone", 1);
        s.forget("gone");
        assert!(s.get("gone", 2).is_none());
        assert!(!dir.join("users").join("gone.json").exists());
        s.forget("../x"); // refused quietly
    }

    #[test]
    fn path_unsafe_logins_are_refused() {
        let s = Store::open(temp_dir("store-safe")).unwrap();
        assert!(s.get("../etc/passwd", 0).is_none());
        assert!(s.put(stats("../x", 0)).is_err());
    }
}
