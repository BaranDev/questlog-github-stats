//! Who has used questlog, for the admin page: the GitHub logins people asked cards for, the card addresses each
//! one made, and the decorations made without a login. Only a person's browser or GitHub's image proxy counts;
//! bots, the owner and the example logins don't, and no IPs are kept. Kept in memory and written to people.json
//! by the hourly sweep and at shutdown, and dropped 12 months after a person's last visit. A login removed at the
//! person's request stays blocked: its stats are not fetched or saved again and its cards say so.
use crate::BoxError;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// The owner and the logins the site and its README use as examples.
const NOT_PEOPLE: [&str; 4] = ["barandev", "octocat", "you", "demo-adventurer"];
// ponytail: past these caps new entries are dropped (a person's last visit still moves); about 100 MB at worst
const CARDS_EACH: usize = 50;
const MAX_PEOPLE: usize = 20_000;
const MAX_DECORATIONS: usize = 20_000;
const ADDRESS_CHARS: usize = 300;
/// People and decorations nobody asked for in this long are forgotten.
pub const KEEP_SECS: u64 = 365 * 86400;

/// One card or decoration address: when it was first and last asked for, and whether it is in a README.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Use {
    pub first: u64,
    pub last: u64,
    pub readme: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Person {
    /// 0 when they were saved before this tracking began, so their first visit is not known.
    pub first: u64,
    pub last: u64,
    pub cards: HashMap<String, Use>,
}

#[derive(Default, Serialize, Deserialize)]
struct Seen {
    /// When the tracking began.
    since: u64,
    people: HashMap<String, Person>,
    decorations: HashMap<String, Use>,
    /// Logins removed at the person's request.
    #[serde(default)]
    blocked: BTreeSet<String>,
}

/// The numbers at the top of the admin page's people section.
pub struct Summary {
    pub since: u64,
    pub tried: usize,
    pub in_readme: usize,
    pub decorations: usize,
    pub decorations_in_readme: usize,
    /// Logins removed at the person's request.
    pub removed: Vec<String>,
}

pub struct People {
    path: PathBuf,
    seen: Mutex<Seen>,
}

fn touch(uses: &mut HashMap<String, Use>, address: &str, readme: bool, now: u64, cap: usize) {
    let address: String = address.chars().take(ADDRESS_CHARS).collect();
    let room = uses.len() < cap;
    match uses.get_mut(&address) {
        Some(u) => {
            u.last = now;
            u.readme |= readme;
        }
        None if room => {
            uses.insert(address, Use { first: now, last: now, readme });
        }
        None => {}
    }
}

impl People {
    /// Loads `<dir>/people.json`. The first time there is none, it starts from the logins `saved` returns (users
    /// saved before the tracking), so nobody who already tried it is missing. An unreadable file is kept aside as
    /// people.json.bad rather than overwritten.
    pub fn open(dir: &Path, saved: impl FnOnce() -> Vec<String>, now: u64) -> People {
        let path = dir.join("people.json");
        let seen = match std::fs::read(&path) {
            Ok(b) => serde_json::from_slice(&b).unwrap_or_else(|e| {
                crate::error!("people", "could not read {}: {e}; kept it as people.json.bad and started over", path.display());
                let _ = std::fs::rename(&path, path.with_extension("json.bad"));
                Seen { since: now, ..Default::default() }
            }),
            Err(_) => Seen {
                since: now,
                people: saved().into_iter().filter(|l| !NOT_PEOPLE.contains(&l.as_str())).map(|l| (l, Person::default())).collect(),
                ..Default::default()
            },
        };
        People { path, seen: Mutex::new(seen) }
    }

    /// A person got the card for `login` at `address`; `readme` when GitHub's image proxy asked (it is in a README).
    pub fn card(&self, login: &str, address: &str, readme: bool, now: u64) {
        if NOT_PEOPLE.contains(&login) {
            return;
        }
        let mut s = self.seen.lock().unwrap();
        if s.blocked.contains(login) || (s.people.len() >= MAX_PEOPLE && !s.people.contains_key(login)) {
            return;
        }
        let p = s.people.entry(login.to_string()).or_insert_with(|| Person { first: now, ..Default::default() });
        p.last = now;
        touch(&mut p.cards, address, readme, now, CARDS_EACH);
    }

