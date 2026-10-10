//! /languages, the Spellbook: up to five languages, each with a rune in its color (snapped to the scene palette),
//! its name, its share and a bar scaled to the top language. Sparkles drift up from the runes.
use crate::canvas::{Image, Rgb};
use crate::card::Card;
use crate::scene::Scene;
use crate::stats::UserStats;
use crate::widgets::{FRAMES, Look};

const ROW: i64 = 11;
const PAPER: Rgb = [0xF2, 0xF0, 0xA0];
/// GitHub linguist colors for common languages; anything else gets the paper color.
const COLORS: &[(&str, Rgb)] = &[
    ("TypeScript", [0x31, 0x78, 0xC6]), ("JavaScript", [0xF1, 0xE0, 0x5A]), ("Python", [0x35, 0x72, 0xA5]),
    ("Rust", [0xDE, 0xA5, 0x84]), ("Go", [0x00, 0xAD, 0xD8]), ("C#", [0x17, 0x86, 0x00]),
    ("Java", [0xB0, 0x72, 0x19]), ("Kotlin", [0xA9, 0x7B, 0xFF]), ("C", [0x55, 0x55, 0x55]),
    ("C++", [0xF3, 0x4B, 0x7D]), ("HTML", [0xE3, 0x4C, 0x26]), ("CSS", [0x66, 0x33, 0x99]),
    ("Shell", [0x89, 0xE0, 0x51]), ("PowerShell", [0x01, 0x24, 0x56]), ("Ruby", [0x70, 0x15, 0x16]),
    ("PHP", [0x4F, 0x5D, 0x95]), ("Swift", [0xF0, 0x51, 0x38]), ("Dart", [0x00, 0xB4, 0xAB]),
    ("Vue", [0x41, 0xB8, 0x83]), ("Lua", [0x00, 0x00, 0x80]), ("Jupyter Notebook", [0xDA, 0x5B, 0x0B]),
    ("GDScript", [0x35, 0x55, 0x70]), ("Svelte", [0xFF, 0x3E, 0x00]), ("Zig", [0xEC, 0x91, 0x5C]),
];

pub fn lang_color(name: &str) -> Rgb {
    COLORS.iter().find(|(n, _)| *n == name).map_or(PAPER, |(_, c)| *c)
}

pub fn snap(scene: &Scene, c: Rgb) -> Rgb {
    let dist = |p: &Rgb| (0..3).map(|i| (p[i] as i32 - c[i] as i32).pow(2)).sum::<i32>();
    scene.palette.iter().copied().min_by_key(dist).unwrap_or(c)
}

pub fn render(mut c: Card, look: &Look, s: &UserStats) -> Vec<Image> {
    let (scene, painting) = (c.scene, c.painting);
    c.title(&look.title_or(scene, "languages"));
    if let Some(sub) = &look.subtitle {
        c.subtitle(sub);
    }
    let list = painting.anchors.boxes["list"];
    let langs: Vec<&(String, f64)> =
        s.languages.iter().filter(|(n, _)| !look.hide.contains(&n.to_lowercase())).take(5).collect();
    if langs.is_empty() {
        c.message("No spells learned yet");
        return vec![c.frame()];
    }
    let top = langs[0].1.max(f64::EPSILON);
    let mut runes = Vec::new();
    for (i, (name, share)) in langs.iter().enumerate() {
        let y = list.y + i as i64 * ROW;
        let color = scene.tone(snap(scene, lang_color(name)), c.night);
        // a scene may draw a rune per language (sprites/rune-rust.png); the generic rune is the fallback
        let shape = scene.sprites.get(&format!("rune-{}", name.to_lowercase())).unwrap_or(&scene.sprites["rune"]);
        let rune = shape.map_colors(|_| color).scaled(2);
        c.layer.alpha_composite(&rune, list.x, y - 1);
        runes.push((list.x + 4, y - 1));
        let pct = format!("{}%", (share * 100.0).round() as u64);
        c.row(name, &pct, list.x + 12, y, list.w - 12);
        c.bar(list.x + 12, y + 7, list.w - 12, share / top, color);
    }
    let (base, spark) = (c.layer.clone(), c.ink("spark"));
    (0..FRAMES)
        .map(|f| {
            c.layer = base.clone();
            for (i, &(x, y)) in runes.iter().enumerate() {
                let rise = ((f + i * 3) % 4) as i64 * 2;
                let sx = x + if (f + i) % 2 == 0 { -2 } else { 2 };
                c.layer.fill_rect(sx, y - 2 - rise, sx + 1, y - 1 - rise, spark);
            }
            c.frame()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scene::Assets;
    use crate::widgets::{FRAMES, Widget, assert_scene_colors, empty, render as draw, sample};

    #[test]
    fn animates_within_the_palette() {
        let a = Assets::embedded().unwrap();
        for night in [false, true] {
            let look = Look { night, ..Default::default() };
            let frames = draw(&a, Widget::Languages, &look, &sample()).unwrap();
            assert_eq!(frames.len(), FRAMES);
            assert_ne!(frames[0], frames[1], "sparkles move");
            assert_scene_colors(&a, &look, &frames);
        }
        let still = Look { animate: false, ..Default::default() };
        assert_eq!(draw(&a, Widget::Languages, &still, &sample()).unwrap().len(), 1);
    }

    #[test]
    fn hide_promotes_the_next_language() {
        let a = Assets::embedded().unwrap();
        let mut look = Look::default();
        look.hide.insert("typescript".into());
        assert_ne!(draw(&a, Widget::Languages, &look, &sample()), draw(&a, Widget::Languages, &Look::default(), &sample()));
    }

    #[test]
    fn colors_snap_to_the_palette() {
        let a = Assets::embedded().unwrap();
        let s = a.scene("forest").unwrap();
        for name in ["Rust", "TypeScript", "Brainfuck"] {
            assert!(s.palette.contains(&snap(s, lang_color(name))), "{name}");
        }
    }

    #[test]
    fn empty_account_draws_every_widget() {
        let a = Assets::embedded().unwrap();
        for w in [Widget::Stats, Widget::Languages, Widget::Streak] {
            let frames = draw(&a, w, &Look::default(), &empty()).unwrap();
            assert_scene_colors(&a, &Look::default(), &frames);
        }
    }
}
