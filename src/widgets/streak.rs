//! /streak, the Campfire: a fire sized by the current streak (smoking ashes at 0), a notch per 5 days of the best
//! streak, and the numbers beside it. The flames flicker.
use crate::canvas::Image;
use crate::card::{Card, LINE};
use crate::fmt::{fit, number};
use crate::text::Font;
use crate::stats::UserStats;
use crate::widgets::{FRAMES, Look};

pub fn tier(current: u32) -> &'static str {
    match current {
        0 => "ashes",
        1..=6 => "flame-small",
        7..=29 => "flame-steady",
        _ => "flame-bonfire",
    }
}

/// "label value" within `w`: the label is trimmed before the value is ever touched.
fn line(font: &Font, label: &str, value: &str, w: i64) -> String {
    let label = fit(font, label, w - font.length(value) - font.length(" "));
    if label.is_empty() { value.to_string() } else { format!("{label} {value}") }
}

pub fn render(mut c: Card, look: &Look, s: &UserStats) -> Vec<Image> {
    let (assets, scene, painting) = (c.assets, c.scene, c.painting);
    c.title(&look.title_or(scene, "streak"));
    if let Some(sub) = &look.subtitle {
        c.subtitle(sub);
    }
    let b = &painting.anchors.boxes;
    let (fire, text, notches) = (b["fire"], b["text"], b["notches"]);
    let shown = |k: &str| !look.hide.contains(k);
    let days = look.label(scene, "days");
    let mut y = text.y;
    for (k, v, unit) in [("current", s.current_streak as u64, true), ("best", s.best_streak as u64, true), ("total", s.contributions, false)] {
        if !shown(k) {
            continue;
        }
        let n = number(&assets.text_font, v, text.w / 2);
        let value = if unit { format!("{n} {days}") } else { n };
        c.say(&line(&assets.text_font, &look.label(scene, k), &value, text.w), text.x, y);
        y += LINE;
    }
    if shown("best") {
        let marks = (s.best_streak as i64 / 5).min(notches.w / 4);
        let ink = c.ink("notch");
        for i in 0..marks {
            let x = notches.x + i * 4;
            c.layer.fill_rect(x, notches.y, x + 1, notches.y + notches.h - 1, ink);
        }
    }
    let prefix = tier(s.current_streak);
    let sprites: Vec<&Image> = (0..).map_while(|i| scene.sprites.get(&format!("{prefix}-{i}"))).collect();
    let (base, cx, ground) = (c.layer.clone(), fire.x + fire.w / 2, fire.y + fire.h);
    (0..FRAMES)
        .map(|f| {
            c.layer = base.clone();
            if let Some(sprite) = sprites.get(f % sprites.len().max(1)) {
                c.sprite(sprite, cx, ground);
            }
            c.frame()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scene::Assets;
    use crate::widgets::{FRAMES, Widget, assert_scene_colors, render as draw, sample};

    #[test]
    fn tiers() {
        assert_eq!(tier(0), "ashes");
        assert_eq!((tier(1), tier(6)), ("flame-small", "flame-small"));
        assert_eq!((tier(7), tier(29)), ("flame-steady", "flame-steady"));
        assert_eq!(tier(30), "flame-bonfire");
    }

    #[test]
    fn fire_flickers_within_the_palette() {
        let a = Assets::embedded().unwrap();
        for night in [false, true] {
            for current in [0, 4, 12, 45] {
                let look = Look { night, ..Default::default() };
                let s = UserStats { current_streak: current, ..sample() };
                let frames = draw(&a, Widget::Streak, &look, &s).unwrap();
                assert_eq!(frames.len(), FRAMES);
                assert_ne!(frames[0], frames[1], "streak {current} animates");
                assert_scene_colors(&a, &look, &frames);
            }
        }
    }

    #[test]
    fn long_labels_give_way_to_values() {
        let a = Assets::embedded().unwrap();
        let mut look = Look::default();
        look.labels.insert("current".into(), "W".repeat(60));
        let frames = draw(&a, Widget::Streak, &look, &sample()).unwrap();
        assert_scene_colors(&a, &look, &frames);
        let scene = a.scene("forest").unwrap();
        let w = Card::new(&a, scene, "streak", false).unwrap().painting.anchors.boxes["text"].w;
        let l = line(&a.text_font, &look.label(scene, "current"), "4 days", w);
        assert!(l.ends_with(" 4 days"), "{l}");
        assert!(a.text_font.length(&l) <= w, "{l}");
        assert_eq!(line(&a.text_font, "", "4 days", w), "4 days");
    }

    #[test]
    fn hide_removes_lines() {
        let a = Assets::embedded().unwrap();
        let mut look = Look::default();
        look.hide.insert("total".into());
        assert_ne!(draw(&a, Widget::Streak, &look, &sample()), draw(&a, Widget::Streak, &Look::default(), &sample()));
    }
}
