//! HTTP: the card routes, the preview page and /health. Every card response is a 200 image, because a non-200
//! shows as a broken image on GitHub. The X-Questlog header says which kind it is.
mod admin;
mod cards;
mod pages;

pub use admin::Access;
use admin::{Outcome, admin_health, admin_status};

use cards::*;
use pages::*;
use crate::cache::{self, IpBudget, RenderCache};
use crate::canvas::Image;
use crate::dates::now_secs;
use crate::encode::encode;
use crate::params::{self, Request};
use crate::queue::{Enqueued, Fetcher, Queue};
use crate::scene::Assets;
use crate::stats::UserStats;
use crate::store::Store;
use crate::widgets::{self, Look, Widget};
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, HeaderName, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tokio::sync::Semaphore;

/// stale-while-revalidate: past max-age an edge serves the old card at once and fetches the new one behind it.
pub const READY: &str = "public, max-age=43200, stale-while-revalidate=86400";
/// Stale cards (a refresh is queued) are cached for hours too: under load most cards are stale, and a short edge
/// cache would turn every README view into a render.
pub const STALE: &str = "public, max-age=21600, stale-while-revalidate=86400";
/// A busy card answered when the renderer is overloaded or the client used its render budget.
pub const SHED: &str = "public, max-age=60";
/// How long a request may wait for a render slot. GitHub's image proxy gives up after about 4 s (observed, not
/// documented), and a card it gives up on is a broken image; a busy card is not.
const SHED_AFTER: Duration = Duration::from_secs(2);
/// Fresh renders one IP may ask for per minute (GitHub's image proxy and local requests are not limited). The wiki
/// alone shows about 120 cards, so a visitor right after a deploy must fit.
const RENDERS_PER_IP_MINUTE: usize = 240;
/// Finished cards kept in memory (the container has 1 GB).
pub const CACHE_BYTES: usize = 256 << 20;
/// Finished cards kept on disk, for this build.
pub const DISK_BYTES: u64 = 2 << 30;

/// GitHub's image proxy is reported to keep images sent with a bare no-cache; this spelling it does not keep.
pub const NO_CACHE: &str = "max-age=0, no-cache, no-store, must-revalidate";
pub const PAGE: &str = "public, max-age=300";
pub const DEMO: &str = "public, max-age=86400";
const DEMO_USER: &str = "demo-adventurer";
const DEMO_STATS: &str = include_str!("../../tests/fixtures/sample.json");
pub const ASSET: &str = "public, max-age=604800";
const UNKNOWN: &str = "No adventurer by that name";
const BUSY: &str = "The scriptorium is busy, try again soon";
const FAILED: &str = "The road is closed";

pub struct App<F: Fetcher> {
    pub assets: Arc<Assets>,
    pub store: Arc<Store>,
    pub queue: Queue<F>,
    pub renders: Arc<Semaphore>,
    pub cache: RenderCache,
    pub ip_renders: IpBudget,
    pub started_at: u64,
    /// The admin login check; None lets only local runs open the admin pages.
    pub access: Option<Access>,
    shed: HashMap<Widget, Vec<u8>>,
}

/// Cards drawn at the same time; the rest wait up to SHED_AFTER.
const RENDER_SLOTS: usize = 2;

impl<F: Fetcher> App<F> {
    /// Two render slots; the busy cards for overload are drawn once here, so shedding costs no render.
    pub fn new(assets: Arc<Assets>, store: Arc<Store>, queue: Queue<F>) -> App<F> {
        Self::with_cache(assets, store, queue, RenderCache::new(CACHE_BYTES))
    }

    pub fn with_cache(assets: Arc<Assets>, store: Arc<Store>, queue: Queue<F>, cache: RenderCache) -> App<F> {
        let shed = [Widget::Stats, Widget::Languages, Widget::Streak]
            .into_iter()
            .filter_map(|w| {
                let look = Look::default();
                let d = widgets::message(&assets, w, &look, BUSY)?;
                Some((w, encode(&d.frames, d.title.as_ref(), look.scale).ok()?))
            })
            .collect();
        App {
            assets,
            store,
            queue,
            renders: Arc::new(Semaphore::new(RENDER_SLOTS)),
            cache,
            ip_renders: IpBudget::new(RENDERS_PER_IP_MINUTE),
            started_at: now_secs(),
            access: None,
            shed,
        }
    }

