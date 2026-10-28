//! Cards: the short and long addresses, the demo cards, and drawing a card or a message once per look.
use super::*;

/// /<user>/<card>[/<scene>[/<time>]]: the same card as /<card>?user=..&scene=..&time=..; the path wins over the
/// query, and every other option still goes in the query.
pub(super) async fn card_at<F: Fetcher>(
    State(app): State<Arc<App<F>>>,
    Path(parts): Path<Vec<String>>,
    Query(mut q): Query<HashMap<String, String>>,
    uri: Uri,
    headers: HeaderMap,
) -> Response {
    let mut parts = parts.into_iter();
    let (Some(user), Some(widget)) = (parts.next(), parts.next()) else {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    };
    q.insert("user".into(), user);
    for key in ["scene", "time"] {
        if let Some(v) = parts.next() {
            q.insert(key.into(), v);
        }
    }
    serve_card(app, widget, q, &uri, headers).await
}

pub(super) async fn card<F: Fetcher>(
    State(app): State<Arc<App<F>>>,
    Path(path): Path<String>,
    Query(q): Query<HashMap<String, String>>,
    uri: Uri,
    headers: HeaderMap,
) -> Response {
    serve_card(app, path, q, &uri, headers).await
}

pub(super) async fn serve_card<F: Fetcher>(
    app: Arc<App<F>>,
    path: String,
    q: HashMap<String, String>,
    uri: &Uri,
    headers: HeaderMap,
) -> Response {
    let Some(w) = Widget::from_path(&path) else { return (StatusCode::NOT_FOUND, "not found").into_response() };
    let ip = client_ip(&headers);
    let ip = ip.as_deref();
    let req = match params::parse(w, &q, &app.assets.scene_names()) {
        Ok(r) => r,
        Err(e) => return message_cached(&app, w, e.look, e.message, "error", DEMO, ip).await,
    };
    let now = now_secs();
    if let Some((stats, fresh)) = app.store.get(&req.user, now) {
        if !fresh {
            app.queue.refresh(&req.user); // its own lane: never counts against an IP or the new-login cap
        }
        if let Some(readme) = person_asking(&headers) {
            app.store.people.card(&req.user, &uri.to_string(), readme, now);
        }
        return draw(&app, req, stats, fresh, ip).await;
    }
    if app.store.is_unknown(&req.user, now) {
        return message(&app, w, req.look, UNKNOWN.into(), "unknown", ip).await;
    }
    match app.queue.enqueue(&req.user, ip) {
        Enqueued::Waiting { eta_secs, paused } => {
            message(&app, w, req.look, placeholder_text(eta_secs, paused), "placeholder", ip).await
        }
        Enqueued::Full | Enqueued::IpLimited => message(&app, w, req.look, BUSY.into(), "busy", ip).await,
        Enqueued::Failed => message(&app, w, req.look, FAILED.into(), "failed", ip).await,
    }
}

/// The built-in adventurer, with an optional `streak=N` (0-9999) to show the fire tiers. Never touches the store
/// or the queue.
pub(super) async fn demo_card<F: Fetcher>(
    State(app): State<Arc<App<F>>>,
    Path(path): Path<String>,
    Query(mut q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let Some(w) = Widget::from_path(&path) else { return (StatusCode::NOT_FOUND, "not found").into_response() };
    let ip = client_ip(&headers);
    let ip = ip.as_deref();
    let streak = q.remove("streak");
    q.insert("user".into(), DEMO_USER.into());
    let req = match params::parse(w, &q, &app.assets.scene_names()) {
        Ok(r) => r,
        Err(e) => return message_cached(&app, w, e.look, e.message, "error", DEMO, ip).await,
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
                return message_cached(&app, w, req.look, msg, "error", DEMO, ip).await;
            }
        }
    }
    stats.login = DEMO_USER.into();
    render_card(&app, req, stats, DEMO, ip).await
}

/// A message card for the pages: the same texts the live service uses.
pub(super) async fn demo_message<F: Fetcher>(
    State(app): State<Arc<App<F>>>,
    Query(mut q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let ip = client_ip(&headers);
    let ip = ip.as_deref();
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
        Err(e) => return message_cached(&app, w, e.look, e.message, "error", DEMO, ip).await,
    };
    message_cached(&app, w, look, text, kind, DEMO, ip).await
}

