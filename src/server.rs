//! HTTP: the card routes, the preview page and /health. Every card response is a 200 PNG, because a non-200
//! shows as a broken image on GitHub. The X-Questlog header says which kind it is.
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
use tokio::sync::Semaphore;

pub const READY: &str = "public, max-age=43200";
/// Stale cards (a refresh is queued) must not sit in edge caches for hours.
pub const STALE: &str = "public, max-age=600";
pub const NO_CACHE: &str = "no-cache";
pub const PAGE: &str = "public, max-age=300";
pub const DEMO: &str = "public, max-age=86400";
const DEMO_USER: &str = "demo-adventurer";
const DEMO_STATS: &str = include_str!("../tests/fixtures/sample.json");
pub const ASSET: &str = "public, max-age=604800";
mod embedded_static {
    include!(concat!(env!("OUT_DIR"), "/static_files.rs"));
}
const UNKNOWN: &str = "No adventurer by that name";
const BUSY: &str = "The scriptorium is busy, try again soon";
const FAILED: &str = "The road is closed";

pub struct App<F: Fetcher> {
    pub assets: Arc<Assets>,
    pub store: Arc<Store>,
    pub queue: Queue<F>,
    pub renders: Arc<Semaphore>,
}

pub fn router<F: Fetcher>(app: Arc<App<F>>) -> Router {
    Router::new()
        .route("/", get(|| async { static_file("index.html", PAGE) }))
        .route("/wiki", get(|| async { static_file("wiki.html", PAGE) }))
        .route("/static/{*path}", get(|Path(p): Path<String>| async move { static_file(&p, ASSET) }))
        .route("/art/{scene}/{file}", get(art::<F>))
        .route("/demo/message", get(demo_message::<F>))
        .route("/demo/{widget}", get(demo_card::<F>))
        .route("/health", get(health::<F>))
        .route("/{widget}", get(card::<F>))
        .with_state(app)
}

fn content_type(path: &str) -> &'static str {
    match path.rsplit_once('.').map(|(_, e)| e).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "json" => "application/json",
        "txt" => "text/plain; charset=utf-8",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

/// A file from the embedded static/ table, matched exactly, so no path can reach anything else.
fn static_file(path: &str, cache: &'static str) -> Response {
    match embedded_static::STATIC_FILES.iter().find(|(n, _)| *n == path) {
        Some((_, bytes)) => {
            ([(header::CONTENT_TYPE, content_type(path)), (header::CACHE_CONTROL, cache)], *bytes).into_response()
        }
        None => (StatusCode::NOT_FOUND, "not found").into_response(),
    }
}

/// The scene paintings, for the pages: `<scene>/<widget>[-night].png` of a real scene, nothing else from art/.
async fn art<F: Fetcher>(State(app): State<Arc<App<F>>>, Path((scene, file)): Path<(String, String)>) -> Response {
    let ok = file.strip_suffix(".png").is_some_and(|f| {
        let f = f.strip_suffix("-night").unwrap_or(f);
        Widget::from_path(f).is_some()
    });
    if !ok || !app.assets.scene_names().contains(&scene.as_str()) {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    }
    match crate::scene::embedded::FILES.iter().find(|(n, _)| *n == format!("{scene}/{file}")) {
        Some((_, bytes)) => {
            ([(header::CONTENT_TYPE, "image/png"), (header::CACHE_CONTROL, ASSET)], *bytes).into_response()
        }
        None => (StatusCode::NOT_FOUND, "not found").into_response(),
    }
}

