//! Raw GitHub data → the numbers the cards show. Pure functions; fetching lives in github.rs.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, Default)]
pub struct RawUser {
    pub login: String,
    pub followers: u64,
    pub prs: u64,
    pub issues: u64,
    pub repo_count: u64,
    pub repos: Vec<RawRepo>,
    pub years: Vec<RawYear>,
}

#[derive(Clone, Debug, Default)]
pub struct RawRepo {
    pub stars: u64,
    pub languages: Vec<(String, u64)>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct RawYear {
    pub commits: u64,
    pub reviews: u64,
    pub days: Vec<(i64, u64)>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UserStats {
    pub login: String,
    pub level: u32,
    pub xp: f64,
    pub commits: u64,
    pub prs: u64,
    pub repos: u64,
    pub stars: u64,
    pub issues: u64,
    pub reviews: u64,
    pub followers: u64,
    pub contributions: u64,
    pub languages: Vec<(String, f64)>,
    pub class: String,
    pub current_streak: u32,
    pub best_streak: u32,
    pub fetched_at: u64,
}

/// Reaching level L+1 takes 25·L·(L+1) contributions, so each level costs 50 more than the one before.
pub fn level(total: u64) -> (u32, f64) {
    let mut lvl: u64 = 0;
    while 25 * (lvl + 1) * (lvl + 2) <= total {
        lvl += 1;
    }
    let xp = (total - 25 * lvl * (lvl + 1)) as f64 / (50 * (lvl + 1)) as f64;
    ((lvl + 1) as u32, (xp * 10000.0).round() / 10000.0)
}

/// Contributions per day. A day returned by two neighbouring yearly queries counts once.
pub fn by_day(years: &[RawYear]) -> HashMap<i64, u64> {
    years.iter().flat_map(|y| y.days.iter().copied()).collect()
}

/// (current, best). No contribution *yet today* doesn't break the current streak.
pub fn streaks(days: &HashMap<i64, u64>, today: i64) -> (u32, u32) {
    let Some((&lo, &hi)) = days.keys().min().zip(days.keys().max()) else { return (0, 0) };
    let has = |d: i64| days.get(&d).is_some_and(|&n| n > 0);
    let (mut best, mut run) = (0u32, 0u32);
    for d in lo..=hi {
        run = if has(d) { run + 1 } else { 0 };
        best = best.max(run);
    }
    let mut d = if has(today) { today } else { today - 1 };
    let mut current = 0;
    while has(d) {
        current += 1;
        d -= 1;
    }
    (current, best)
}

/// Top languages by code size across repos, as (name, share of the total). Ties sort by name.
pub fn languages(repos: &[RawRepo], top: usize) -> Vec<(String, f64)> {
    let mut sizes: HashMap<&str, u64> = HashMap::new();
    for r in repos {
        for (name, size) in &r.languages {
            *sizes.entry(name).or_default() += size;
        }
    }
    let total = sizes.values().sum::<u64>().max(1) as f64;
    let mut v: Vec<(&str, u64)> = sizes.into_iter().collect();
    v.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
    v.into_iter().take(top).map(|(n, s)| (n.to_string(), (s as f64 / total * 10000.0).round() / 10000.0)).collect()
}

/// Every class a top language can give, for the layout check that the stats card has room for the longest.
pub const CLASSES: [&str; 10] =
    ["Artificer", "Alchemist", "Blacksmith", "Ranger", "Paladin", "Knight", "Warlock", "Bard", "Rogue", "Adventurer"];

pub fn class_for(top: Option<&str>) -> &'static str {
    match top.unwrap_or("") {
        "TypeScript" | "JavaScript" => "Artificer",
        "Python" => "Alchemist",
        "Rust" => "Blacksmith",
        "Go" => "Ranger",
        "C#" => "Paladin",
        "Java" | "Kotlin" => "Knight",
        "C" | "C++" => "Warlock",
        "HTML" | "CSS" => "Bard",
        "Shell" | "PowerShell" => "Rogue",
        _ => "Adventurer",
    }
}

pub fn derive(raw: &RawUser, today: i64, now: u64) -> UserStats {
    let days = by_day(&raw.years);
    let contributions = days.values().sum();
    let (level, xp) = level(contributions);
    let (current_streak, best_streak) = streaks(&days, today);
    let languages = languages(&raw.repos, 10);
    UserStats {
        login: raw.login.to_lowercase(),
        level,
        xp,
        commits: raw.years.iter().map(|y| y.commits).sum(),
        prs: raw.prs,
        repos: raw.repo_count,
        stars: raw.repos.iter().map(|r| r.stars).sum(),
        issues: raw.issues,
        reviews: raw.years.iter().map(|y| y.reviews).sum(),
        followers: raw.followers,
        contributions,
        class: class_for(languages.first().map(|l| l.0.as_str())).to_string(),
        languages,
        current_streak,
        best_streak,
        fetched_at: now,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dates::days_from_civil as day;

    fn year(days: &[((i64, u32, u32), u64)]) -> RawYear {
        RawYear { commits: 0, reviews: 0, days: days.iter().map(|&((y, m, d), n)| (day(y, m, d), n)).collect() }
    }

    #[test]
    fn streaks_follow_python_version() {
        let y = year(&[((2026, 1, 1), 1), ((2026, 1, 2), 2), ((2026, 1, 3), 0), ((2026, 1, 4), 1), ((2026, 1, 5), 3), ((2026, 1, 6), 0)]);
        let dup = year(&[((2026, 1, 5), 3)]); // boundary day returned by two yearly queries
        let days = by_day(&[y, dup]);
        assert_eq!(streaks(&days, day(2026, 1, 6)), (2, 2), "nothing yet today: streak counts from yesterday");
        assert_eq!(streaks(&days, day(2026, 1, 7)), (0, 2), "a full empty day breaks it");
        assert_eq!(days.values().sum::<u64>(), 7, "the duplicated day counts once");
    }

    #[test]
    fn streaks_cross_leap_day_and_new_year() {
        let leap = by_day(&[year(&[((2024, 2, 28), 1), ((2024, 2, 29), 1), ((2024, 3, 1), 1)])]);
        assert_eq!(streaks(&leap, day(2024, 3, 1)), (3, 3));
        let ny = by_day(&[year(&[((2025, 12, 31), 2)]), year(&[((2026, 1, 1), 1)])]);
        assert_eq!(streaks(&ny, day(2026, 1, 1)), (2, 2));
        assert_eq!(streaks(&HashMap::new(), day(2026, 1, 1)), (0, 0));
    }

    #[test]
    fn levels() {
        assert_eq!(level(0), (1, 0.0));
        assert_eq!(level(49), (1, 0.98));
        assert_eq!(level(50), (2, 0.0));
        assert_eq!(level(150), (3, 0.0));
    }

    #[test]
    fn language_shares_and_class() {
        let repos = [
            RawRepo { stars: 0, languages: vec![("Python".into(), 300), ("HTML".into(), 100)] },
            RawRepo { stars: 0, languages: vec![("Python".into(), 100)] },
        ];
        assert_eq!(languages(&repos, 10), vec![("Python".to_string(), 0.8), ("HTML".to_string(), 0.2)]);
        assert_eq!(class_for(Some("Go")), "Ranger");
        assert_eq!(class_for(Some("Zig")), "Adventurer");
        assert_eq!(class_for(None), "Adventurer");
    }

    #[test]
    fn empty_account_still_derives() {
        let s = derive(&RawUser { login: "New-User".into(), ..Default::default() }, day(2026, 10, 11), 1);
        assert_eq!((s.login.as_str(), s.level, s.xp, s.current_streak, s.best_streak), ("new-user", 1, 0.0, 0, 0));
        assert_eq!((s.class.as_str(), s.languages.len(), s.contributions), ("Adventurer", 0, 0));
    }

    #[test]
    fn derive_sums_lifetime_numbers() {
        let mut y1 = year(&[((2025, 6, 1), 4)]);
        y1.commits = 10;
        y1.reviews = 2;
        let mut y2 = year(&[((2026, 6, 1), 6)]);
        y2.commits = 5;
        let raw = RawUser {
            login: "a".into(), followers: 3, prs: 4, issues: 5, repo_count: 2,
            repos: vec![RawRepo { stars: 7, languages: vec![("Rust".into(), 10)] }, RawRepo { stars: 1, languages: vec![] }],
            years: vec![y1, y2],
        };
        let s = derive(&raw, day(2026, 10, 11), 99);
        assert_eq!((s.commits, s.reviews, s.contributions, s.stars, s.repos), (15, 2, 10, 8, 2));
        assert_eq!((s.class.as_str(), s.fetched_at), ("Blacksmith", 99));
    }
}
