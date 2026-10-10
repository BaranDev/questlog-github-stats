//! questlog: pixel-art GitHub profile cards.
pub mod canvas;
pub mod card;
pub mod dates;
pub mod encode;
pub mod fmt;
pub mod github;
pub mod queue;
pub mod raster;
pub mod scene;
pub mod stats;
pub mod store;
pub mod text;
pub mod widgets;

pub type BoxError = Box<dyn std::error::Error + Send + Sync>;
