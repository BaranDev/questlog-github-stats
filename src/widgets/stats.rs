//! /stats, the Character Sheet: level with an XP bar and four counts on the left page, four more on the right.
use crate::canvas::Image;
use crate::card::{Card, LINE};
use crate::fmt::{line, number};
use crate::stats::UserStats;
use crate::widgets::Look;

pub fn render(c: &mut Card, look: &Look, s: &UserStats) -> Vec<Image> {
    let (assets, scene, painting) = (c.assets, c.scene, c.painting);
    let font = &assets.text_font;
    let title_width = c.title(&look.title_or(scene, "stats"));
    c.subtitle_after(look.subtitle.as_deref().unwrap_or(&s.class), title_width);
    let shown = |k: &str| !look.hide.contains(k);
    let (left, right) = (painting.anchors.boxes["left"], painting.anchors.boxes["right"]);
    let mut y = left.y;
    if shown("level") {
        let value = look.value("level", s.level.to_string());
        c.say(&line(font, &look.label(scene, "level"), &value, left.w), left.x, y);
        c.bar(left.x, y + 8, left.w, s.xp, c.ink("xp"));
        y += 14;
    }
    let mut ends = Vec::new();
    for (rows, b, mut y) in [
        (vec![("commits", s.commits), ("prs", s.prs), ("repos", s.repos), ("stars", s.stars)], left, y),
        (vec![("issues", s.issues), ("reviews", s.reviews), ("followers", s.followers), ("contributions", s.contributions)], right, right.y),
    ] {
        for (k, v) in rows.into_iter().filter(|(k, _)| shown(k)) {
            let value = look.value(k, number(font, v, b.w / 2));
            c.row(&look.label(scene, k), &value, b.x, y, b.w);
            y += LINE;
        }
        ends.push(y);
    }
    // The page reaches at least as far down as a full left column.
    let bottom = (left.y + left.h).max(right.y + right.h).max(left.y + 14 + 4 * LINE);
    let full = (left.x, ends[0].max(ends[1]), right.x + right.w - left.x, bottom);
    c.note(&look.note, &[full, (right.x, ends[1], right.w, bottom), (left.x, ends[0], left.w, bottom)]);
    vec![c.frame()]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scene::Assets;
    use crate::widgets::{Widget, assert_scene_colors, empty, render as draw, sample};

    #[test]
    fn every_scene_has_room_for_the_longest_class() {
        let a = Assets::embedded().unwrap();
        let font = &a.text_font;
        let longest = crate::stats::CLASSES.iter().map(|c| font.length(c)).max().unwrap();
        let mut short = Vec::new();
        for name in a.scene_names() {
            let scene = a.scene(name).unwrap();
            let mut c = Card::new(&a, scene, "stats", false).unwrap();
            let title_width = c.title(&Look::default().title_or(scene, "stats"));
            let tb = c.painting.anchors.subtitle;
            let room = tb.x + tb.w - c.subtitle_x(title_width);
            if room < longest {
                short.push(format!("{name}: {room} of {longest}"));
            }
        }
        assert!(short.is_empty(), "no room for the longest class: {short:?}");
    }

    #[test]
    fn a_long_subtitle_is_trimmed_unless_truncate_is_off() {
        let a = Assets::embedded().unwrap();
        let long = Look { subtitle: Some("Senior Principal Staff Full Stack Developer".into()), ..Default::default() };
        let whole = Look { truncate: false, ..long.clone() };
        let trimmed = draw(&a, Widget::Stats, &long, &sample()).unwrap();
        assert_ne!(trimmed, draw(&a, Widget::Stats, &whole, &sample()).unwrap(), "drawn whole");
        let short = Look { subtitle: Some("Dev".into()), ..Default::default() };
        let short_whole = Look { truncate: false, ..short.clone() };
        assert_eq!(draw(&a, Widget::Stats, &short, &sample()), draw(&a, Widget::Stats, &short_whole, &sample()), "fits: the same");
    }

    #[test]
    fn draws_one_palette_frame_day_and_night() {
        let a = Assets::embedded().unwrap();
        for night in [false, true] {
            let look = Look { night, ..Default::default() };
            let drawn = draw(&a, Widget::Stats, &look, &sample()).unwrap();
            assert_eq!(drawn.frames.len(), 1);
            assert_scene_colors(&a, &look, &drawn);
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