    pub fn with_access(mut self, access: Option<Access>) -> App<F> {
        self.access = access;
        self
    }
}

pub fn router<F: Fetcher>(app: Arc<App<F>>) -> Router {
    Router::new()
        .route("/", get(|| async { static_file("index.html", PAGE) }))
        .route("/wiki", get(|| async { static_file("wiki.html", PAGE) }))
        .route("/builder", get(|| async { static_file("builder.html", PAGE) }))
        .route("/status", get(|| async { static_file("status.html", PAGE) }))
        .route("/admin/status", get(admin_status::<F>))
        .route("/admin/health", get(admin_health::<F>))
        // the admin page's shell is only served through its guarded address
        .route(
            "/static/{*path}",
            get(|Path(p): Path<String>| async move {
                if p.starts_with("admin/") { (StatusCode::NOT_FOUND, "not found").into_response() } else { static_file(&p, ASSET) }
            }),
        )
        .route("/art/{scene}/{file}", get(art::<F>))
        .route("/demo/message", get(demo_message::<F>))
        .route("/decorations/{name}", get(decoration::<F>))
        .route("/demo/{widget}", get(demo_card::<F>))
        .route("/health", get(health::<F>))
        .route("/{widget}", get(card::<F>))
        // the short form: /octocat/stats, /octocat/stats/forest-misty, /octocat/stats/forest-misty/night
        .route("/{user}/{widget}", get(card_at::<F>))
        .route("/{user}/{widget}/{scene}", get(card_at::<F>))
        .route("/{user}/{widget}/{scene}/{time}", get(card_at::<F>))
        .with_state(app)
        .layer(axum::middleware::from_fn(log_request))
}

/// One log line per request. Busy and failed answers are WARN, server errors ERROR.
async fn log_request(req: axum::extract::Request, next: axum::middleware::Next) -> Response {
    let start = std::time::Instant::now();
    let (method, uri) = (req.method().clone(), req.uri().to_string());
    let h = req.headers();
    let hv = |k: &str| h.get(k).and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let (country, ray, client) = (hv("cf-ipcountry"), hv("cf-ray"), client_kind(&hv("user-agent")));
    let res = next.run(req).await;
    let ms = start.elapsed().as_millis();
    let status = res.status();
    let kind = res.headers().get("x-questlog").and_then(|v| v.to_str().ok()).unwrap_or("");
    let answer = match (kind, res.extensions().get::<Served>()) {
        ("", _) if status == StatusCode::NOT_FOUND => " no such address".to_string(),
        ("", _) if uri.starts_with("/health") || uri.starts_with("/admin/health") => " health report".to_string(),
        ("", _) if status.is_success() => " page or file built into the server".to_string(),
        ("", _) => String::new(),
        (k, Some(Served(how))) => format!(" {}, {how}", describe(k)),
        (k, None) => format!(" {}", describe(k)),
    };
    let bytes = axum::body::HttpBody::size_hint(res.body()).exact().map(|b| format!(" | {}", crate::log::size(b)));
    let mut who = vec![client];
    if !country.is_empty() {
        who.push(country);
    }
    if !ray.is_empty() {
        who.push(format!("ray {ray}"));
    }
    let uri: String = uri.chars().take(300).collect();
    let line = format!("{method} {uri} -> {}{answer} | {ms} ms{} | {}", status.as_u16(), bytes.unwrap_or_default(), who.join(" | "));
    admin::count(if status.is_server_error() || answer.contains("drawing failed") || kind == "failed" {
        Outcome::Error
    } else if kind == "busy" {
        Outcome::Busy
    } else if answer.contains("drawn in") {
        Outcome::Drawn
    } else if answer.contains(" cache") {
        Outcome::Cache
    } else {
        Outcome::Other
    });
    if status.is_server_error() || answer.contains("drawing failed") {
        crate::error!("http", "{line}");
    } else if matches!(kind, "busy" | "failed") {
        crate::warn!("http", "{line}");
    } else {
        crate::info!("http", "{line}");
    }
    res
}

