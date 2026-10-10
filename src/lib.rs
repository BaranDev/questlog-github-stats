//! questlog: pixel-art GitHub profile cards.
pub mod canvas;
pub mod dates;
pub mod encode;
pub mod github;
pub mod queue;
pub mod raster;
pub mod scene;
pub mod stats;
pub mod store;
pub mod text;

pub type BoxError = Box<dyn std::error::Error + Send + Sync>;
