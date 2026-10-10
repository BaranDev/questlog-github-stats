//! The fetch queue: logins waiting for GitHub, de-duplicated and bounded, drained by a few workers that respect
//! GitHub's quota, retry with backoff and hand results to the store.
use crate::dates::now_secs;
use crate::stats::UserStats;
use crate::store::Store;
use std::collections::{HashMap, HashSet, VecDeque};
use std::future::Future;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::Notify;
use tokio::time::Instant;

pub struct Quota {
    pub remaining: u64,
    pub reset_at: u64, // unix seconds
}

pub struct Fetched {
    pub stats: UserStats,
    pub quota: Option<Quota>,
}

#[derive(Debug)]
pub enum FetchError {
    NotFound,
    RateLimited { reset_at: u64 },
    Transient(String),
}

pub trait Fetcher: Send + Sync + 'static {
    fn fetch(&self, login: &str) -> impl Future<Output = Result<Fetched, FetchError>> + Send;
}

#[derive(Clone)]
pub struct QueueConfig {
    pub capacity: usize,
    pub workers: usize,
    pub per_ip_per_hour: usize,
    pub min_quota: u64,
    pub backoff: [Duration; 2], // waits before the 2nd and 3rd attempt; the 3rd failure holds the login
    pub fail_hold: Duration,
}

impl Default for QueueConfig {
    fn default() -> Self {
        QueueConfig {
            capacity: 500,
            workers: 2,
            per_ip_per_hour: 30,
            min_quota: 200,
            backoff: [Duration::from_secs(5), Duration::from_secs(30)],
            fail_hold: Duration::from_secs(600),
        }
    }
}

#[derive(Debug, PartialEq)]
pub enum Enqueued {
    Waiting { eta_secs: u64 },
    Full,
    IpLimited,
    Failed,
}

const HOUR: Duration = Duration::from_secs(3600);

struct State {
    pending: VecDeque<String>,
    active: HashSet<String>, // pending, in flight, or waiting out a backoff
    attempts: HashMap<String, usize>,
    failed: HashMap<String, Instant>,
    ip_log: HashMap<String, VecDeque<Instant>>,
    avg_secs: f64,
    paused_until: Option<Instant>,
    quota: Option<u64>,
}

struct Inner<F> {
    fetcher: F,
    store: Arc<Store>,
    cfg: QueueConfig,
    state: Mutex<State>,
    notify: Notify,
}

pub struct Queue<F: Fetcher> {
    inner: Arc<Inner<F>>,
}

impl<F: Fetcher> Clone for Queue<F> {
    fn clone(&self) -> Self {
        Queue { inner: self.inner.clone() }
    }
}

impl<F: Fetcher> Queue<F> {
    pub fn new(fetcher: F, store: Arc<Store>, cfg: QueueConfig) -> Queue<F> {
        let state = State {
            pending: VecDeque::new(),
            active: HashSet::new(),
            attempts: HashMap::new(),
            failed: HashMap::new(),
            ip_log: HashMap::new(),
            avg_secs: 10.0,
            paused_until: None,
            quota: None,
        };
        Queue { inner: Arc::new(Inner { fetcher, store, cfg, state: Mutex::new(state), notify: Notify::new() }) }
    }

    pub fn start(&self) {
        for _ in 0..self.inner.cfg.workers {
            let q = self.clone();
            tokio::spawn(async move { q.work().await });
        }
    }

    pub fn len(&self) -> usize {
        self.inner.state.lock().unwrap().pending.len()
    }

    pub fn quota(&self) -> Option<u64> {
        self.inner.state.lock().unwrap().quota
    }

    pub fn enqueue(&self, login: &str, ip: Option<&str>) -> Enqueued {
        let now = Instant::now();
        let cfg = &self.inner.cfg;
        let mut s = self.inner.state.lock().unwrap();
        if let Some(&until) = s.failed.get(login) {
            if now < until {
                return Enqueued::Failed;
            }
            s.failed.remove(login);
        }
        if s.active.contains(login) {
            let pos = s.pending.iter().position(|l| l == login).unwrap_or(0);
            return Enqueued::Waiting { eta_secs: eta(&s, cfg, pos, now) };
        }
        if s.pending.len() >= cfg.capacity {
            return Enqueued::Full;
        }
        if let Some(ip) = ip {
            let log = s.ip_log.entry(ip.to_string()).or_default();
            while log.front().is_some_and(|&t| now.duration_since(t) >= HOUR) {
                log.pop_front();
            }
            if log.len() >= cfg.per_ip_per_hour {
                return Enqueued::IpLimited;
            }
            log.push_back(now);
        }
        s.pending.push_back(login.to_string());
        s.active.insert(login.to_string());
        let wait = eta(&s, cfg, s.pending.len() - 1, now);
        drop(s);
        self.inner.notify.notify_one();
        Enqueued::Waiting { eta_secs: wait }
    }