fn describe(kind: &str) -> &str {
    match kind {
        "card" => "card",
        "placeholder" => "placeholder (user waits for the first GitHub fetch)",
        "unknown" => "\"no adventurer by that name\" (not a GitHub user)",
        "busy" => "busy card",
        "failed" => "\"road is closed\" (GitHub fetches for this user keep failing)",
        "error" => "error card (bad options in the address)",
        k => k,
    }
}

/// A short client label for the log, from the user agent.
fn client_kind(ua: &str) -> String {
    let low = ua.to_ascii_lowercase();
    if ua.is_empty() {
        "no user agent".into()
    } else if ua.starts_with("github-camo") {
        "GitHub image proxy".into()
    } else if let Some(bot) = ua.split([' ', ';', '(', ')']).find(|w| { let w = w.to_ascii_lowercase(); w.contains("bot") || w.contains("spider") || w.contains("crawl") }) {
        bot.trim_end_matches(',').chars().take(40).collect()
    } else if low.starts_with("curl") || low.starts_with("wget") || low.starts_with("python") || low.starts_with("go-http") {
        ua.split(' ').next().unwrap_or(ua).chars().take(40).collect()
    } else if low.contains("mozilla") {
        let os = ["Android", "iPhone", "iPad", "Windows", "Mac OS", "Linux"].into_iter().find(|o| ua.contains(o));
        format!("browser{}", os.map(|o| format!(" on {o}")).unwrap_or_default())
    } else {
        ua.chars().take(40).collect()
    }
}

/// A status line every 15 minutes, so the log shows the service's state without opening /health.
pub fn log_status<F: Fetcher>(app: &App<F>) {
    let (entries, bytes, hits, misses) = app.cache.stats();
    let rate = if hits + misses > 0 { hits * 100 / (hits + misses) } else { 0 };
    let quota = app.queue.quota().map_or("not known yet (no fetch since start)".into(), |q| format!("{q} points left this hour"));
    crate::info!(
        "status",
        "{} new users waiting, {} refreshes waiting | cache {entries} cards, {}, {rate}% of asks found ({hits} found, {misses} drawn) | GitHub quota {quota}",
        app.queue.len(),
        app.queue.refresh_len(),
        crate::log::size(bytes as u64)
    );
}

/// The public health. No capacities or counts, so it tells nobody how much load it takes to fill the service.
async fn health<F: Fetcher>(State(app): State<Arc<App<F>>>) -> Json<serde_json::Value> {
    let q = app.queue.health();
    let paused = q["github"]["paused_secs"].as_u64().unwrap_or(0);
    let (n, w) = (&q["new_users"], &q["waiting"]);
    let capped = n["this_hour"].as_u64() >= n["per_hour"].as_u64();
    let open = !capped && w["new"].as_u64() < w["new_capacity"].as_u64();
    // whole minutes: enough for people, and no second-exact timing for anyone flooding new logins
    let minutes = |s: Option<u64>| s.map(|s| s.div_ceil(60) * 60);
    Json(serde_json::json!({
        "ok": true,
        "now": now_secs(),
        "started_at": app.started_at,
        "fetching": {"paused": paused > 0, "back_in_secs": minutes((paused > 0).then_some(paused))},
        "new_users": {"open": open, "next_opening_secs": if capped { minutes(n["oldest_frees_in_secs"].as_u64()) } else { None }},
        "scenes": app.assets.scene_names(),
    }))
}

