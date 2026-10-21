//! The owner's admin pages, /admin/status and /admin/health. Cloudflare Access asks for the login at the edge, and
//! every request must also carry a valid Access token (`Cf-Access-Jwt-Assertion`); without the ACCESS_* settings
//! only a local run can open them.
use super::*;
use crate::BoxError;
use axum::extract::ConnectInfo;
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use std::collections::VecDeque;
use std::net::SocketAddr;
use std::sync::Mutex;
use std::time::Instant;
use tokio::sync::RwLock;

/// Never kept by a browser or an edge: it is behind a login.
const ADMIN: &str = "private, no-store";
/// Access's signing keys are kept this long, and fetched again at most this often for an unknown key id.
const KEYS_FOR: Duration = Duration::from_secs(3600);
const REFETCH_AFTER: Duration = Duration::from_secs(60);

pub struct Access {
    certs_url: String,
    validation: Validation,
    emails: Vec<String>,
    keys: RwLock<Keys>,
    http: reqwest::Client,
}

#[derive(Default)]
struct Keys {
    by_kid: HashMap<String, DecodingKey>,
    fetched: Option<Instant>,
}

#[derive(serde::Deserialize)]
struct Claims {
    email: Option<String>,
}

impl Access {
    /// From ACCESS_TEAM_DOMAIN (like `team.cloudflareaccess.com`), ACCESS_AUD (the Access app's audience tag) and
    /// ADMIN_EMAILS (comma separated). None when any is missing: then nothing through Cloudflare gets in.
    pub fn from_env() -> Option<Access> {
        let var = |k: &str| std::env::var(k).ok().map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
        let (team, aud) = (var("ACCESS_TEAM_DOMAIN")?, var("ACCESS_AUD")?);
        let emails: Vec<String> = var("ADMIN_EMAILS")?.split(',').map(|e| e.trim().to_ascii_lowercase()).filter(|e| !e.is_empty()).collect();
        (!emails.is_empty()).then(|| Access::new(&team, &aud, emails, Algorithm::RS256))
    }

    fn new(team: &str, aud: &str, emails: Vec<String>, alg: Algorithm) -> Access {
        let mut validation = Validation::new(alg);
        validation.set_audience(&[aud]);
        validation.set_issuer(&[format!("https://{team}")]);
        validation.set_required_spec_claims(&["exp", "iss", "aud"]);
        Access {
            certs_url: format!("https://{team}/cdn-cgi/access/certs"),
            validation,
            emails,
            keys: RwLock::default(),
            http: reqwest::Client::builder().timeout(Duration::from_secs(10)).build().unwrap_or_default(),
        }
    }

    /// The signed-in email, when the token is Access's, for this app, unexpired, and the email is allowed.
    pub async fn check(&self, token: &str) -> Result<String, String> {
        let header = decode_header(token).map_err(|_| "unreadable login token".to_string())?;
        if !self.validation.algorithms.contains(&header.alg) {
            return Err(format!("login token uses {:?}, not Access's algorithm", header.alg));
        }
        let kid = header.kid.ok_or("login token has no key id")?;
        let short: String = kid.chars().take(64).collect();
        let key = self.key(&kid).await.ok_or_else(|| format!("login token signed with an unknown key ({short:?})"))?;
        let data = decode::<Claims>(token, &key, &self.validation).map_err(|e| format!("login token refused ({e})"))?;
        let email = data.claims.email.unwrap_or_default().to_ascii_lowercase();
        if self.emails.contains(&email) { Ok(email) } else { Err(format!("{email} is signed in but not an admin")) }
    }

    async fn key(&self, kid: &str) -> Option<DecodingKey> {
        {
            let k = self.keys.read().await;
            let age = k.fetched.map(|t| t.elapsed());
            if let Some(key) = k.by_kid.get(kid).filter(|_| age.is_some_and(|a| a < KEYS_FOR)) {
                return Some(key.clone());
            }
            if age.is_some_and(|a| a < REFETCH_AFTER) {
                return None;
            }
        }
        let mut k = self.keys.write().await;
        // another request may have fetched while this one waited for the lock
        if k.fetched.is_some_and(|t| t.elapsed() < REFETCH_AFTER) {
            return k.by_kid.get(kid).cloned();
        }
        match self.fetch().await {
            Ok(by_kid) => {
                crate::info!("admin", "loaded {} Cloudflare Access signing keys", by_kid.len());
                k.by_kid = by_kid;
            }
            Err(e) => crate::error!("admin", "could not load Cloudflare Access signing keys from {}: {e}", self.certs_url),
        }
        k.fetched = Some(Instant::now());
        k.by_kid.get(kid).cloned()
    }

