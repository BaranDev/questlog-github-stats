//! The site's pages and files, and the scene paintings the pages show.
use super::*;

mod embedded_static {
    include!(concat!(env!("OUT_DIR"), "/static_files.rs"));
}

pub(super) fn content_type(path: &str) -> &'static str {
    match path.rsplit_once('.').map(|(_, e)| e).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "json" => "application/json",
        "xml" => "application/xml; charset=utf-8",
        "txt" => "text/plain; charset=utf-8",
        "png" => "image/png",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

/// A file from the embedded static/ table, matched exactly, so no path can reach anything else.
pub(super) fn static_file(path: &str, cache: &'static str) -> Response {
    match embedded_static::STATIC_FILES.iter().find(|(n, _)| *n == path) {
        Some((_, bytes)) => {
            ([(header::CONTENT_TYPE, content_type(path)), (header::CACHE_CONTROL, cache)], *bytes).into_response()
        }
        None => (StatusCode::NOT_FOUND, "not found").into_response(),
    }
}

/// The scene paintings, for the pages: `<scene>/<widget>[-night].png` of a real scene, nothing else from art/.
pub(super) async fn art<F: Fetcher>(State(app): State<Arc<App<F>>>, Path((scene, file)): Path<(String, String)>) -> Response {
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
