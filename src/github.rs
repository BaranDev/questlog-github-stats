//! GitHub GraphQL client: a paged profile query and one aliased query for every contribution year, turned into
//! derived stats for the queue. Finished years are kept on disk per login, so a refresh asks only for the current
//! year (a full read every 30 days catches late changes to old years).
use crate::BoxError;
use crate::dates::{civil_from_days, day_of, now_secs, parse_date, parse_utc};
use crate::queue::{FetchError, Fetched, Fetcher, Quota};
use crate::stats::{RawRepo, RawUser, RawYear, derive};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::future::Future;
use std::path::PathBuf;

/// Finished years are trusted this long before every year is read again.
const YEARS_FOR_SECS: u64 = 30 * 86400;

/// <dir>/<login>.json: the contribution years before the current one, as read when they were already over.
#[derive(Serialize, Deserialize)]
struct PastYears {
    read_at: u64,  // when every year was last read in full
    first: i64,    // the account's first year then (a changed createdAt reads everything again)
    years: BTreeMap<i64, RawYear>,
}

pub trait Transport: Send + Sync + 'static {
    fn post(&self, body: Value) -> impl Future<Output = Result<Value, FetchError>> + Send;
}

const PROFILE: &str = "query($login: String!, $after: String) {
  rateLimit { limit remaining resetAt }
  user(login: $login) {
    login createdAt
    followers { totalCount } pullRequests { totalCount } issues { totalCount }
    repositories(first: 100, after: $after, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
      totalCount pageInfo { hasNextPage endCursor }
      nodes { stargazerCount languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name } } } }
    }
  }
}";
/// Heavy accounts exceed GitHub's resource limits when every year is asked for in one query.
const YEARS_PER_QUERY: i64 = 4;
const MAX_PAGES: usize = 10; // 1,000 repos

/// One aliased contributionsCollection per year: a collection may span one year at most.
fn years_query(first: i64, last: i64) -> String {
    let parts: String = (first..=last)
        .map(|y| {
            format!(
                "y{y}: contributionsCollection(from: \"{y}-01-01T00:00:00Z\", to: \"{y}-12-31T23:59:59Z\") {{ \
                 totalCommitContributions totalPullRequestReviewContributions \
                 contributionCalendar {{ weeks {{ contributionDays {{ date contributionCount }} }} }} }}\n"
            )
        })
        .collect();
    format!("query($login: String!) {{ rateLimit {{ limit remaining resetAt }} user(login: $login) {{\n{parts}}} }}")
}

pub struct GitHub<T> {
    t: T,
    past: Option<PathBuf>,
}

impl<T: Transport> GitHub<T> {
    pub fn new(t: T) -> Self {
        GitHub { t, past: None }
    }

    /// Keep finished years under `dir` (created if missing).
    pub fn with_past_years(mut self, dir: impl Into<PathBuf>) -> Self {
        let dir = dir.into();
        let _ = std::fs::create_dir_all(&dir);
        self.past = Some(dir);
        self
    }

    fn past_file(&self, login: &str) -> Option<PathBuf> {
        let safe = !login.is_empty() && login.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
        self.past.as_ref().filter(|_| safe).map(|d| d.join(format!("{}.json", login.to_ascii_lowercase())))
    }

    fn load_past(&self, login: &str, first: i64, now: u64) -> Option<PastYears> {
        let p: PastYears = serde_json::from_slice(&std::fs::read(self.past_file(login)?).ok()?).ok()?;
        (p.first == first && now.saturating_sub(p.read_at) < YEARS_FOR_SECS).then_some(p)
    }

    fn save_past(&self, login: &str, p: &PastYears) {
        if let (Some(path), Ok(bytes)) = (self.past_file(login), serde_json::to_vec(p)) {
            let tmp = path.with_extension("json.tmp");
            if std::fs::write(&tmp, bytes).is_ok() {
                let _ = std::fs::rename(&tmp, &path);
            }
        }
    }

    async fn query(&self, query: &str, vars: Value) -> Result<(Value, Option<Quota>), FetchError> {
        let body = self.t.post(json!({ "query": query, "variables": vars })).await?;
        if let Some(errs) = body["errors"].as_array() {
            if errs.iter().any(|e| e["type"] == "NOT_FOUND") {
                return Err(FetchError::NotFound);
            }
            if errs.iter().any(|e| e["type"] == "RATE_LIMITED") {
                let reset_at = quota(&body).map_or(now_secs() + 3600, |q| q.reset_at);
                return Err(FetchError::RateLimited { reset_at });
            }
            return Err(FetchError::Transient(format!("graphql: {}", errs.first().map(|e| e["message"].to_string()).unwrap_or_default())));
        }
        if !body["data"].is_object() {
            return Err(FetchError::Transient("graphql: response without data".into()));
        }
        if body["data"]["user"].is_null() {
            return Err(FetchError::NotFound);
        }
        Ok((body["data"]["user"].clone(), quota(&body)))
    }

