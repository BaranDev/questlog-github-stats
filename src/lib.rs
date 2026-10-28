//! questlog: pixel-art GitHub profile cards.
pub mod cache;
pub mod canvas;
pub mod card;
pub mod params;
pub mod people;
pub mod dates;
pub mod decorations;
pub mod encode;
pub mod fmt;
pub mod github;
pub mod log;
pub mod queue;
pub mod raster;
pub mod scene;
pub mod server;
pub mod stats;
pub mod store;
pub mod text;
pub mod widgets;

pub type BoxError = Box<dyn std::error::Error + Send + Sync>;