    async fn work(&self) {
        loop {
            let login = self.next().await;
            let started = Instant::now();
            let result = self.inner.fetcher.fetch(&login).await;
            self.finish(&login, result, started.elapsed());
        }
    }

    /// The next login, once there is one and no quota pause is running.
    async fn next(&self) -> String {
        loop {
            let pause = {
                let mut s = self.inner.state.lock().unwrap();
                match s.paused_until {
                    Some(until) if Instant::now() < until => Some(until),
                    _ => {
                        s.paused_until = None;
                        if let Some(login) = s.pending.pop_front() {
                            if !s.pending.is_empty() {
                                self.inner.notify.notify_one(); // cascade: a sleeping worker takes the next one
                            }
                            return login;
                        }
                        None
                    }
                }
            };
            match pause {
                Some(until) => tokio::time::sleep_until(until).await,
                None => self.inner.notify.notified().await,
            }
        }
    }

    fn finish(&self, login: &str, result: Result<Fetched, FetchError>, took: Duration) {
        let now = Instant::now();
        let cfg = &self.inner.cfg;
        // The store is written before the login leaves `active`, so a request in between never re-enqueues it.
        let result = match result {
            Ok(mut f) => {
                f.stats.login = login.to_string(); // keyed by the requested login, or a renamed account refetches forever
                if let Err(e) = self.inner.store.put(f.stats.clone()) {
                    eprintln!("store {login}: {e}");
                }
                Ok(f)
            }
            Err(FetchError::NotFound) => {
                self.inner.store.forget(login);
                self.inner.store.mark_unknown(login, now_secs());
                Err(FetchError::NotFound)
            }
            other => other,
        };
        let mut s = self.inner.state.lock().unwrap();
        match result {
            Ok(f) => {
                s.avg_secs = 0.8 * s.avg_secs + 0.2 * took.as_secs_f64();
                if let Some(q) = f.quota {
                    s.quota = Some(q.remaining);
                    if q.remaining < cfg.min_quota {
                        pause(&mut s, now + Duration::from_secs(q.reset_at.saturating_sub(now_secs())));
                    }
                }
                s.active.remove(login);
                s.attempts.remove(login);
            }
            Err(FetchError::NotFound) => {
                s.active.remove(login);
                s.attempts.remove(login);
            }
            Err(FetchError::RateLimited { reset_at }) => {
                pause(&mut s, now + Duration::from_secs(reset_at.saturating_sub(now_secs()).max(1)));
                s.pending.push_front(login.to_string());
                drop(s);
                self.inner.notify.notify_one();
            }
            Err(FetchError::Transient(e)) => {
                eprintln!("fetch {login}: {e}");
                let tries = {
                    let a = s.attempts.entry(login.to_string()).or_default();
                    *a += 1;
                    *a
                };
                if tries > cfg.backoff.len() {
                    s.active.remove(login);
                    s.attempts.remove(login);
                    s.failed.insert(login.to_string(), now + cfg.fail_hold);
                } else {
                    let (q, login, wait) = (self.clone(), login.to_string(), cfg.backoff[tries - 1]);
                    tokio::spawn(async move {
                        tokio::time::sleep(wait).await;
                        q.inner.state.lock().unwrap().pending.push_back(login);
                        q.inner.notify.notify_one();
                    });
                }
            }
        }
    }
}

/// A pause only ever grows: a later, shorter one must not cut a running one short.
fn pause(s: &mut State, until: Instant) {
    s.paused_until = Some(s.paused_until.map_or(until, |p| p.max(until)));
}