    pub async fn raw(&self, login: &str) -> Result<(RawUser, Option<Quota>), FetchError> {
        let (mut user, mut after, mut repos) = (Value::Null, Value::Null, Vec::new());
        for _ in 0..MAX_PAGES {
            let (page, _) = self.query(PROFILE, json!({"login": login, "after": after})).await?;
            let conn = &page["repositories"];
            repos.extend(conn["nodes"].as_array().into_iter().flatten().map(repo));
            let more = conn["pageInfo"]["hasNextPage"].as_bool().unwrap_or(false);
            after = conn["pageInfo"]["endCursor"].clone();
            if user.is_null() {
                user = page;
            }
            if !more {
                break;
            }
        }
        let first: i64 = user["createdAt"]
            .as_str()
            .and_then(|s| s.get(..4))
            .and_then(|y| y.parse().ok())
            .ok_or_else(|| FetchError::Transient("profile without createdAt".into()))?;
        let now = now_secs();
        let last = civil_from_days(day_of(now)).0;
        let past = self.load_past(login, first, now);
        // the years already kept run first..=k with no gaps; read from the one after
        let kept = past.as_ref().map_or(first, |p| (first..last).find(|y| !p.years.contains_key(y)).unwrap_or(last));
        let (mut cal, mut quota) = (serde_json::Map::new(), None);
        let mut from = kept;
        while from <= last {
            let to = (from + YEARS_PER_QUERY - 1).min(last);
            let (part, q) = self.query(&years_query(from, to), json!({"login": login})).await?;
            cal.extend(part.as_object().cloned().unwrap_or_default());
            quota = q.or(quota);
            from = to + 1;
        }
        let mut years: BTreeMap<i64, RawYear> = past.as_ref().map(|p| p.years.clone()).unwrap_or_default();
        for y in kept..=last {
            years.insert(y, year(cal.get(&format!("y{y}")).unwrap_or(&Value::Null)));
        }
        // keep every year that is over; a full read restarts the 30 days
        let read_at = past.as_ref().map_or(now, |p| p.read_at);
        let done = years.range(..last).map(|(&y, r)| (y, r.clone())).collect();
        self.save_past(login, &PastYears { read_at, first, years: done });
        let raw = RawUser {
            login: user["login"].as_str().unwrap_or(login).to_string(),
            followers: count(&user["followers"]),
            prs: count(&user["pullRequests"]),
            issues: count(&user["issues"]),
            repo_count: count(&user["repositories"]),
            repos,
            years: (first..=last).map(|y| years.remove(&y).unwrap_or_default()).collect(),
        };
        Ok((raw, quota))
    }
}

impl<T: Transport> Fetcher for GitHub<T> {
    fn fetch(&self, login: &str) -> impl Future<Output = Result<Fetched, FetchError>> + Send {
        async move {
            let (raw, quota) = self.raw(login).await?;
            let now = now_secs();
            Ok(Fetched { stats: derive(&raw, day_of(now), now), quota })
        }
    }
}

fn count(v: &Value) -> u64 {
    v["totalCount"].as_u64().unwrap_or(0)
}

fn repo(n: &Value) -> RawRepo {
    let edges = n["languages"]["edges"].as_array().into_iter().flatten();
    RawRepo {
        stars: n["stargazerCount"].as_u64().unwrap_or(0),
        languages: edges.filter_map(|e| Some((e["node"]["name"].as_str()?.to_string(), e["size"].as_u64()?))).collect(),
    }
}

fn year(c: &Value) -> RawYear {
    let days = c["contributionCalendar"]["weeks"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|w| w["contributionDays"].as_array().into_iter().flatten())
        .filter_map(|d| Some((parse_date(d["date"].as_str()?)?, d["contributionCount"].as_u64()?)));
    RawYear {
        commits: c["totalCommitContributions"].as_u64().unwrap_or(0),
        reviews: c["totalPullRequestReviewContributions"].as_u64().unwrap_or(0),
        days: days.collect(),
    }
}

fn quota(body: &Value) -> Option<Quota> {
    let r = &body["data"]["rateLimit"];
    Some(Quota {
        limit: r["limit"].as_u64().unwrap_or(5000),
        remaining: r["remaining"].as_u64()?,
        reset_at: parse_utc(r["resetAt"].as_str()?)?,
    })
}