async fn health<F: Fetcher>(State(app): State<Arc<App<F>>>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "ok": true,
        "queue": app.queue.len(),
        "quota": app.queue.quota(),
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

async fn card<F: Fetcher>(
    State(app): State<Arc<App<F>>>,
    Path(path): Path<String>,
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let Some(w) = Widget::from_path(&path) else { return (StatusCode::NOT_FOUND, "not found").into_response() };
    let req = match params::parse(w, &q, &app.assets.scene_names()) {
        Ok(r) => r,
        Err(e) => return message(&app, w, e.look, e.message, "error").await,
    };
    let now = now_secs();
    if let Some((stats, fresh)) = app.store.get(&req.user, now) {
        if !fresh {
            app.queue.enqueue(&req.user, None); // a refresh of a known user never counts against an IP
        }
        return draw(&app, req, stats, fresh).await;
    }
    if app.store.is_unknown(&req.user, now) {
        return message(&app, w, req.look, UNKNOWN.into(), "unknown").await;
    }
    match app.queue.enqueue(&req.user, client_ip(&headers).as_deref()) {
        Enqueued::Waiting { eta_secs, paused } => {
            message(&app, w, req.look, placeholder_text(eta_secs, paused), "placeholder").await
        }
        Enqueued::Full | Enqueued::IpLimited => message(&app, w, req.look, BUSY.into(), "busy").await,
        Enqueued::Failed => message(&app, w, req.look, FAILED.into(), "failed").await,
    }
}

/// The built-in adventurer, with an optional `streak=N` (0-9999) for showing the fire tiers. Never touches the
/// store or the queue.
async fn demo_card<F: Fetcher>(
    State(app): State<Arc<App<F>>>,
    Path(path): Path<String>,
    Query(mut q): Query<HashMap<String, String>>,
) -> Response {
    let Some(w) = Widget::from_path(&path) else { return (StatusCode::NOT_FOUND, "not found").into_response() };
    let streak = q.remove("streak");
    q.insert("user".into(), DEMO_USER.into());
    let req = match params::parse(w, &q, &app.assets.scene_names()) {
        Ok(r) => r,
        Err(e) => return message(&app, w, e.look, e.message, "error").await,
    };
    let mut stats: UserStats = serde_json::from_str(DEMO_STATS).expect("demo stats parse");
    if let Some(v) = streak {
        match v.parse::<u32>() {
            Ok(n @ 0..=9999) => {
                stats.current_streak = n;
                stats.best_streak = stats.best_streak.max(n);
            }
            _ => {
                let msg = format!("Unknown streak '{}' (use 0 to 9999)", v.chars().take(20).collect::<String>());
                return message(&app, w, req.look, msg, "error").await;
            }
        }
    }
    stats.login = DEMO_USER.into();
    render_card(&app, req, stats, DEMO).await
}

/// A message card for the pages: the same texts the live service uses.
async fn demo_message<F: Fetcher>(State(app): State<Arc<App<F>>>, Query(mut q): Query<HashMap<String, String>>) -> Response {
    let kind = q.remove("kind").unwrap_or_default();
    let w = match q.remove("widget") {
        None => Widget::Stats,
        Some(k) => match Widget::from_path(&k) {
            Some(w) => w,
            None => return (StatusCode::NOT_FOUND, "not found").into_response(),
        },
    };
    let (kind, text): (&'static str, String) = match kind.as_str() {
        "placeholder" => ("placeholder", placeholder_text(10, false)),
        "quota" => ("placeholder", placeholder_text(24 * 60, true)),
        "unknown" => ("unknown", UNKNOWN.into()),
        "busy" => ("busy", BUSY.into()),
        "failed" => ("failed", FAILED.into()),
        "error" => ("error", "Unknown scene 'castel'".into()),
        _ => return (StatusCode::NOT_FOUND, "not found").into_response(),
    };
    q.insert("user".into(), DEMO_USER.into());
    let look = match params::parse(w, &q, &app.assets.scene_names()) {
        Ok(r) => r.look,
        Err(e) => return message(&app, w, e.look, e.message, "error").await,
    };
    message_cached(&app, w, look, text, kind, DEMO).await
}

/// The placeholder line: a quota pause says why and counts in minutes, a normal wait counts in seconds.
fn placeholder_text(eta_secs: u64, paused: bool) -> String {
    if paused {
        let mins = eta_secs.div_ceil(60).max(1);
        format!("GitHub asks us to wait. You're in the priority queue, ready in ~{mins} min")
    } else {
        format!("The scribe is inking your sheet... ready in ~{eta_secs} s")
    }
}

fn png(bytes: Vec<u8>, cache: &'static str, kind: &'static str) -> Response {
    let headers = [
        (header::CONTENT_TYPE, "image/png"),
        (header::CACHE_CONTROL, cache),
        (HeaderName::from_static("x-questlog"), kind),
    ];
    (headers, bytes).into_response()
}

/// A render or encode failure still answers 200 with a PNG, because anything else is a broken image on GitHub.
/// The body is a plain dark panel that does not depend on the renderer.
fn failed() -> Response {
    static FALLBACK: OnceLock<Vec<u8>> = OnceLock::new();
    let bytes = FALLBACK.get_or_init(|| {
        let mut img = Image::new(320, 128);
        img.px.fill([0x1C, 0x12, 0x0A, 0xFF]);
        encode(&[img], 5).unwrap_or_default()
    });
    png(bytes.clone(), NO_CACHE, "error")
}

/// Runs a render on the blocking pool. The permit moves into the closure, so the 2-render cap holds until the
/// render really ends, even when the client has already gone away.
async fn render_png<F: Fetcher>(
    app: &Arc<App<F>>,
    cache: &'static str,
    kind: &'static str,
    job: impl FnOnce() -> Option<Vec<u8>> + Send + 'static,
) -> Response {
    let Ok(permit) = app.renders.clone().acquire_owned().await else { return failed() };
    let out = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        job()
    });
    match out.await.ok().flatten() {
        Some(bytes) => png(bytes, cache, kind),
        None => failed(),
    }
}

