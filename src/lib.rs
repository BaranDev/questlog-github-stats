//! questlog: pixel-art GitHub profile cards.
pub mod canvas;
pub mod dates;

pub type BoxError = Box<dyn std::error::Error + Send + Sync>;
