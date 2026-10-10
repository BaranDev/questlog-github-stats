//! UTC calendar math on days since 1970-01-01 (Howard Hinnant's algorithms). Enough for streaks and GitHub
//! timestamps without a date crate.

pub fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m as i64 + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

pub fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

pub fn parse_date(s: &str) -> Option<i64> {
    let mut it = s.get(..10)?.split('-');
    let (y, m, d) = (it.next()?.parse().ok()?, it.next()?.parse().ok()?, it.next()?.parse().ok()?);
    ((1..=12).contains(&m) && (1..=31).contains(&d)).then(|| days_from_civil(y, m, d))
}

pub fn parse_utc(s: &str) -> Option<u64> {
    let day = parse_date(s)?;
    let t = s.get(11..19)?;
    let mut it = t.split(':').map(|p| p.parse::<u64>().ok());
    let (h, mi, se) = (it.next()??, it.next()??, it.next()??);
    Some(day as u64 * 86400 + h * 3600 + mi * 60 + se)
}

pub fn now_secs() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

pub fn day_of(secs: u64) -> i64 {
    (secs / 86400) as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn civil_roundtrip() {
        assert_eq!(days_from_civil(1970, 1, 1), 0);
        assert_eq!(days_from_civil(2000, 3, 1), 11017);
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        for (y, m, d) in [(2024, 2, 29), (2026, 1, 1), (2025, 12, 31), (1999, 3, 1)] {
            assert_eq!(civil_from_days(days_from_civil(y, m, d)), (y, m, d));
        }
    }

    #[test]
    fn parsing() {
        assert_eq!(parse_date("2026-01-05"), Some(days_from_civil(2026, 1, 5)));
        assert_eq!(parse_date("2026-13-05"), None);
        assert_eq!(parse_date("junk"), None);
        let noon = days_from_civil(2026, 10, 11) as u64 * 86400 + 43200;
        assert_eq!(parse_utc("2026-10-11T12:00:00Z"), Some(noon));
        assert_eq!(day_of(noon), days_from_civil(2026, 10, 11));
    }
}
