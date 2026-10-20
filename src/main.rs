//! questlog: reads its settings from the environment, starts the fetch workers and the hourly cache sweep, and
//! serves until SIGTERM or Ctrl-C.
use questlog::dates::now_secs;
use questlog::github::{GitHub, Http};
use questlog::queue::{Queue, QueueConfig};
use questlog::scene::Assets;
use questlog::server::{App, router};
use questlog::store::Store;
use std::sync::Arc;
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), questlog::BoxError> {
    let token = std::env::var("GITHUB_TOKEN").map_err(|_| "GITHUB_TOKEN is required")?;
    let data = std::env::var("DATA_DIR").unwrap_or_else(|_| "/data".into());
    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);

    let store = Arc::new(Store::open(&data)?);
    let github = GitHub::new(Http::new(token)?).with_past_years(std::path::Path::new(&data).join("years"));
    // NEW_LOGINS_PER_HOUR raises the cap on first-time logins for a busy day; GitHub's quota still pauses fetching
    let mut cfg = QueueConfig::default();
    if let Some(n) = std::env::var("NEW_LOGINS_PER_HOUR").ok().and_then(|v| v.parse().ok()) {
        cfg.new_per_hour = n;
    }
    let new_per_hour = cfg.new_per_hour;
    let queue = Queue::new(github, store.clone(), cfg);
    queue.start();
    let sweeper = store.clone();
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(3600));
        loop {
            tick.tick().await;
            match sweeper.sweep(now_secs()) {
                Ok(0) => {}
                Ok(n) => questlog::info!("cache", "hourly sweep removed {n} users nobody asked for in a long time"),
                Err(e) => questlog::error!("cache", "hourly sweep of saved users failed: {e}"),
            }
        }
    });

    let cache = questlog::cache::RenderCache::new(questlog::server::CACHE_BYTES)
        .with_disk(std::path::Path::new(&data).join("renders"), env!("RENDER_VERSION"));
    let app = Arc::new(App::with_cache(Arc::new(Assets::embedded()?), store, queue, cache));
    let trim = app.clone();
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(3600));
        loop {
            tick.tick().await;
            let t = trim.clone();
            let n = tokio::task::spawn_blocking(move || t.cache.trim_disk(questlog::server::DISK_BYTES)).await.unwrap_or(0);
            if n > 0 {
                questlog::info!("cache", "disk over its budget: removed the {n} least recently used saved cards");
            }
        }
    });
    let status = app.clone();
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(900));
        tick.tick().await; // the first tick is immediate; the start line already says the state
        loop {
            tick.tick().await;
            questlog::server::log_status(&status);
        }
    });
    // HOST=127.0.0.1 keeps a local run off the network; the container needs the default.
    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let listener = tokio::net::TcpListener::bind((host.as_str(), port)).await?;
    questlog::info!(
        "start",
        "questlog {} (render version {}) listening on {host}:{port} | data in {data} | up to {new_per_hour} new users an hour",
        env!("CARGO_PKG_VERSION"),
        env!("RENDER_VERSION")
    );
    axum::serve(listener, router(app)).with_graceful_shutdown(shutdown()).await?;
    Ok(())
}

async fn shutdown() {
    #[cfg(unix)]
    {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).expect("SIGTERM handler");
        tokio::select! {
            _ = term.recv() => {}
            _ = tokio::signal::ctrl_c() => {}
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
