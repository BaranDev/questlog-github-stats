//! Plain readable log lines on stderr, which Docker keeps:
//!
//! ```text
//! 2026-10-20 14:32:01  INFO   http     GET /octocat/stats -> 200 card, drawn now | 41 ms | 18.2 KB | TR | GitHub image proxy | ray 8d1f2a3b4c5d-FRA
//! ```
//!
//! Columns: UTC time, level (INFO, WARN, ERROR), area (start, http, queue, github, cache, status), then the event
//! in words. Client IPs are never written; Cloudflare's ray id finds the same request in its dashboard.
use crate::dates::civil_from_days;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn line(level: &str, area: &str, msg: std::fmt::Arguments) {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    eprintln!("{}  {level:<5}  {area:<7}  {msg}", stamp(secs));
}

/// `2026-10-20 14:32:01` for a Unix time in seconds (UTC).
pub fn stamp(secs: u64) -> String {
    let (y, m, d) = civil_from_days((secs / 86400) as i64);
    let s = secs % 86400;
    format!("{y}-{m:02}-{d:02} {:02}:{:02}:{:02}", s / 3600, s / 60 % 60, s % 60)
}

/// `14:32 UTC` for a Unix time, for "paused until" lines.
pub fn clock(secs: u64) -> String {
    let s = secs % 86400;
    format!("{:02}:{:02} UTC", s / 3600, s / 60 % 60)
}

/// `18.2 KB`, `1.4 MB`.
pub fn size(bytes: u64) -> String {
    match bytes {
        b if b < 1024 => format!("{b} B"),
        b if b < 1 << 20 => format!("{:.1} KB", b as f64 / 1024.0),
        b => format!("{:.1} MB", b as f64 / (1 << 20) as f64),
    }
}

#[macro_export]
macro_rules! info {
    ($area:expr, $($arg:tt)*) => { $crate::log::line("INFO", $area, format_args!($($arg)*)) };
}

#[macro_export]
macro_rules! warn {
    ($area:expr, $($arg:tt)*) => { $crate::log::line("WARN", $area, format_args!($($arg)*)) };
}

#[macro_export]
macro_rules! error {
    ($area:expr, $($arg:tt)*) => { $crate::log::line("ERROR", $area, format_args!($($arg)*)) };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats() {
        assert_eq!(stamp(1_792_506_721), "2026-10-20 14:32:01");
        assert_eq!(clock(1_792_506_721), "14:32 UTC");
        assert_eq!(size(512), "512 B");
        assert_eq!(size(18_637), "18.2 KB");
        assert_eq!(size(1_468_006), "1.4 MB");
    }
}