    async fn fetch(&self) -> Result<HashMap<String, DecodingKey>, BoxError> {
        let set: JwkSet = self.http.get(&self.certs_url).send().await?.error_for_status()?.json().await?;
        Ok(set
            .keys
            .iter()
            .filter_map(|jwk| Some((jwk.common.key_id.clone()?, DecodingKey::try_from(jwk).ok()?)))
            .collect())
    }
}

/// A local run (a loopback client, no Cloudflare header) may open the admin pages; anything else needs a valid
/// Access login.
async fn allowed<F: Fetcher>(app: &App<F>, req: axum::extract::Request) -> bool {
    let loopback = req.extensions().get::<ConnectInfo<SocketAddr>>().is_some_and(|c| c.0.ip().is_loopback());
    let (uri, h) = (req.uri().to_string().chars().take(300).collect::<String>(), req.headers().clone());
    drop(req); // a request is not Sync, so it can't be held across the key fetch below
    if loopback && h.get("cf-ray").is_none() {
        return true;
    }
    let Some(access) = &app.access else {
        crate::warn!("admin", "refused {uri}: the admin login is not set up (ACCESS_TEAM_DOMAIN, ACCESS_AUD, ADMIN_EMAILS)");
        return false;
    };
    let cookie = h
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .find_map(|c| c.trim().strip_prefix("CF_Authorization="));
    let Some(token) = h.get("cf-access-jwt-assertion").and_then(|v| v.to_str().ok()).or(cookie) else {
        crate::warn!("admin", "refused {uri}: no Cloudflare Access login came with the request");
        return false;
    };
    match access.check(token).await {
        Ok(_) => true,
        Err(why) => {
            crate::warn!("admin", "refused {uri}: {why}");
            false
        }
    }
}

pub(super) async fn admin_status<F: Fetcher>(State(app): State<Arc<App<F>>>, req: axum::extract::Request) -> Response {
    if !allowed(&app, req).await {
        return private((StatusCode::NOT_FOUND, "not found").into_response());
    }
    private(static_file("admin/status.html", ADMIN))
}

pub(super) async fn admin_health<F: Fetcher>(State(app): State<Arc<App<F>>>, req: axum::extract::Request) -> Response {
    if !allowed(&app, req).await {
        return private((StatusCode::NOT_FOUND, "not found").into_response());
    }
    let a = app.clone();
    let disk = tokio::task::spawn_blocking(move || (a.cache.disk_bytes(), a.store.saved_count())).await.unwrap_or((None, None));
    private(full_health(&app, disk).into_response())
}

fn private(mut r: Response) -> Response {
    r.headers_mut().insert(header::CACHE_CONTROL, header::HeaderValue::from_static(ADMIN));
    r
}

/// The full health for /admin/status, with the capacities and counts the public /health leaves out.
fn full_health<F: Fetcher>(app: &App<F>, (disk_bytes, saved): (Option<u64>, Option<usize>)) -> Json<serde_json::Value> {
    let now = now_secs();
    let (entries, bytes, hits, misses) = app.cache.stats();
    let (in_memory, unknown) = app.store.counts(now);
    let mut v = serde_json::json!({
        "ok": true,
        "version": env!("CARGO_PKG_VERSION"),
        "now": now,
        "started_at": app.started_at,
        "queue": app.queue.len(),
        "refresh": app.queue.refresh_len(),
        "cache": {"entries": entries, "bytes": bytes, "budget": CACHE_BYTES, "hits": hits, "misses": misses,
                  "disk_bytes": disk_bytes, "disk_budget": DISK_BYTES},
        "renders": {"busy": RENDER_SLOTS - app.renders.available_permits(), "slots": RENDER_SLOTS},
        "users": {"saved": saved, "in_memory": in_memory, "unknown": unknown},
        "memory": memory(),
        "quota": app.queue.quota(),
        "scenes": app.assets.scene_names(),
        "traffic": traffic(now),
        "recent": crate::log::recent(),
    });
    if let (Some(v), serde_json::Value::Object(q)) = (v.as_object_mut(), app.queue.health()) {
        v.extend(q);
    }
    Json(v)
}