pub(super) fn placeholder_text(eta_secs: u64, paused: bool) -> String {
    if paused {
        let mins = eta_secs.div_ceil(60).max(1);
        format!("GitHub asks us to wait. You're in the priority queue, ready in ~{mins} min")
    } else {
        format!("The scribe is inking your sheet... ready in ~{eta_secs} s")
    }
}

pub(super) fn image(bytes: Vec<u8>, cache: &'static str, kind: &'static str) -> Response {
    let headers = [
        (header::CONTENT_TYPE, crate::encode::CONTENT_TYPE),
        (header::CACHE_CONTROL, cache),
        (HeaderName::from_static("x-questlog"), kind),
    ];
    (headers, bytes).into_response()
}

/// A render or encode failure still answers 200 with an image (anything else is a broken image on GitHub): a
/// plain dark panel that does not depend on the renderer.
pub(super) fn failed() -> Response {
    static FALLBACK: OnceLock<Vec<u8>> = OnceLock::new();
    let bytes = FALLBACK.get_or_init(|| {
        let mut img = Image::new(320, 128);
        img.px.fill([0x1C, 0x12, 0x0A, 0xFF]);
        encode(&[img], None, 5).unwrap_or_default()
    });
    served(image(bytes.clone(), NO_CACHE, "error"), "drawing failed, plain fallback panel".into())
}

/// How a card response was made, read by the request log.
#[derive(Clone)]
pub(crate) struct Served(pub String);

pub(super) fn served(mut r: Response, how: String) -> Response {
    r.extensions_mut().insert(Served(how));
    r
}

/// A look as a cache key part: its maps sorted, so equal looks give equal keys.
pub(super) fn look_key(look: &Look) -> String {
    let mut rest = look.clone();
    let mut labels: Vec<_> = std::mem::take(&mut rest.labels).into_iter().collect();
    let mut values: Vec<_> = std::mem::take(&mut rest.values).into_iter().collect();
    let mut hide: Vec<_> = std::mem::take(&mut rest.hide).into_iter().collect();
    labels.sort();
    values.sort();
    hide.sort();
    format!("{rest:?}{labels:?}{values:?}{hide:?}")
}

/// The busy card, drawn once at start. `cache` is SHED for an overload (everyone's problem for a minute) and
/// NO_CACHE for a used-up IP budget (that client's problem only, so an edge must not hand it to everyone).
pub(super) fn shed<F: Fetcher>(app: &App<F>, w: Widget, cache: &'static str) -> Response {
    match app.shed.get(&w) {
        Some(bytes) => image(bytes.clone(), cache, "busy"),
        None => failed(),
    }
}

/// A card from the render cache, or rendered on the blocking pool and kept. The permit moves into the closure, so
/// the render cap holds until the render really ends, even when the client has already gone away.
pub(super) async fn render_image<F: Fetcher>(
    app: &Arc<App<F>>,
    key: u64,
    w: Widget,
    ip: Option<&str>,
    cache: &'static str,
    kind: &'static str,
    job: impl FnOnce() -> Option<Vec<u8>> + Send + 'static,
) -> Response {
    if let Some((bytes, place)) = app.cache.lookup(key) {
        let how = if place == "memory" { "from the memory cache" } else { "from the disk cache (now kept in memory too)" };
        return served(image((*bytes).clone(), cache, kind), how.into());
    }
    let started = std::time::Instant::now();
    if ip.is_some_and(|ip| !app.ip_renders.take(ip)) {
        return served(shed(app, w, NO_CACHE), "busy, this visitor used its renders for the minute".into());
    }
    let permit = match tokio::time::timeout(SHED_AFTER, app.renders.clone().acquire_owned()).await {
        Ok(Ok(permit)) => permit,
        Ok(Err(_)) => return failed(),
        Err(_) => return served(shed(app, w, SHED), "busy, both render slots stayed full for 2 s".into()),
    };
    let waited = started.elapsed().as_millis();
    let out = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        let t = std::time::Instant::now();
        job().map(|b| (b, t.elapsed().as_millis()))
    });
    match out.await.ok().flatten() {
        Some((bytes, drew)) => {
            let bytes = Arc::new(bytes);
            app.cache.put(key, bytes.clone());
            let wait = if waited > 0 { format!(" after {waited} ms waiting for a render slot") } else { String::new() };
            let how = format!("not in cache, drawn in {drew} ms{wait}, saved to memory and disk");
            served(image((*bytes).clone(), cache, kind), how)
        }
        None => {
            crate::error!("cache", "drawing a {} card failed, answered the plain fallback panel", w.key());
            failed()
        }
    }
}

