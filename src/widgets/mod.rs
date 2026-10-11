//! The cards: one renderer per widget, plus message cards (placeholder and errors) drawn in the widget's own art.
pub mod languages;
pub mod stats;
pub mod streak;

use crate::canvas::{Image, Rgb};
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
    /// Text drawn in place of a value; bars, notches and the fire still follow the real numbers.
    pub values: HashMap<String, String>,
    /// Up to two free lines, placed in the card's free space.
    pub note: Vec<String>,
    pub title_color: Option<Rgb>,
    pub text_color: Option<Rgb>,
    pub outline_color: Option<Rgb>,
    pub hide: HashSet<String>,
    pub animate: bool,
    /// Output upscale, 1..=5. Only the final PNG changes, not the drawing.
    pub scale: u8,
}

impl Default for Look {
    fn default() -> Self {
        Look {
            scene: "forest".into(),
            night: false,
            title: None,
            subtitle: None,
            labels: HashMap::new(),
            values: HashMap::new(),
            note: Vec::new(),
            title_color: None,
            text_color: None,
            outline_color: None,
            hide: HashSet::new(),
            animate: true,
            scale: 5,
        }
    }
}

impl Look {
    pub fn label(&self, scene: &Scene, key: &str) -> String {
        self.labels.get(key).cloned().unwrap_or_else(|| scene.label(key).to_string())
    }

    /// A label with a built-in default, for words the scene does not name.
    pub fn word<'a>(&'a self, key: &str, default: &'a str) -> &'a str {
        self.labels.get(key).map_or(default, String::as_str)
    }

    pub fn value(&self, key: &str, real: String) -> String {
        self.values.get(key).cloned().unwrap_or(real)
    }

    pub fn title_or(&self, scene: &Scene, widget: &str) -> String {
        self.title.clone().unwrap_or_else(|| scene.titles.get(widget).cloned().unwrap_or_default())
    }
}

fn card<'a>(assets: &'a Assets, w: Widget, look: &Look) -> Option<Card<'a>> {
    let mut card = Card::new(assets, assets.scene(&look.scene)?, w.key(), look.night)?;
    (card.title_color, card.text_color, card.outline_color) = (look.title_color, look.text_color, look.outline_color);
    Some(card)
}