/// The client IP for the per-IP limit, or None where it must not apply: local requests (no Cloudflare header)
/// and GitHub's image proxy, which fetches every README image from a handful of IPs.
fn client_ip(h: &HeaderMap) -> Option<String> {
    let ua = h.get(header::USER_AGENT).and_then(|v| v.to_str().ok()).unwrap_or("");
    if ua.starts_with("github-camo") {
        return None;
    }
    h.get("cf-connecting-ip").and_then(|v| v.to_str().ok()).map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::queue::{FetchError, Fetched, QueueConfig};
    use crate::stats::{RawUser, derive};
    use crate::store::temp_dir;
    use std::future::Future;

    struct Fixed;
    impl Fetcher for Fixed {
        fn fetch(&self, login: &str) -> impl Future<Output = Result<Fetched, FetchError>> + Send {
            let r = if login == "ghost" {
                Err(FetchError::NotFound)
            } else {
                let raw = RawUser { login: login.into(), ..Default::default() };
                Ok(Fetched { stats: derive(&raw, 0, now_secs()), quota: None })
            };
            async move { r }
        }
    }

    async fn serve(cfg: QueueConfig) -> (String, Arc<App<Fixed>>) {
        let store = Arc::new(Store::open(temp_dir("srv")).unwrap());
        let queue = Queue::new(Fixed, store.clone(), cfg);
        queue.start();
        let app = Arc::new(App::new(Arc::new(Assets::embedded().unwrap()), store, queue));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let r = router(app.clone()).into_make_service_with_connect_info::<std::net::SocketAddr>();
        tokio::spawn(async move { axum::serve(listener, r).await.unwrap() });
        (base, app)
    }

    async fn get(url: &str, headers: &[(&str, &str)]) -> (String, String, Vec<u8>) {
        let mut req = reqwest::Client::new().get(url);
        for (k, v) in headers {
            req = req.header(*k, *v);
        }
        let res = req.send().await.unwrap();
        assert_eq!(res.status(), 200, "{url}");
        let h = |n: &str| res.headers().get(n).map(|v| v.to_str().unwrap().to_string()).unwrap_or_default();
        let (kind, cache) = (h("x-questlog"), h("cache-control"));
        assert_eq!(h("content-type"), crate::encode::CONTENT_TYPE);
        (kind, cache, res.bytes().await.unwrap().to_vec())
    }

    /// Polls until the response is no longer a placeholder.
    async fn settled(url: &str) -> (String, String, Vec<u8>) {
        for _ in 0..50 {
            let r = get(url, &[]).await;
            if r.0 != "placeholder" {
                return r;
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
        panic!("still a placeholder: {url}");
    }

    #[tokio::test]
    async fn first_request_waits_then_card() {
        let (base, _) = serve(QueueConfig::default()).await;
        let (kind, cache, body) = get(&format!("{base}/stats?user=OctoCat"), &[]).await;
        assert_eq!((kind.as_str(), cache.as_str()), ("placeholder", NO_CACHE));
        assert!(is_webp(&body));
        let (kind, cache, _) = settled(&format!("{base}/stats?user=octocat&time=night")).await;
        assert_eq!((kind.as_str(), cache.as_str()), ("card", READY));
        let (kind, _, _) = get(&format!("{base}/streak?user=octocat&animate=false"), &[]).await;
        assert_eq!(kind, "card", "one fetch serves every widget");
    }

    fn is_webp(b: &[u8]) -> bool {
        b.len() > 12 && &b[..4] == b"RIFF" && &b[8..12] == b"WEBP"
    }

    /// Width and height of a card (WebP) or a painting (PNG).
    fn dims(bytes: &[u8]) -> (u32, u32) {
        if is_webp(bytes) {
            let f = webp::BitstreamFeatures::new(bytes).unwrap();
            return (f.width(), f.height());
        }
        let r = png::Decoder::new(std::io::Cursor::new(bytes)).read_info().unwrap();
        (r.info().width, r.info().height)
    }

    #[tokio::test]
    async fn scale_sizes_the_card_and_bad_scale_is_an_error_card() {
        let (base, app) = serve(QueueConfig { workers: 0, ..Default::default() }).await;
        app.store.put(derive(&RawUser { login: "sized".into(), ..Default::default() }, 0, now_secs())).unwrap();
        let (kind, _, body) = get(&format!("{base}/stats?user=sized&scale=2&animate=false"), &[]).await;
        assert_eq!((kind.as_str(), dims(&body)), ("card", (640, 256)));
        let (_, _, body) = get(&format!("{base}/stats?user=sized&animate=false"), &[]).await;
        assert_eq!(dims(&body), (1600, 640), "default scale is 5");
        let (kind, cache, body) = get(&format!("{base}/stats?user=sized&scale=9"), &[]).await;
        assert_eq!((kind.as_str(), cache.as_str(), dims(&body)), ("error", DEMO, (1600, 640)), "a bad option never changes");
    }

    #[test]
    fn placeholder_text_by_pause() {
        assert_eq!(placeholder_text(10, false), "The scribe is inking your sheet... ready in ~10 s");
        assert_eq!(placeholder_text(1381, true), "GitHub asks us to wait. You're in the priority queue, ready in ~24 min");
        assert_eq!(placeholder_text(5, true), "GitHub asks us to wait. You're in the priority queue, ready in ~1 min");
    }

    #[tokio::test]
    async fn placeholder_answers_during_a_pause() {
        let (base, app) = serve(QueueConfig { workers: 0, ..Default::default() }).await;
        app.queue.pause_for(std::time::Duration::from_secs(600));
        let (kind, cache, body) = get(&format!("{base}/stats?user=paused"), &[]).await;
        assert_eq!((kind.as_str(), cache.as_str()), ("placeholder", NO_CACHE));
        assert!(is_webp(&body));
    }

    #[tokio::test]
    async fn errors_are_images() {
        let (base, _) = serve(QueueConfig::default()).await;
        for (url, want) in [("/stats", "error"), ("/stats?user=a--b", "error"), ("/languages?user=a&scene=castel", "error")] {
            let (kind, cache, _) = get(&format!("{base}{url}"), &[]).await;
            assert_eq!((kind.as_str(), cache.as_str()), (want, DEMO), "{url}: a bad URL never changes, cached a day");
        }
        assert_eq!(reqwest::get(format!("{base}/trophies?user=a")).await.unwrap().status(), 404);
        let (kind, _, _) = settled(&format!("{base}/stats?user=ghost")).await;
        assert_eq!(kind, "unknown");
    }

    #[tokio::test]
    async fn stale_data_still_draws_and_refreshes() {
        let (base, app) = serve(QueueConfig { workers: 0, ..Default::default() }).await;
        app.store.put(derive(&RawUser { login: "old".into(), ..Default::default() }, 0, 1)).unwrap();
        let (kind, cache, _) = get(&format!("{base}/stats?user=old"), &[]).await;
        assert_eq!((kind.as_str(), cache.as_str()), ("card", STALE));
        assert_eq!(app.queue.refresh_len(), 1, "refresh queued in its own lane");
    }

    #[tokio::test]
    async fn per_ip_limit_spares_githubs_image_proxy() {
        let (base, _) = serve(QueueConfig { workers: 0, per_ip_per_hour: 1, ..Default::default() }).await;
        let ip = ("cf-connecting-ip", "9.9.9.9");
        assert_eq!(get(&format!("{base}/stats?user=a1"), &[ip]).await.0, "placeholder");
        assert_eq!(get(&format!("{base}/stats?user=a2"), &[ip]).await.0, "busy");
        let camo = [ip, ("user-agent", "github-camo (876543)")];
        assert_eq!(get(&format!("{base}/stats?user=a3"), &camo).await.0, "placeholder");
        assert_eq!(get(&format!("{base}/stats?user=a4"), &camo).await.0, "placeholder");
    }

    #[tokio::test]
    async fn render_failure_is_a_fallback_image() {
        let res = failed();
        assert_eq!(res.status(), 200);
        let h = |n: &str| res.headers().get(n).unwrap().to_str().unwrap().to_string();
        assert_eq!(h("content-type"), crate::encode::CONTENT_TYPE);
        assert_eq!(h("cache-control"), NO_CACHE);
        assert_eq!(h("x-questlog"), "error");
        let body = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
        assert!(is_webp(&body));
    }

    async fn raw(url: &str) -> (u16, String, String, Vec<u8>) {
        let res = reqwest::get(url).await.unwrap();
        let h = |n: &str| res.headers().get(n).map(|v| v.to_str().unwrap().to_string()).unwrap_or_default();
        let (ct, cc) = (h("content-type"), h("cache-control"));
        (res.status().as_u16(), ct, cc, res.bytes().await.unwrap().to_vec())
    }

    #[tokio::test]
    async fn pages_and_static_files() {
        let (base, _) = serve(QueueConfig::default()).await;
        assert_eq!(content_type("cards/demo_stats.scale=2.webp"), "image/webp", "the site's own card copies");
        for (path, html) in [("/", true), ("/wiki", true), ("/builder", true), ("/static/index.html", true)] {
            let (st, ct, cc, body) = raw(&format!("{base}{path}")).await;
            assert_eq!((st, ct.as_str()), (200, "text/html; charset=utf-8"), "{path}");
            assert_eq!(cc, if path == "/static/index.html" { ASSET } else { PAGE }, "{path}");
            assert!(html && !body.is_empty());
        }
        for bad in ["/static/missing.css", "/static/", "/static/%2e%2e/Cargo.toml", "/static/..%2fCargo.toml", "/static/../Cargo.toml"] {
            assert_eq!(raw(&format!("{base}{bad}")).await.0, 404, "{bad}");
        }
        assert_eq!(content_type("a/b.woff2"), "font/woff2");
        assert_eq!(content_type("x.js"), "text/javascript; charset=utf-8");
        assert_eq!(content_type("x.svg"), "image/svg+xml");
    }

    #[tokio::test]
    async fn art_serves_scene_paintings_only() {
        let (base, _) = serve(QueueConfig::default()).await;
        for f in ["stats.png", "languages-night.png", "streak.png", "streak-night.png"] {
            let (st, ct, cc, body) = raw(&format!("{base}/art/castle-aurora/{f}")).await;
            assert_eq!((st, ct.as_str(), cc.as_str()), (200, "image/png", ASSET), "{f}");
            assert_eq!(dims(&body), (320, 128), "{f}");
        }
        for bad in ["/art/_shared/stats.png", "/art/_shared/sprites/x.png", "/art/castle/scene.json", "/art/castle/stats.json",
            "/art/castle/nope.png", "/art/nowhere/stats.png", "/art/castle/sprites/a.png", "/art/castle"] {
            assert_eq!(raw(&format!("{base}{bad}")).await.0, 404, "{bad}");
        }
    }

    #[tokio::test]
    async fn demo_cards_use_the_sample_and_skip_the_store() {
        let (base, app) = serve(QueueConfig { workers: 0, ..Default::default() }).await;
        for w in ["stats", "languages", "streak"] {
            let (kind, cache, body) = get(&format!("{base}/demo/{w}?scale=2&animate=false&scene=castle&time=night"), &[]).await;
            assert_eq!((kind.as_str(), cache.as_str(), dims(&body)), ("card", DEMO, (640, 256)), "{w}");
        }
        let (kind, cache, body) = get(&format!("{base}/demo/streak?streak=45"), &[]).await;
        assert_eq!((kind.as_str(), cache.as_str(), dims(&body)), ("card", DEMO, (1600, 640)));
        let a = get(&format!("{base}/demo/streak?animate=false"), &[]).await.2;
        let b = get(&format!("{base}/demo/streak?animate=false&streak=45"), &[]).await.2;
        assert_ne!(a, b, "streak=N changes the card");
        let (kind, cache, _) = get(&format!("{base}/demo/streak?streak=10000"), &[]).await;
        assert_eq!((kind.as_str(), cache.as_str()), ("error", DEMO));
        let (kind, _, _) = get(&format!("{base}/demo/stats?scale=9"), &[]).await;
        assert_eq!(kind, "error");
        assert_eq!(reqwest::get(format!("{base}/demo/trophies")).await.unwrap().status(), 404);
        assert_eq!(app.queue.len(), 0, "never queued");
        assert!(app.store.get(DEMO_USER, now_secs()).is_none() && app.store.get("barandev", now_secs()).is_none(), "never stored");
    }

    #[tokio::test]
    async fn demo_messages() {
        let (base, app) = serve(QueueConfig { workers: 0, ..Default::default() }).await;
        for (k, want) in [("placeholder", "placeholder"), ("quota", "placeholder"), ("unknown", "unknown"), ("busy", "busy"),
            ("failed", "failed"), ("error", "error")] {
            let (kind, cache, body) = get(&format!("{base}/demo/message?kind={k}&scale=1"), &[]).await;
            assert_eq!((kind.as_str(), cache.as_str(), dims(&body)), (want, DEMO, (320, 128)), "{k}");
        }
        let (kind, _, body) = get(&format!("{base}/demo/message?kind=busy&widget=streak&scene=castle&time=night"), &[]).await;
        assert_eq!((kind.as_str(), dims(&body)), ("busy", (1600, 640)));
        for bad in ["kind=nope", "", "kind=busy&widget=x"] {
            assert_eq!(reqwest::get(format!("{base}/demo/message?{bad}")).await.unwrap().status(), 404, "{bad}");
        }
        assert_eq!(app.queue.len(), 0);
    }

    #[tokio::test]
    async fn health_reports() {
        let (base, _) = serve(QueueConfig::default()).await;
        let v: serde_json::Value = reqwest::get(format!("{base}/health")).await.unwrap().json().await.unwrap();
        assert_eq!(v["ok"], true);
        assert_eq!(v["new_users"]["open"], true);
        assert!(v.get("github").is_none() && v.get("quota").is_none(), "no capacities in public: {v}");
        let full: serde_json::Value = reqwest::get(format!("{base}/admin/health")).await.unwrap().json().await.unwrap();
        assert_eq!(full["new_users"]["per_hour"], 600);
        assert!(full["traffic"].as_array().is_some_and(|t| t.len() == 60) && full["recent"].is_array(), "{full}");
        let client = reqwest::Client::new();
        for path in ["/admin/health", "/admin/status", "/static/admin/status.html"] {
            let r = client.get(format!("{base}{path}")).header("cf-ray", "x").send().await.unwrap();
            assert_eq!(r.status(), 404, "{path} through Cloudflare without a login");
        }
        let scenes = v["scenes"].as_array().unwrap();
        assert!(scenes.contains(&serde_json::json!("forest")), "{scenes:?}");
        assert!(!scenes.contains(&serde_json::json!("_shared")), "shared art is not a scene");
    }

    #[tokio::test]
    async fn hostile_text_renders_fast() {
        let (base, app) = serve(QueueConfig { workers: 0, ..Default::default() }).await;
        app.store.put(derive(&RawUser { login: "kanji".into(), ..Default::default() }, 0, now_secs())).unwrap();
        let han = "漢".repeat(60);
        let labels: Vec<String> = ["level", "commits", "prs", "repos", "stars", "issues", "reviews", "followers", "contributions"]
            .iter()
            .map(|k| format!("{k}:{han}"))
            .collect();
        let note = format!("{han}|{han}|{han}");
        let url = format!(
            "{base}/stats?user=kanji&title={han}&subtitle={han}&labels={0}&values={0}&note={note}&title_color=fff&text_color=%23123456",
            labels.join(",")
        );
        let start = std::time::Instant::now();
        let (kind, _, _) = get(&url, &[]).await;
        assert_eq!(kind, "card");
        assert!(start.elapsed() < std::time::Duration::from_secs(1), "took {:?}", start.elapsed());
    }

    #[tokio::test]
    async fn decorations_take_only_their_own_options() {
        let (base, _) = serve(QueueConfig { workers: 0, ..Default::default() }).await;
        let (kind, cache, body) = get(&format!("{base}/decorations/workbench?title=Technical%20Skills"), &[]).await;
        assert_eq!((kind.as_str(), cache.as_str()), ("card", DEMO));
        assert!(body.len() > 1000);
        assert_eq!(get(&format!("{base}/decorations/forest-divider"), &[]).await.0, "card", "no title needed");
        assert_eq!(get(&format!("{base}/decorations/workbench?user=octo"), &[]).await.0, "error", "a card option");
        assert_eq!(get(&format!("{base}/decorations/nope"), &[]).await.0, "error", "an unknown decoration");
    }

    #[tokio::test]
    async fn the_short_path_draws_the_same_card() {
        let (base, app) = serve(QueueConfig { workers: 0, ..Default::default() }).await;
        app.store.put(derive(&RawUser { login: "octo".into(), ..Default::default() }, 0, now_secs())).unwrap();
        for (short, long) in [
            ("/octo/stats", "/stats?user=octo"),
            ("/octo/streak/castle", "/streak?user=octo&scene=castle"),
            ("/octo/languages/forest-misty/night?langs=3", "/languages?user=octo&scene=forest-misty&time=night&langs=3"),
        ] {
            let (a, b) = (get(&format!("{base}{short}"), &[]).await, get(&format!("{base}{long}"), &[]).await);
            assert_eq!((a.0.as_str(), &a.2), ("card", &b.2), "{short}");
        }
        assert_eq!(get(&format!("{base}/octo/stats/castel"), &[]).await.0, "error", "a bad scene is the error card");
        assert_eq!(reqwest::get(format!("{base}/octo/trophies")).await.unwrap().status(), 404);
        assert_eq!(get(&format!("{base}/demo/stats"), &[]).await.0, "card", "/demo stays the demo");
    }

    #[tokio::test]
    async fn a_card_asked_again_is_not_rendered_again() {
        let (base, app) = serve(QueueConfig { workers: 0, ..Default::default() }).await;
        get(&format!("{base}/demo/stats?scene=castle"), &[]).await;
        get(&format!("{base}/demo/stats?scene=castle&v=2&junk=1"), &[]).await; // junk parameters: the same card
        let (entries, _, hits, misses) = app.cache.stats();
        assert_eq!((entries, hits, misses), (1, 1, 1));
    }

    #[tokio::test]
    async fn one_ip_cant_keep_the_renderer_busy() {
        let (base, _) = serve(QueueConfig { workers: 0, ..Default::default() }).await;
        let ip = [("cf-connecting-ip", "6.6.6.6")];
        for i in 0..RENDERS_PER_IP_MINUTE {
            assert_eq!(get(&format!("{base}/demo/stats?title=t{i}"), &ip).await.0, "card");
        }
        let (kind, cache, _) = get(&format!("{base}/demo/stats?title=over"), &ip).await;
        assert_eq!((kind.as_str(), cache.as_str()), ("busy", NO_CACHE), "one client's limit is never cached at the edge");
        let (kind, _, _) = get(&format!("{base}/demo/stats?title=t0"), &ip).await;
        assert_eq!(kind, "card", "a card already drawn costs nothing");
        let camo = [("cf-connecting-ip", "6.6.6.6"), ("user-agent", "github-camo (1)")];
        assert_eq!(get(&format!("{base}/demo/stats?title=proxy"), &camo).await.0, "card", "GitHub's proxy is not limited");
    }

    #[tokio::test]
    async fn an_overloaded_renderer_answers_busy_instead_of_timing_out() {
        let (base, app) = serve(QueueConfig { workers: 0, ..Default::default() }).await;
        let _all = app.renders.clone().acquire_many_owned(2).await.unwrap();
        let start = std::time::Instant::now();
        let (kind, cache, _) = get(&format!("{base}/demo/stats?scene=forest-misty"), &[]).await;
        assert_eq!((kind.as_str(), cache.as_str()), ("busy", SHED));
        assert!(start.elapsed() < SHED_AFTER + Duration::from_secs(2), "took {:?}", start.elapsed());
    }

    #[tokio::test]
    async fn permit_is_held_until_the_render_ends() {
        let (_, app) = serve(QueueConfig { workers: 0, ..Default::default() }).await;
        let held = app.renders.clone().acquire_owned().await.unwrap();
        let (tx, rx) = std::sync::mpsc::channel::<()>();
        let a = app.clone();
        let handle = tokio::spawn(async move {
            render_image(&a, 1, Widget::Stats, None, READY, "card", move || {
                rx.recv().ok();
                None
            })
            .await
        });
        drop(held);
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        assert_eq!(app.renders.available_permits(), 1, "render holds one permit");
        handle.abort(); // the client disconnects
        let _ = handle.await;
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        assert_eq!(app.renders.available_permits(), 1, "permit outlives the dropped handler");
        tx.send(()).unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        assert_eq!(app.renders.available_permits(), 2, "released when the render ends");
    }
}