    /// Removes a login from the list (its account is gone, or the person asked).
    pub fn remove(&self, login: &str) {
        self.seen.lock().unwrap().people.remove(login);
    }

    /// Removes a login and blocks it, at the person's request; `allow` undoes the block.
    pub fn block(&self, login: &str) {
        let mut s = self.seen.lock().unwrap();
        s.people.remove(login);
        s.blocked.insert(login.to_string());
    }

    pub fn allow(&self, login: &str) {
        self.seen.lock().unwrap().blocked.remove(login);
    }

    pub fn is_blocked(&self, login: &str) -> bool {
        self.seen.lock().unwrap().blocked.contains(login)
    }

    /// Forgets people and decorations not asked for in KEEP_SECS; someone saved before the tracking counts from
    /// when it began. Returns how many people were forgotten.
    pub fn sweep(&self, now: u64) -> usize {
        let mut s = self.seen.lock().unwrap();
        let since = s.since;
        let before = s.people.len();
        s.people.retain(|_, p| now.saturating_sub(p.last.max(since)) <= KEEP_SECS);
        s.decorations.retain(|_, u| now.saturating_sub(u.last) <= KEEP_SECS);
        before - s.people.len()
    }

    /// A decoration made without a login: from the builder, or in a README when `readme`.
    pub fn decoration(&self, address: &str, readme: bool, now: u64) {
        touch(&mut self.seen.lock().unwrap().decorations, address, readme, now, MAX_DECORATIONS);
    }

    /// The numbers at the top of the admin page's people section.
    pub fn summary(&self) -> Summary {
        let s = self.seen.lock().unwrap();
        Summary {
            since: s.since,
            tried: s.people.len(),
            in_readme: s.people.values().filter(|p| p.cards.values().any(|u| u.readme)).count(),
            decorations: s.decorations.len(),
            decorations_in_readme: s.decorations.values().filter(|u| u.readme).count(),
            removed: s.blocked.iter().cloned().collect(),
        }
    }

