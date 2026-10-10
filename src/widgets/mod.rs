//! The cards: one renderer per widget, plus message cards (placeholder and errors) drawn in the widget's own art.
pub mod languages;
pub mod stats;
pub mod streak;

use crate::canvas::Image;
use crate::card::Card;
use crate::scene::{Assets, Scene};
use crate::stats::UserStats;
use std::collections::{HashMap, HashSet};

pub const FRAMES: usize = 8;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Widget {
    Stats,
    Languages,
    Streak,
}

impl Widget {
    pub fn key(self) -> &'static str {
        match self {
            Widget::Stats => "stats",
            Widget::Languages => "languages",
            Widget::Streak => "streak",
        }
    }

    pub fn from_path(p: &str) -> Option<Widget> {
        [Widget::Stats, Widget::Languages, Widget::Streak].into_iter().find(|w| w.key() == p)
    }
}

/// How a card looks: everything in the URL except the user.
#[derive(Clone, Debug, PartialEq)]
pub struct Look {
    pub scene: String,
    pub night: bool,
    pub title: Option<String>,
    pub subtitle: Option<String>,
    pub labels: HashMap<String, String>,
    pub hide: HashSet<String>,
    pub animate: bool,
}

impl Default for Look {
    fn default() -> Self {
        Look {
            scene: "forest".into(),
            night: false,
            title: None,
            subtitle: None,
            labels: HashMap::new(),
            hide: HashSet::new(),
            animate: true,
        }
    }
}

impl Look {
    pub fn label(&self, scene: &Scene, key: &str) -> String {
        self.labels.get(key).cloned().unwrap_or_else(|| scene.label(key).to_string())
    }

    pub fn title_or(&self, scene: &Scene, widget: &str) -> String {
        self.title.clone().unwrap_or_else(|| scene.titles.get(widget).cloned().unwrap_or_default())
    }
}

pub fn render(assets: &Assets, w: Widget, look: &Look, s: &UserStats) -> Option<Vec<Image>> {
    let scene = assets.scene(&look.scene)?;
    let card = Card::new(assets, scene, w.key(), look.night)?;
    let mut frames = match w {
        Widget::Stats => stats::render(card, look, s),
        Widget::Languages => languages::render(card, look, s),
        Widget::Streak => streak::render(card, look, s),
    };
    if !look.animate {
        frames.truncate(1);
    }
    Some(frames)
}

pub fn message(assets: &Assets, w: Widget, look: &Look, msg: &str) -> Option<Image> {
    let scene = assets.scene(&look.scene)?;
    let mut card = Card::new(assets, scene, w.key(), look.night)?;
    card.title(&look.title_or(scene, w.key()));
    card.message(msg);
    Some(card.frame())
}

#[cfg(test)]
pub fn sample() -> UserStats {
    UserStats {
        login: "barandev".into(),
        level: 12,
        xp: 0.14,
        commits: 106,
        prs: 219,
        repos: 25,
        stars: 33,
        issues: 12,
        reviews: 40,
        followers: 18,
        contributions: 3384,
        languages: vec![
            ("TypeScript".into(), 0.5746),
            ("Python".into(), 0.24),
            ("CSS".into(), 0.0591),
            ("JavaScript".into(), 0.044),
            ("HTML".into(), 0.0358),
        ],
        class: "Artificer".into(),
        current_streak: 4,
        best_streak: 13,
        fetched_at: 0,
    }
}

#[cfg(test)]
pub fn empty() -> UserStats {
    crate::stats::derive(&crate::stats::RawUser { login: "newbie".into(), ..Default::default() }, 0, 0)
}

#[cfg(test)]
pub fn assert_scene_colors(a: &Assets, look: &Look, frames: &[Image]) {
    let allowed = a.scene(&look.scene).unwrap().allowed();
    for f in frames {
        assert_eq!((f.w, f.h), (crate::scene::OW, crate::scene::OH));
        assert!(f.px.iter().all(|p| allowed.contains(&[p[0], p[1], p[2]])), "off-palette pixel");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn widget_paths() {
        assert_eq!(Widget::from_path("stats"), Some(Widget::Stats));
        assert_eq!(Widget::from_path("languages").map(Widget::key), Some("languages"));
        assert_eq!(Widget::from_path("trophies"), None);
    }

    #[test]
    fn message_cards_draw_in_widget_art() {
        let a = Assets::embedded().unwrap();
        for w in [Widget::Stats, Widget::Languages, Widget::Streak] {
            for night in [false, true] {
                let look = Look { night, ..Default::default() };
                let img = message(&a, w, &look, "No adventurer by that name").unwrap();
                assert_scene_colors(&a, &look, &[img]);
            }
        }
        let bad = Look { scene: "nowhere".into(), ..Default::default() };
        assert!(message(&a, Widget::Stats, &bad, "x").is_none());
        assert!(render(&a, Widget::Stats, &bad, &sample()).is_none());
    }

    #[test]
    fn labels_and_titles_fall_back_to_the_scene() {
        let a = Assets::embedded().unwrap();
        let s = a.scene("forest").unwrap();
        let mut look = Look::default();
        assert_eq!(look.label(s, "commits"), "Commits");
        assert_eq!(look.title_or(s, "streak"), "Campfire");
        look.labels.insert("commits".into(), "Deeds".into());
        look.title = Some("My Journey".into());
        assert_eq!(look.label(s, "commits"), "Deeds");
        assert_eq!(look.title_or(s, "streak"), "My Journey");
    }
}