pub fn render(assets: &Assets, w: Widget, look: &Look, s: &UserStats) -> Option<Vec<Image>> {
    let card = card(assets, w, look)?;
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
    let mut card = card(assets, w, look)?;
    card.title(&look.title_or(card.scene, w.key()));
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
    let mut allowed = a.scene(&look.scene).unwrap().allowed();
    allowed.extend([look.title_color, look.text_color, look.outline_color].into_iter().flatten());
    for f in frames {
        assert_eq!((f.w, f.h), (crate::scene::OW, crate::scene::OH));
        assert!(f.px.iter().all(|p| allowed.contains(&[p[0], p[1], p[2]])), "off-palette pixel");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scene::{OH, OW};

    const ALL: [Widget; 3] = [Widget::Stats, Widget::Languages, Widget::Streak];

    /// Every label and value key a card reads.
    fn keys(w: Widget) -> (&'static [&'static str], &'static [&'static str]) {
        const STATS: &[&str] = &["level", "commits", "prs", "repos", "stars", "issues", "reviews", "followers", "contributions"];
        const LANGS: &[&str] = &["typescript", "python", "css", "javascript", "html"];
        match w {
            Widget::Stats => (STATS, STATS),
            Widget::Languages => (&["typescript", "python", "css", "javascript", "html", "percent"], LANGS),
            Widget::Streak => (&["current", "best", "total", "days"], &["current", "best", "total"]),
        }
    }

    #[test]
    fn every_label_and_value_key_changes_the_card() {
        let a = Assets::embedded().unwrap();
        for w in ALL {
            let base = render(&a, w, &Look::default(), &sample()).unwrap();
            let (labels, values) = keys(w);
            for k in labels {
                let mut look = Look::default();
                look.labels.insert(k.to_string(), "Zz".into());
                assert_ne!(render(&a, w, &look, &sample()).unwrap(), base, "{w:?} labels {k}");
            }
            for k in values {
                let mut look = Look::default();
                look.values.insert(k.to_string(), "Zz".into());
                assert_ne!(render(&a, w, &look, &sample()).unwrap(), base, "{w:?} values {k}");
            }
            for t in [Look { title: Some("Zz".into()), ..Default::default() }, Look { subtitle: Some("Zz".into()), ..Default::default() }] {
                assert_ne!(render(&a, w, &t, &sample()).unwrap(), base, "{w:?} {t:?}");
            }
        }
        let mut look = Look::default();
        look.labels.insert("empty".into(), "Zz".into());
        assert_ne!(render(&a, Widget::Languages, &look, &empty()), render(&a, Widget::Languages, &Look::default(), &empty()));
    }

    #[test]
    fn values_leave_the_fire_to_the_real_streak() {
        let a = Assets::embedded().unwrap();
        let mut look = Look::default();
        look.values.insert("current".into(), "Forever".into());
        let base = render(&a, Widget::Streak, &Look::default(), &sample()).unwrap();
        let custom = render(&a, Widget::Streak, &look, &sample()).unwrap();
        let fire = Card::new(&a, a.scene("forest").unwrap(), "streak", false).unwrap().painting.anchors.boxes["fire"];
        for (b, c) in base.iter().zip(&custom) {
            assert_ne!(b, c);
            for y in fire.y..fire.y + fire.h {
                let row = |f: &Image| f.px[y as usize * f.w + fire.x as usize..][..fire.w as usize].to_vec();
                assert_eq!(row(b), row(c), "fire row {y}");
            }
        }
    }

    #[test]
    fn hostile_values_stay_on_their_row() {
        let a = Assets::embedded().unwrap();
        for w in ALL {
            let mut look = Look::default();
            for k in keys(w).1 {
                look.values.insert(k.to_string(), "W".repeat(60));
            }
            assert_scene_colors(&a, &look, &render(&a, w, &look, &sample()).unwrap());
        }
        let f = &a.text_font;
        let l = crate::fmt::line(f, "Level", &"W".repeat(60), 79);
        assert!(f.length(&l) <= 79 && l.ends_with("..."), "{l}");
    }

    /// Pixels where two frames differ.
    fn changed(a: &Image, b: &Image) -> Vec<(usize, usize)> {
        (0..a.px.len()).filter(|&i| a.px[i] != b.px[i]).map(|i| (i % a.w, i / a.w)).collect()
    }

    #[test]
    fn notes_find_room_and_never_cover_text() {
        let a = Assets::embedded().unwrap();
        let few = UserStats { languages: sample().languages[..2].to_vec(), ..sample() };
        let note = vec!["W".repeat(60), "Second line of the note".into()];
        for scene in a.scene_names() {
            for w in ALL {
                for night in [false, true] {
                    let look = Look { scene: scene.into(), night, ..Default::default() };
                    let noted = Look { note: note.clone(), ..look.clone() };
                    let paint = card(&a, w, &look).unwrap().frame();
                    let base = render(&a, w, &look, &few).unwrap();
                    let with = render(&a, w, &noted, &few).unwrap();
                    assert_scene_colors(&a, &noted, &with);
                    let drawn: HashSet<_> = changed(&paint, &base[0]).into_iter().collect();
                    let note_px = changed(&base[0], &with[0]);
                    assert!(!note_px.is_empty(), "{scene} {w:?} night={night}: the note found no room");
                    assert!(note_px.iter().all(|p| !drawn.contains(p)), "{scene} {w:?} night={night}: the note covers text");
                    assert!(note_px.iter().all(|&(x, y)| x > 0 && y > 0 && x < OW - 1 && y < OH - 1), "{scene} {w:?}");
                }
            }
        }
    }

    #[test]
    fn notes_take_the_place_of_language_rows() {
        let a = Assets::embedded().unwrap();
        let base = render(&a, Widget::Languages, &Look::default(), &sample()).unwrap();
        for n in [1, 2] {
            let look = Look { note: vec!["Hello".into(); n], ..Default::default() };
            assert_ne!(render(&a, Widget::Languages, &look, &sample()).unwrap(), base, "{n} lines");
        }
        let hidden = Look { hide: ["typescript".to_string()].into(), ..Default::default() };
        let noted = Look { note: vec!["Hello".into()], ..hidden.clone() };
        let without = render(&a, Widget::Languages, &hidden, &sample()).unwrap();
        let with = render(&a, Widget::Languages, &noted, &sample()).unwrap();
        let list = Card::new(&a, a.scene("forest").unwrap(), "languages", false).unwrap().painting.anchors.boxes["list"];
        let rows_end = (list.y + 4 * 11) as usize;
        assert!(changed(&without[0], &with[0]).iter().all(|&(_, y)| y >= rows_end), "hide made room: four rows stay");
    }

    #[test]
    fn custom_text_colors_are_used_as_given_day_and_night() {
        let a = Assets::embedded().unwrap();
        let (title, text, outline) = ([1, 2, 3], [4, 5, 6], [7, 8, 9]);
        for scene in ["forest", "guild-hall", "observatory"] {
            for w in ALL {
                for night in [false, true] {
                    let look = Look {
                        scene: scene.into(),
                        night,
                        title_color: Some(title),
                        text_color: Some(text),
                        outline_color: Some(outline),
                        ..Default::default()
                    };
                    for f in [render(&a, w, &look, &sample()).unwrap().remove(0), message(&a, w, &look, "Busy").unwrap()] {
                        assert_scene_colors(&a, &look, std::slice::from_ref(&f));
                        for c in [title, text, outline] {
                            assert!(f.px.iter().any(|p| [p[0], p[1], p[2]] == c), "{scene} {w:?} night={night}: {c:?} unused");
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn widget_paths() {
        assert_eq!(Widget::from_path("stats"), Some(Widget::Stats));
        assert_eq!(Widget::from_path("languages").map(Widget::key), Some("languages"));
        assert_eq!(Widget::from_path("trophies"), None);
    }

    #[test]
    fn every_scene_renders_every_widget_day_and_night() {
        let a = Assets::embedded().unwrap();
        for scene in a.scene_names() {
            for w in [Widget::Stats, Widget::Languages, Widget::Streak] {
                for night in [false, true] {
                    let look = Look { scene: scene.into(), night, ..Default::default() };
                    let frames = render(&a, w, &look, &sample()).unwrap_or_else(|| panic!("{scene} {w:?}"));
                    assert!(!frames.is_empty());
                    assert_scene_colors(&a, &look, &frames);
                    let msg = message(&a, w, &look, "No adventurer by that name").unwrap();
                    assert_scene_colors(&a, &look, &[msg]);
                }
            }
        }
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