/// The container's memory use and limit from its cgroup, or the process's resident size where there is none.
fn memory() -> serde_json::Value {
    let read = |p: &str| std::fs::read_to_string(p).ok().and_then(|s| s.trim().parse::<u64>().ok());
    if let Some(used) = read("/sys/fs/cgroup/memory.current") {
        return serde_json::json!({"used": used, "limit": read("/sys/fs/cgroup/memory.max")});
    }
    let rss = std::fs::read_to_string("/proc/self/status").ok().and_then(|s| {
        let line = s.lines().find(|l| l.starts_with("VmRSS:"))?.to_string();
        line.split_whitespace().nth(1)?.parse::<u64>().ok().map(|kb| kb * 1024)
    });
    serde_json::json!({"used": rss, "limit": null})
}

/// What a request was answered with, for the per-minute traffic counts.
#[derive(Clone, Copy)]
pub(super) enum Outcome {
    Cache,
    Drawn,
    Busy,
    Error,
    Other,
}

/// Requests per minute for the last hour: (minute, [cache, drawn, busy, error, other]).
static TRAFFIC: Mutex<VecDeque<(u64, [u32; 5])>> = Mutex::new(VecDeque::new());

pub(super) fn count(o: Outcome) {
    let minute = now_secs() / 60;
    let mut t = TRAFFIC.lock().unwrap();
    if t.back().is_none_or(|(m, _)| *m != minute) {
        t.push_back((minute, [0; 5]));
    }
    while t.front().is_some_and(|(m, _)| *m + 60 <= minute) {
        t.pop_front();
    }
    if let Some((_, n)) = t.back_mut() {
        n[o as usize] += 1;
    }
}

fn traffic(now: u64) -> Vec<serde_json::Value> {
    let t = TRAFFIC.lock().unwrap();
    let last = now / 60;
    (last.saturating_sub(59)..=last)
        .map(|m| {
            let n = t.iter().find(|(x, _)| *x == m).map_or([0; 5], |(_, n)| *n);
            serde_json::json!({"minute": m * 60, "cache": n[0], "drawn": n[1], "busy": n[2], "error": n[3], "other": n[4]})
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{EncodingKey, Header, encode};

    const TEAM: &str = "team.cloudflareaccess.com";

    /// An Access that knows one HS256 key "k1", so tokens can be made in the test; Cloudflare's are RS256.
    async fn access() -> Access {
        let a = Access::new(TEAM, "aud1", vec!["owner@example.com".into()], Algorithm::HS256);
        let mut k = a.keys.write().await;
        k.by_kid.insert("k1".into(), DecodingKey::from_secret(b"secret"));
        k.fetched = Some(Instant::now());
        drop(k);
        a
    }

    fn token(kid: &str, aud: &str, email: &str, exp_in: i64) -> String {
        let mut h = Header::new(Algorithm::HS256);
        h.kid = Some(kid.into());
        let exp = now_secs() as i64 + exp_in;
        let claims = serde_json::json!({"aud": [aud], "iss": format!("https://{TEAM}"), "email": email, "exp": exp});
        encode(&h, &claims, &EncodingKey::from_secret(b"secret")).unwrap()
    }

    #[tokio::test]
    async fn only_the_owner_with_a_valid_login_gets_in() {
        let a = access().await;
        assert_eq!(a.check(&token("k1", "aud1", "Owner@Example.com", 600)).await, Ok("owner@example.com".into()));
        for (why, t) in [
            ("another person", token("k1", "aud1", "someone@example.com", 600)),
            ("another Access app", token("k1", "aud2", "owner@example.com", 600)),
            ("expired", token("k1", "aud1", "owner@example.com", -600)),
            ("unknown key, no refetch within a minute", token("k9", "aud1", "owner@example.com", 600)),
            ("another algorithm", {
                let mut h = Header::new(Algorithm::HS384);
                h.kid = Some("k1".into());
                let claims = serde_json::json!({"aud": ["aud1"], "iss": format!("https://{TEAM}"), "email": "owner@example.com", "exp": now_secs() + 600});
                encode(&h, &claims, &EncodingKey::from_secret(b"secret")).unwrap()
            }),
            ("not a token", "abc.def.ghi".to_string()),
        ] {
            assert!(a.check(&t).await.is_err(), "{why}");
        }
    }

    #[test]
    fn traffic_counts_by_minute() {
        count(Outcome::Drawn);
        count(Outcome::Cache);
        let t = traffic(now_secs());
        assert_eq!(t.len(), 60);
        let last = &t[59];
        assert!(last["drawn"].as_u64().unwrap() >= 1 && last["cache"].as_u64().unwrap() >= 1, "{last}");
    }
}
