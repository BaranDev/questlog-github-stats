//! questlog: pixel-art GitHub profile cards.
pub mod canvas;
pub mod dates;
pub mod encode;
pub mod raster;
pub mod text;

pub type BoxError = Box<dyn std::error::Error + Send + Sync>;
