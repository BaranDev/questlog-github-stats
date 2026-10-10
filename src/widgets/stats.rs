//! /stats, the Character Sheet: level with an XP bar and four counts on the left page, four more on the right.
use crate::canvas::Image;
use crate::card::{Card, LINE};
use crate::fmt::number;
use crate::stats::UserStats;
use crate::widgets::Look;

pub fn render(mut c: Card, look: &Look, s: &UserStats) -> Vec<Image> {
    let (assets, scene, painting) = (c.assets, c.scene, c.painting);
    c.title(&look.title_or(scene, "stats"));
    c.subtitle(look.subtitle.as_deref().unwrap_or(&s.class));
    let shown = |k: &str| !look.hide.contains(k);
    let (left, right) = (painting.anchors.boxes["left"], painting.anchors.boxes["right"]);
    let mut y = left.y;
    if shown("level") {
        c.say(&format!("{} {}", look.label(scene, "level"), s.level), left.x, y);
        c.bar(left.x, y + 8, left.w, s.xp, c.ink("xp"));
        y += 14;
    }
    for (rows, b, mut y) in [
        (vec![("commits", s.commits), ("prs", s.prs), ("repos", s.repos), ("stars", s.stars)], left, y),
        (vec![("issues", s.issues), ("reviews", s.reviews), ("followers", s.followers), ("contributions", s.contributions)], right, right.y),
    ] {
        for (k, v) in rows.into_iter().filter(|(k, _)| shown(k)) {
            let value = number(&assets.text_font, v, b.w / 2);
            c.row(&look.label(scene, k), &value, b.x, y, b.w);
            y += LINE;
        }
    }
    vec![c.frame()]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scene::Assets;
    use crate::widgets::{Widget, assert_scene_colors, empty, render as draw, sample};

    #[test]
    fn draws_one_palette_frame_day_and_night() {
        let a = Assets::embedded().unwrap();
        for night in [false, true] {
            let look = Look { night, ..Default::default() };
            let frames = draw(&a, Widget::Stats, &look, &sample()).unwrap();
            assert_eq!(frames.len(), 1);
            assert_scene_colors(&a, &look, &frames);
        }
        draw(&a, Widget::Stats, &Look::default(), &empty()).unwrap();
    }

    #[test]
    fn hide_labels_and_subtitle_change_the_card() {
        let a = Assets::embedded().unwrap();
        let base = draw(&a, Widget::Stats, &Look::default(), &sample()).unwrap();
        let mut hidden = Look::default();
        hidden.hide.insert("prs".into());
        let mut renamed = Look::default();
        renamed.labels.insert("commits".into(), "Deeds".into());
        let sub = Look { subtitle: Some("Full Stack Developer".into()), ..Default::default() };
        for look in [hidden, renamed, sub] {
            assert_ne!(draw(&a, Widget::Stats, &look, &sample()).unwrap(), base, "{look:?}");
        }
    }
}