pub(super) async fn draw<F: Fetcher>(app: &Arc<App<F>>, req: Request, stats: UserStats, fresh: bool, ip: Option<&str>) -> Response {
    render_card(app, req, stats, if fresh { READY } else { STALE }, ip).await
}

pub(super) async fn render_card<F: Fetcher>(
    app: &Arc<App<F>>,
    req: Request,
    stats: UserStats,
    cache: &'static str,
    ip: Option<&str>,
) -> Response {
    let key = cache::key(&["card", req.widget.key(), &look_key(&req.look), &format!("{stats:?}")]);
    let assets = app.assets.clone();
    let w = req.widget;
    render_image(app, key, w, ip, cache, "card", move || {
        let d = widgets::render(&assets, req.widget, &req.look, &stats)?;
        encode(&d.frames, d.title.as_ref(), req.look.scale).ok()
    })
    .await
}

pub(super) async fn message<F: Fetcher>(
    app: &Arc<App<F>>,
    w: Widget,
    look: Look,
    msg: String,
    kind: &'static str,
    ip: Option<&str>,
) -> Response {
    message_cached(app, w, look, msg, kind, NO_CACHE, ip).await
}

pub(super) async fn message_cached<F: Fetcher>(
    app: &Arc<App<F>>,
    w: Widget,
    look: Look,
    msg: String,
    kind: &'static str,
    cache: &'static str,
    ip: Option<&str>,
) -> Response {
    let key = cache::key(&["message", w.key(), &look_key(&look), &msg]);
    let assets = app.assets.clone();
    render_image(app, key, w, ip, cache, kind, move || {
        let d = widgets::message(&assets, w, &look, &msg)?;
        encode(&d.frames, d.title.as_ref(), look.scale).ok()
    })
    .await
}

/// A decoration: a painted banner for a README section, with an optional title.
pub(super) async fn decoration<F: Fetcher>(
    State(app): State<Arc<App<F>>>,
    Path(name): Path<String>,
    Query(q): Query<HashMap<String, String>>,
    uri: Uri,
    headers: HeaderMap,
) -> Response {
    let ip = client_ip(&headers);
    let ip = ip.as_deref();
    let error = |msg: String| message_cached(&app, Widget::Stats, Look::default(), msg, "error", DEMO, ip);
    let opts = match crate::decorations::parse(&q) {
        Ok(o) => o,
        Err(msg) => return error(msg).await,
    };
    if !app.assets.decorations.contains_key(&name) {
        let mut names: Vec<&str> = app.assets.decorations.keys().map(String::as_str).collect();
        names.sort();
        return error(format!("Unknown decoration '{}' (use {})", params::clip(&name), names.join(", "))).await;
    }
    // the site's own pages show decorations too: only the builder and READMEs are someone making one
    let from_builder = headers.get(header::REFERER).and_then(|v| v.to_str().ok()).is_some_and(|r| r.contains("/builder"));
    if let Some(readme) = person_asking(&headers).filter(|&readme| readme || from_builder) {
        app.store.people.decoration(&uri.to_string(), readme, now_secs());
    }
    let key = cache::key(&["decoration", &name, &format!("{opts:?}")]);
    let assets = app.assets.clone();
    render_image(&app, key, Widget::Stats, ip, DEMO, "card", move || {
        let (drawn, ms) = crate::decorations::render(&assets, &name, &opts)?;
        crate::encode::encode_at(&drawn.frames, drawn.title.as_ref(), opts.scale, ms).ok()
    })
    .await
}
