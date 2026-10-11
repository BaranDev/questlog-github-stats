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
use axum::response::{Html, IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use tokio::sync::Semaphore;

pub const READY: &str = "public, max-age=43200";
/// Stale cards (a refresh is queued) must not sit in edge caches for hours.
pub const STALE: &str = "public, max-age=600";
pub const NO_CACHE: &str = "no-cache";
const INDEX: &str = include_str!("../static/index.html");
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
        .route("/", get(|| async { Html(INDEX) }))
        .route("/health", get(health::<F>))
        .route("/{widget}", get(card::<F>))
        .with_state(app)
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
    let assets = app.assets.clone();
    let cache = if fresh { READY } else { STALE };
    render_png(app, cache, "card", move || {
        let frames = widgets::render(&assets, req.widget, &req.look, &stats)?;
        encode(&frames, req.look.scale).ok()
    })
    .await
}

async fn message<F: Fetcher>(app: &Arc<App<F>>, w: Widget, look: Look, msg: String, kind: &'static str) -> Response {
    let assets = app.assets.clone();
    render_png(app, NO_CACHE, kind, move || encode(&[widgets::message(&assets, w, &look, &msg)?], look.scale).ok()).await
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
        let url = format!("{base}/stats?user=kanji&title={han}&subtitle={han}&labels={}", labels.join(","));
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
