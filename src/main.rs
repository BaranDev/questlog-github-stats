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
use tokio::sync::Semaphore;

#[tokio::main]
async fn main() -> Result<(), questlog::BoxError> {
    let token = std::env::var("GITHUB_TOKEN").map_err(|_| "GITHUB_TOKEN is required")?;
    let data = std::env::var("DATA_DIR").unwrap_or_else(|_| "/data".into());
    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);

    let store = Arc::new(Store::open(&data)?);
    let queue = Queue::new(GitHub::new(Http::new(token)?), store.clone(), QueueConfig::default());
    queue.start();
    let sweeper = store.clone();
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(3600));
        loop {
            tick.tick().await;
            match sweeper.sweep(now_secs()) {
                Ok(0) => {}
                Ok(n) => eprintln!("sweep: removed {n} users"),
                Err(e) => eprintln!("sweep: {e}"),
            }
        }
    });

    let app = Arc::new(App { assets: Arc::new(Assets::embedded()?), store, queue, renders: Arc::new(Semaphore::new(2)) });
    // HOST=127.0.0.1 keeps a local run off the network; the container needs the default.
    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let listener = tokio::net::TcpListener::bind((host.as_str(), port)).await?;
    eprintln!("questlog listening on {host}:{port}");
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
