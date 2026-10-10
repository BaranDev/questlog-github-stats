//! /streak, the Campfire: a fire sized by the current streak (smoking ashes at 0), a notch per 5 days of the best
//! streak, and the numbers beside it. The flames flicker.
use crate::canvas::Image;
use crate::card::{Card, LINE};
use crate::fmt::{fit, number};
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
        let line = if unit { format!("{} {n} {days}", look.label(scene, k)) } else { format!("{} {n}", look.label(scene, k)) };
        c.say(&fit(&assets.text_font, &line, text.w), text.x, y);
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
    fn hide_removes_lines() {
        let a = Assets::embedded().unwrap();
        let mut look = Look::default();
        look.hide.insert("total".into());
        assert_ne!(draw(&a, Widget::Streak, &look, &sample()), draw(&a, Widget::Streak, &Look::default(), &sample()));
    }
}