/// Seconds until position `pos` is fetched: whole rounds of the workers at the average fetch time, plus any quota
/// pause, rounded up to 5 s.
fn eta(s: &State, cfg: &QueueConfig, pos: usize, now: Instant) -> u64 {
    let rounds = (pos / cfg.workers.max(1) + 1) as f64; // tests run with 0 workers
    let pause = s.paused_until.map_or(0.0, |p| p.saturating_duration_since(now).as_secs_f64());
    let secs = (rounds * s.avg_secs + pause).ceil() as u64;
    secs.div_ceil(5).max(1) * 5
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stats::{RawUser, derive};
    use crate::store::temp_dir;

    #[derive(Default)]
    struct Mock {
        script: Mutex<HashMap<String, VecDeque<Result<Fetched, FetchError>>>>,
        calls: Mutex<Vec<String>>,
    }

    impl Fetcher for Arc<Mock> {
        fn fetch(&self, login: &str) -> impl Future<Output = Result<Fetched, FetchError>> + Send {
            let r = self.script.lock().unwrap().get_mut(login).and_then(|q| q.pop_front());
            let r = r.unwrap_or(Err(FetchError::Transient("unscripted".into())));
            self.calls.lock().unwrap().push(login.to_string());
            async move {
                tokio::time::sleep(Duration::from_secs(1)).await;
                r
            }
        }
    }

    fn ok(login: &str, quota: Option<Quota>) -> Result<Fetched, FetchError> {
        Ok(Fetched { stats: derive(&RawUser { login: login.into(), ..Default::default() }, 0, now_secs()), quota })
    }

    fn setup(name: &str, cfg: QueueConfig, script: Vec<(&str, Result<Fetched, FetchError>)>) -> (Queue<Arc<Mock>>, Arc<Mock>, Arc<Store>) {
        let mock = Arc::new(Mock::default());
        for (login, r) in script {
            mock.script.lock().unwrap().entry(login.to_string()).or_default().push_back(r);
        }
        let store = Arc::new(Store::open(temp_dir(name)).unwrap());
        (Queue::new(mock.clone(), store.clone(), cfg), mock, store)
    }

    #[tokio::test(start_paused = true)]
    async fn same_login_is_fetched_once() {
        let (q, mock, store) = setup("q-once", QueueConfig::default(), vec![("a", ok("a", None))]);
        for ip in ["1.1.1.1", "2.2.2.2", "3.3.3.3"] {
            assert!(matches!(q.enqueue("a", Some(ip)), Enqueued::Waiting { .. }));
        }
        assert_eq!(q.len(), 1);
        q.start();
        tokio::time::sleep(Duration::from_secs(5)).await;
        assert_eq!(*mock.calls.lock().unwrap(), vec!["a"]);
        assert!(store.get("a", now_secs()).is_some());
    }

    #[tokio::test(start_paused = true)]
    async fn capacity_and_ip_limits() {
        let cfg = QueueConfig { capacity: 3, per_ip_per_hour: 2, ..Default::default() };
        let (q, _, _) = setup("q-limits", cfg, vec![]);
        assert!(matches!(q.enqueue("a", Some("ip1")), Enqueued::Waiting { .. }));
        assert!(matches!(q.enqueue("b", Some("ip1")), Enqueued::Waiting { .. }));
        assert_eq!(q.enqueue("c", Some("ip1")), Enqueued::IpLimited);
        assert!(matches!(q.enqueue("c", Some("ip2")), Enqueued::Waiting { .. }));
        assert_eq!(q.enqueue("d", None), Enqueued::Full);
        tokio::time::sleep(Duration::from_secs(3601)).await;
        assert_eq!(q.enqueue("a", Some("ip1")), Enqueued::Waiting { eta_secs: 10 }, "already queued: no new slot used");
    }

    #[tokio::test(start_paused = true)]
    async fn eta_counts_worker_rounds() {
        let (q, _, _) = setup("q-eta", QueueConfig::default(), vec![]);
        assert_eq!(q.enqueue("a", None), Enqueued::Waiting { eta_secs: 10 });
        assert_eq!(q.enqueue("b", None), Enqueued::Waiting { eta_secs: 10 });
        assert_eq!(q.enqueue("c", None), Enqueued::Waiting { eta_secs: 20 });
        assert_eq!(q.enqueue("c", None), Enqueued::Waiting { eta_secs: 20 });
    }

    #[tokio::test(start_paused = true)]
    async fn unknown_logins_go_to_the_store() {
        let (q, _, store) = setup("q-404", QueueConfig::default(), vec![("ghost", Err(FetchError::NotFound))]);
        q.start();
        q.enqueue("ghost", None);
        tokio::time::sleep(Duration::from_secs(5)).await;
        assert!(store.is_unknown("ghost", now_secs()));
        assert_eq!(q.len(), 0);
    }

    #[tokio::test(start_paused = true)]
    async fn failures_retry_then_hold() {
        let t = || Err(FetchError::Transient("boom".into()));
        let (q, mock, _) = setup("q-retry", QueueConfig::default(), vec![("a", t()), ("a", t()), ("a", t())]);
        q.start();
        q.enqueue("a", None);
        tokio::time::sleep(Duration::from_secs(60)).await;
        assert_eq!(mock.calls.lock().unwrap().len(), 3, "first try + retries after 5 s and 30 s");
        assert_eq!(q.enqueue("a", None), Enqueued::Failed);
        tokio::time::sleep(Duration::from_secs(600)).await;
        assert!(matches!(q.enqueue("a", None), Enqueued::Waiting { .. }), "the hold expires");
    }

    #[tokio::test(start_paused = true)]
    async fn low_quota_pauses_then_resumes() {
        let low = Quota { remaining: 10, reset_at: now_secs() + 100 };
        let (q, mock, _) = setup("q-quota", QueueConfig::default(), vec![("a", ok("a", Some(low))), ("b", ok("b", None))]);
        q.start();
        q.enqueue("a", None);
        tokio::time::sleep(Duration::from_secs(5)).await;
        let Enqueued::Waiting { eta_secs } = q.enqueue("b", None) else { panic!("b should queue") };
        assert!(eta_secs >= 90, "the wait includes the quota pause, got {eta_secs}");
        tokio::time::sleep(Duration::from_secs(50)).await;
        assert_eq!(*mock.calls.lock().unwrap(), vec!["a"], "paused");
        tokio::time::sleep(Duration::from_secs(100)).await;
        assert_eq!(*mock.calls.lock().unwrap(), vec!["a", "b"], "resumed after the reset");
        assert_eq!(q.quota(), Some(10));
    }

    #[tokio::test(start_paused = true)]
    async fn two_workers_fetch_in_parallel() {
        let script = ["a", "b", "c", "d"].map(|l| (l, ok(l, None))).into();
        let (q, mock, store) = setup("q-parallel", QueueConfig::default(), script);
        q.start();
        tokio::time::sleep(Duration::from_millis(10)).await; // both workers idle
        for l in ["a", "b", "c", "d"] {
            q.enqueue(l, None);
        }
        tokio::time::sleep(Duration::from_millis(2500)).await;
        assert_eq!(mock.calls.lock().unwrap().len(), 4);
        for l in ["a", "b", "c", "d"] {
            assert!(store.get(l, now_secs()).is_some(), "{l} stored");
        }
    }

    #[tokio::test(start_paused = true)]
    async fn stats_are_stored_under_the_requested_login() {
        let (q, _, store) = setup("q-canon", QueueConfig::default(), vec![("octocat", ok("OctoCat", None))]);
        q.start();
        q.enqueue("octocat", None);
        tokio::time::sleep(Duration::from_secs(5)).await;
        assert_eq!(store.get("octocat", now_secs()).unwrap().0.login, "octocat");
    }

    #[tokio::test(start_paused = true)]
    async fn a_pause_is_never_shortened() {
        let long = Quota { remaining: 1, reset_at: now_secs() + 500 };
        let short = Quota { remaining: 1, reset_at: now_secs() + 50 };
        let (q, mock, _) = setup("q-pause", QueueConfig::default(), vec![
            ("a", ok("a", Some(long))), ("b", ok("b", Some(short))), ("c", ok("c", None)),
        ]);
        q.start();
        q.enqueue("a", None);
        q.enqueue("b", None);
        tokio::time::sleep(Duration::from_secs(5)).await;
        q.enqueue("c", None);
        tokio::time::sleep(Duration::from_secs(100)).await;
        assert!(!mock.calls.lock().unwrap().contains(&"c".to_string()), "still paused by the longer pause");
    }

    #[tokio::test(start_paused = true)]
    async fn not_found_stops_serving_the_old_stats() {
        let (q, _, store) = setup("q-forget", QueueConfig::default(), vec![("gone", Err(FetchError::NotFound))]);
        store.put(derive(&RawUser { login: "gone".into(), ..Default::default() }, 0, 0)).unwrap();
        assert!(store.get("gone", 1).is_some());
        q.start();
        q.enqueue("gone", None);
        tokio::time::sleep(Duration::from_secs(5)).await;
        assert!(store.get("gone", now_secs()).is_none());
        assert!(store.is_unknown("gone", now_secs()));
    }
}
