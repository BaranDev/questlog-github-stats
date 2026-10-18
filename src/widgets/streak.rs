//! /streak, the Campfire: a fire sized by the current streak (smoking ashes at 0), a notch per 5 days of the best
//! streak, and the numbers beside it. The flames flicker, and a scene may light its painting around them (glow).
use crate::canvas::Image;
use crate::card::{Card, LINE};
use crate::fmt::{line, number};
use crate::scene::OH;
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
        let value = look.value(k, if unit { format!("{n} {days}") } else { n });
        c.say(&line(&assets.text_font, &look.label(scene, k), &value, text.w), text.x, y);
        y += LINE;
    }
    // A note goes where most of it fits, preferring: under the lines (when hidden ones left room), under the
    // notches, then above the lines and below the titles.
    let tb = painting.anchors.title;
    let top = (tb.y + tb.lines as i64 * tb.line_h).max(painting.anchors.subtitle.y + LINE);
    let above = (text.y - look.note.len() as i64 * LINE).max(top);
    c.note(&look.note, &[
        (text.x, y, text.w, text.y + text.h),
        (text.x, notches.y + notches.h + 2, text.w, OH as i64 - 2),
        (text.x, above, text.w, text.y),
    ]);
    if shown("best") {
        let marks = (s.best_streak as i64 / 5).min(notches.w / 4);
        let ink = c.ink("notch");
        for i in 0..marks {
            let x = notches.x + i * 4;
            c.layer.fill_rect(x, notches.y, x + 1, notches.y + notches.h - 1, ink);
        }
    }
    let prefix = tier(s.current_streak);
    let (night, themed) = (c.night, look.themed);
    let frames =
        |p: &str| -> Vec<&Image> { (0..).map_while(|i| scene.sprite(&format!("{p}-{i}"), night, themed)).collect() };
    let sprites = frames(prefix);
    // the light a burning fire throws on the painting around it: full-card overlays at painting scale, under the text
    let glows = prefix.strip_prefix("flame-").map(|t| frames(&format!("glow-{t}"))).unwrap_or_default();
    let (base, cx, ground) = (c.layer.clone(), fire.x + fire.w / 2, fire.y + fire.h);
    (0..FRAMES)
        .map(|f| {
            c.layer = match glows.get(f % glows.len().max(1)) {
                Some(glow) => {
                    // drawn as painted, not night-toned: a glow is light, and a night glow is made for the night
                    let mut layer = Image::new(base.w, base.h);
                    layer.alpha_composite(glow, 0, 0);
                    layer.alpha_composite(&base, 0, 0);
                    layer
                }
                None => base.clone(),
            };
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
    fn themed_fire_is_the_scenes_own_where_it_has_one() {
        let a = Assets::embedded().unwrap();
        let s = UserStats { current_streak: 45, ..sample() };
        let draw_as = |scene: &str, themed: bool, night: bool| {
            let look = Look { scene: scene.into(), themed, night, ..Default::default() };
            draw(&a, Widget::Streak, &look, &s).unwrap()
        };
        for night in [false, true] {
            let (own, classic) = (draw_as("observatory", true, night), draw_as("observatory", false, night));
            assert_ne!(own, classic, "a scene with its own fire");
            // (every scene has its own fire now; scene.rs tests the fallback to classic for one without)
            let look = Look { scene: "observatory".into(), themed: true, night, ..Default::default() };
            assert_scene_colors(&a, &look, &draw_as("observatory", true, night));
        }
        let default = Look { scene: "observatory".into(), ..Default::default() };
        let by_default = draw(&a, Widget::Streak, &default, &s).unwrap();
        assert_eq!(draw_as("observatory", false, false), by_default, "classic by default");
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