async fn draw<F: Fetcher>(app: &Arc<App<F>>, req: Request, stats: UserStats, fresh: bool) -> Response {
    render_card(app, req, stats, if fresh { READY } else { STALE }).await
}

async fn render_card<F: Fetcher>(app: &Arc<App<F>>, req: Request, stats: UserStats, cache: &'static str) -> Response {
    let assets = app.assets.clone();
    render_png(app, cache, "card", move || {
        let frames = widgets::render(&assets, req.widget, &req.look, &stats)?;
        encode(&frames, req.look.scale).ok()
    })
    .await
}

async fn message<F: Fetcher>(app: &Arc<App<F>>, w: Widget, look: Look, msg: String, kind: &'static str) -> Response {
    message_cached(app, w, look, msg, kind, NO_CACHE).await
}

async fn message_cached<F: Fetcher>(
    app: &Arc<App<F>>,
    w: Widget,
    look: Look,
    msg: String,
    kind: &'static str,
    cache: &'static str,
) -> Response {
    let assets = app.assets.clone();
    render_png(app, cache, kind, move || encode(&[widgets::message(&assets, w, &look, &msg)?], look.scale).ok()).await
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
        let app = Arc::new(App { assets: Arc::new(Assets::embedded().unwrap()), store, queue, renders: Arc::new(Semaphore::new(2)) });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let r = router(app.clone());
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
        assert_eq!(h("content-type"), "image/png");
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
        assert!(body.starts_with(b"\x89PNG"));
        let (kind, cache, _) = settled(&format!("{base}/stats?user=octocat&time=night")).await;
        assert_eq!((kind.as_str(), cache.as_str()), ("card", READY));
        let (kind, _, _) = get(&format!("{base}/streak?user=octocat&animate=false"), &[]).await;
        assert_eq!(kind, "card", "one fetch serves every widget");
    }

    fn dims(png_bytes: &[u8]) -> (u32, u32) {
        let r = png::Decoder::new(std::io::Cursor::new(png_bytes)).read_info().unwrap();
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
        assert_eq!((kind.as_str(), cache.as_str(), dims(&body)), ("error", NO_CACHE, (1600, 640)));
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
        assert!(body.starts_with(b"\x89PNG"));
    }

    #[tokio::test]
    async fn errors_are_images() {
        let (base, _) = serve(QueueConfig::default()).await;
        for (url, want) in [("/stats", "error"), ("/stats?user=a--b", "error"), ("/languages?user=a&scene=castel", "error")] {
            let (kind, cache, _) = get(&format!("{base}{url}"), &[]).await;
            assert_eq!((kind.as_str(), cache.as_str()), (want, NO_CACHE), "{url}");
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
        assert_eq!(app.queue.len(), 1, "refresh queued");
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
        assert_eq!(h("content-type"), "image/png");
        assert_eq!(h("cache-control"), NO_CACHE);
        assert_eq!(h("x-questlog"), "error");
        let body = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
        assert!(body.starts_with(b"\x89PNG"));
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
        for (path, html) in [("/", true), ("/wiki", true), ("/static/index.html", true)] {
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
        assert_eq!((kind.as_str(), cache.as_str()), ("error", NO_CACHE));
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
    async fn permit_is_held_until_the_render_ends() {
        let (_, app) = serve(QueueConfig { workers: 0, ..Default::default() }).await;
        let held = app.renders.clone().acquire_owned().await.unwrap();
        let (tx, rx) = std::sync::mpsc::channel::<()>();
        let a = app.clone();
        let handle = tokio::spawn(async move {
            render_png(&a, READY, "card", move || {
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