    /// One page of people whose login contains `find`, newest first: how many match, and the `per` people on page
    /// `page` (counted from 1).
    pub fn page(&self, find: &str, page: usize, per: usize) -> (usize, Vec<(String, Person)>) {
        let s = self.seen.lock().unwrap();
        // ponytail: sorts the matches on every request; fine up to MAX_PEOPLE, an ordered index if that grows
        let mut hits: Vec<(&String, u64)> = s.people.iter().filter(|(l, _)| l.contains(find)).map(|(l, p)| (l, p.last)).collect();
        hits.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(b.0)));
        let list = hits.iter().skip(page.saturating_sub(1) * per).take(per).map(|&(l, _)| (l.clone(), s.people[l].clone())).collect();
        (hits.len(), list)
    }

    pub fn save(&self) -> Result<(), BoxError> {
        let bytes = serde_json::to_vec(&*self.seen.lock().unwrap())?;
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, bytes)?;
        std::fs::rename(&tmp, &self.path)?; // atomic: a crash mid-write never leaves half a file
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::temp_dir;

    #[test]
    fn counts_people_and_their_cards_and_survives_a_restart() {
        let dir = temp_dir("people");
        std::fs::create_dir_all(&dir).unwrap();
        let p = People::open(&dir, || vec!["sudi".into(), "barandev".into()], 100);
        p.card("ana", "/ana/stats", false, 200);
        p.card("ana", "/ana/stats", true, 300);
        p.card("ana", "/ana/streak/forest", false, 400);
        p.card("barandev", "/barandev/stats", true, 500); // the owner is not counted
        p.card("octocat", "/octocat/stats", true, 500); // nor an example login
        p.decoration("/decorations/reading-nook?title=Hi", false, 600);
        p.decoration("/decorations/reading-nook?title=Hi", true, 700);
        p.save().unwrap();

        let p = People::open(&dir, Vec::new, 999);
        let s = p.summary();
        assert_eq!((s.since, s.tried, s.in_readme, s.decorations, s.decorations_in_readme), (100, 2, 1, 1, 1));
        let (_, list) = p.page("", 1, 10);
        let logins: Vec<&str> = list.iter().map(|(l, _)| l.as_str()).collect();
        assert_eq!(logins, ["ana", "sudi"], "newest first");
        let ana = &list[0].1;
        assert_eq!((ana.first, ana.last, ana.cards.len()), (200, 400, 2));
        assert_eq!(ana.cards["/ana/stats"], Use { first: 200, last: 300, readme: true });
        assert_eq!(list[1].1.first, 0, "saved before the tracking");
    }

    #[test]
    fn forgets_after_a_year_and_blocks_on_request() {
        let dir = temp_dir("people-keep");
        std::fs::create_dir_all(&dir).unwrap();
        let p = People::open(&dir, || vec!["old".into()], 1000);
        p.card("ana", "/ana/stats", false, 1000);
        p.card("bo", "/bo/stats", false, 1000 + KEEP_SECS);
        p.decoration("/decorations/workbench", true, 1000);
        assert_eq!(p.sweep(1000 + KEEP_SECS), 0, "a year to the second is kept");
        assert_eq!(p.sweep(1001 + KEEP_SECS), 2, "ana, and old counted from when the tracking began");
        let (tried, list) = p.page("", 1, 10);
        assert_eq!((list[0].0.as_str(), tried, p.summary().decorations), ("bo", 1, 0));

        p.block("bo");
        p.card("bo", "/bo/stats", false, 2000 + KEEP_SECS);
        p.save().unwrap();
        let p = People::open(&dir, Vec::new, 0);
        assert!(p.is_blocked("bo"));
        let s = p.summary();
        assert_eq!((s.tried, s.removed), (0, vec!["bo".to_string()]), "a blocked login is not listed again");
        p.allow("bo");
        assert!(!p.is_blocked("bo"));
    }

    #[test]
    fn caps_cards_per_person_and_keeps_a_bad_file() {
        let dir = temp_dir("people-cap");
        std::fs::create_dir_all(&dir).unwrap();
        let p = People::open(&dir, Vec::new, 0);
        for i in 0..CARDS_EACH + 5 {
            p.card("ana", &format!("/ana/stats?n={i}"), false, i as u64);
        }
        let (_, list) = p.page("", 1, 1);
        assert_eq!((list[0].1.cards.len(), list[0].1.last), (CARDS_EACH, (CARDS_EACH + 4) as u64));

        std::fs::write(dir.join("people.json"), b"not json").unwrap();
        let s = People::open(&dir, Vec::new, 5).summary();
        assert_eq!((s.since, s.tried), (5, 0));
        assert!(dir.join("people.json.bad").exists());
    }

    #[test]
    fn pages_newest_first_and_finds_by_login() {
        let dir = temp_dir("people-page");
        std::fs::create_dir_all(&dir).unwrap();
        let p = People::open(&dir, Vec::new, 0);
        for i in 0..45u64 {
            p.card(&format!("user{i:02}"), "/stats", false, 100 + i);
        }
        let logins = |list: Vec<(String, Person)>| list.into_iter().map(|(l, _)| l).collect::<Vec<_>>();
        let (n, first) = p.page("", 1, 20);
        assert_eq!((n, first.len(), first[0].0.as_str()), (45, 20, "user44"));
        assert_eq!(logins(p.page("", 3, 20).1), ["user04", "user03", "user02", "user01", "user00"]);
        assert!(p.page("", 4, 20).1.is_empty(), "past the last page");
        let (n, found) = p.page("er1", 1, 20);
        assert_eq!((n, logins(found).first().cloned()), (10, Some("user19".to_string())));
    }
}