/// The real transport. The token goes only into the Authorization header and is never logged.
pub struct Http {
    client: reqwest::Client,
    token: String,
}

impl Http {
    pub fn new(token: String) -> Result<Http, BoxError> {
        let client = reqwest::Client::builder()
            .user_agent("questlog-github-stats")
            .timeout(std::time::Duration::from_secs(20))
            .build()?;
        Ok(Http { client, token })
    }
}

impl Transport for Http {
    fn post(&self, body: Value) -> impl Future<Output = Result<Value, FetchError>> + Send {
        async move {
            let res = self
                .client
                .post("https://api.github.com/graphql")
                .bearer_auth(&self.token)
                .json(&body)
                .send()
                .await
                .map_err(|e| FetchError::Transient(e.to_string()))?;
            let status = res.status();
            let reset = res.headers().get("x-ratelimit-reset").and_then(|v| v.to_str().ok()).and_then(|v| v.parse().ok());
            if status == 403 || status == 429 {
                return Err(FetchError::RateLimited { reset_at: reset.unwrap_or(now_secs() + 60) });
            }
            if !status.is_success() {
                return Err(FetchError::Transient(format!("http {status}")));
            }
            res.json().await.map_err(|e| FetchError::Transient(e.to_string()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use std::sync::Mutex;

    #[derive(Default)]
    struct Script(Mutex<VecDeque<Value>>, Mutex<Vec<Value>>);

    impl Transport for std::sync::Arc<Script> {
        fn post(&self, body: Value) -> impl Future<Output = Result<Value, FetchError>> + Send {
            self.1.lock().unwrap().push(body);
            let r = self.0.lock().unwrap().pop_front().ok_or(FetchError::Transient("unscripted".into()));
            async move { r }
        }
    }

    fn gh(responses: Vec<Value>) -> (GitHub<std::sync::Arc<Script>>, std::sync::Arc<Script>) {
        let s = std::sync::Arc::new(Script::default());
        s.0.lock().unwrap().extend(responses);
        (GitHub::new(s.clone()), s)
    }

    fn this_year() -> i64 {
        civil_from_days(day_of(now_secs())).0
    }

    fn profile(after_next: bool, stars: u64) -> Value {
        json!({"data": {"rateLimit": {"remaining": 4999, "resetAt": "2026-10-11T12:00:00Z"}, "user": {
            "login": "OctoCat", "createdAt": format!("{}-03-01T00:00:00Z", this_year() - 1),
            "followers": {"totalCount": 3}, "pullRequests": {"totalCount": 4}, "issues": {"totalCount": 5},
            "repositories": {"totalCount": 2, "pageInfo": {"hasNextPage": after_next, "endCursor": "c1"},
                "nodes": [{"stargazerCount": stars, "languages": {"edges": [{"size": 10, "node": {"name": "Rust"}}]}}]}}}})
    }

    fn years() -> Value {
        let y = this_year();
        let cal = |date: String, n: u64| json!({"totalCommitContributions": n, "totalPullRequestReviewContributions": 1,
            "contributionCalendar": {"weeks": [{"contributionDays": [{"date": date, "contributionCount": n}]}]}});
        json!({"data": {"rateLimit": {"remaining": 4990, "resetAt": "2026-10-11T12:00:00Z"}, "user": {
            format!("y{}", y - 1): cal(format!("{}-06-01", y - 1), 2),
            format!("y{y}"): cal(format!("{y}-06-01"), 3)}}})
    }

    #[tokio::test]
    async fn pages_repos_and_reads_every_year() {
        let (g, script) = gh(vec![profile(true, 7), profile(false, 1), years()]);
        let (raw, quota) = g.raw("octocat").await.unwrap();
        assert_eq!(raw.repos.len(), 2, "both pages");
        assert_eq!((raw.followers, raw.prs, raw.issues, raw.repo_count), (3, 4, 5, 2));
        assert_eq!(raw.years.len(), 2);
        assert_eq!(quota.unwrap().remaining, 4990);
        let sent = script.1.lock().unwrap();
        assert_eq!(sent[1]["variables"]["after"], "c1", "second page asks after the cursor");
        let q = sent[2]["query"].as_str().unwrap();
        assert!(q.contains(&format!("y{}:", this_year() - 1)) && q.contains(&format!("y{}:", this_year())));
    }

    #[tokio::test]
    async fn a_refresh_reads_only_the_current_year() {
        let dir = crate::store::temp_dir("gh-past");
        let s = std::sync::Arc::new(Script::default());
        let g = GitHub::new(s.clone()).with_past_years(&dir);
        let now_only = || {
            let y = this_year();
            let cal = json!({"totalCommitContributions": 9, "totalPullRequestReviewContributions": 0,
                "contributionCalendar": {"weeks": [{"contributionDays": [{"date": format!("{y}-06-02"), "contributionCount": 9}]}]}});
            json!({"data": {"rateLimit": {"remaining": 4980, "resetAt": "2026-10-11T12:00:00Z"}, "user": {format!("y{y}"): cal}}})
        };
        s.0.lock().unwrap().extend([profile(false, 1), years(), profile(false, 1), now_only()]);
        let first = g.raw("octocat").await.unwrap().0;
        let again = g.raw("octocat").await.unwrap().0;
        let sent = s.1.lock().unwrap();
        let q = sent[3]["query"].as_str().unwrap();
        assert!(q.contains(&format!("y{}:", this_year())) && !q.contains(&format!("y{}:", this_year() - 1)), "{q}");
        assert_eq!(again.years[0], first.years[0], "last year from disk");
        assert_eq!(again.years[1].commits, 9, "this year read again");
    }

    #[tokio::test]
    async fn years_are_requested_in_chunks_of_four() {
        let y = this_year();
        let mut p = profile(false, 1);
        p["data"]["user"]["createdAt"] = json!(format!("{}-03-01T00:00:00Z", y - 8));
        let chunk = |from: i64, to: i64| {
            let user: serde_json::Map<String, Value> = (from..=to)
                .map(|n| {
                    let c = json!({"totalCommitContributions": 1, "totalPullRequestReviewContributions": 0,
                        "contributionCalendar": {"weeks": [{"contributionDays": [{"date": format!("{n}-06-01"), "contributionCount": 1}]}]}});
                    (format!("y{n}"), c)
                })
                .collect();
            json!({"data": {"rateLimit": {"remaining": 4000, "resetAt": "2026-10-11T12:00:00Z"}, "user": user}})
        };
        let (g, script) = gh(vec![p, chunk(y - 8, y - 5), chunk(y - 4, y - 1), chunk(y, y)]);
        let (raw, quota) = g.raw("octocat").await.unwrap();
        assert_eq!(raw.years.len(), 9);
        assert!(raw.years.iter().all(|r| r.commits == 1 && r.days.len() == 1), "every year merged");
        assert_eq!(quota.unwrap().remaining, 4000);
        let sent = script.1.lock().unwrap();
        assert_eq!(sent.len(), 4, "one profile page and three year queries");
        let q = sent[1]["query"].as_str().unwrap();
        assert!(q.contains(&format!("y{}:", y - 8)) && !q.contains(&format!("y{}:", y - 4)));
    }

    #[tokio::test]
    async fn fetch_derives_stats() {
        let (g, _) = gh(vec![profile(false, 7), years()]);
        let f = g.fetch("octocat").await.unwrap();
        assert_eq!(f.stats.login, "octocat");
        assert_eq!((f.stats.commits, f.stats.reviews, f.stats.contributions, f.stats.stars), (5, 2, 5, 7));
        assert_eq!(f.stats.class, "Blacksmith");
    }

    #[tokio::test]
    async fn errors_map_to_fetch_errors() {
        let nf = json!({"data": {"user": null}, "errors": [{"type": "NOT_FOUND", "message": "no user"}]});
        assert!(matches!(gh(vec![nf]).0.raw("ghost").await, Err(FetchError::NotFound)));
        let rl = json!({"errors": [{"type": "RATE_LIMITED", "message": "slow down"}]});
        assert!(matches!(gh(vec![rl]).0.raw("a").await, Err(FetchError::RateLimited { .. })));
        let other = json!({"errors": [{"type": "SOMETHING", "message": "odd"}]});
        assert!(matches!(gh(vec![other]).0.raw("a").await, Err(FetchError::Transient(_))));
        let empty = json!({"errors": []});
        assert!(matches!(gh(vec![empty]).0.raw("a").await, Err(FetchError::Transient(_))));
    }

    #[tokio::test]
    async fn body_without_data_is_transient() {
        for body in [json!({}), json!({"message": "odd"})] {
            assert!(matches!(gh(vec![body]).0.raw("a").await, Err(FetchError::Transient(_))));
        }
    }

    /// Manual:`GITHUB_TOKEN=$(gh auth token) cargo test --lib github -- --ignored`
    #[tokio::test]
    #[ignore]
    async fn live_barandev() {
        let g = GitHub::new(Http::new(std::env::var("GITHUB_TOKEN").unwrap()).unwrap());
        let f = g.fetch("BaranDev").await.unwrap();
        eprintln!("{:?} quota {:?}", f.stats, f.quota.map(|q| q.remaining));
    }
}
