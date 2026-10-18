//! /languages, the Spellbook: up to five languages, each with its rune in its (readable) language color, its name,
//! its share and a bar scaled to the top language. Sparkles drift up from the runes. Runes and bars keep their
//! colors at night: they glow.
use crate::canvas::{Image, Rgb};
use crate::card::{Card, LINE};
use crate::stats::UserStats;
use crate::widgets::{FRAMES, Look};

const ROW: i64 = 11;
/// Language, its GitHub linguist color, and its rune sprite (`rune-<name>`, a white 5×9 mask in the shared art).
pub const LANGS: &[(&str, Rgb, &str)] = &[
    ("Python", [0x35, 0x72, 0xA5], "perthro"),
    ("JavaScript", [0xF1, 0xE0, 0x5A], "jera"),
    ("TypeScript", [0x31, 0x78, 0xC6], "tiwaz"),
    ("Java", [0xB0, 0x72, 0x19], "eihwaz"),
    ("C#", [0x17, 0x86, 0x00], "sowilo"),
    ("C++", [0xF3, 0x4B, 0x7D], "kaunan"),
    ("C", [0x55, 0x55, 0x55], "calc"),
    ("PHP", [0x4F, 0x5D, 0x95], "wunjo"),
    ("Go", [0x00, 0xAD, 0xD8], "gebo"),
    ("Rust", [0xDE, 0xA5, 0x84], "raido"),
    ("Ruby", [0x70, 0x15, 0x16], "yr"),
    ("Kotlin", [0xA9, 0x7B, 0xFF], "gar"),
    ("Swift", [0xF0, 0x51, 0x38], "ear"),
    ("Dart", [0x00, 0xB4, 0xAB], "dagaz"),
    ("Shell", [0x89, 0xE0, 0x51], "stan"),
    ("PowerShell", [0x01, 0x24, 0x56], "thurisaz"),
    ("HTML", [0xE3, 0x4C, 0x26], "hagalaz"),
    ("CSS", [0x66, 0x33, 0x99], "algiz"),
    ("SCSS", [0xC6, 0x53, 0x8C], "ing-square"),
    ("Jupyter Notebook", [0xDA, 0x5B, 0x0B], "ingwaz"),
    ("Vue", [0x41, 0xB8, 0x83], "uruz"),
    ("Svelte", [0xFF, 0x3E, 0x00], "naudiz"),
    ("Lua", [0x00, 0x00, 0x80], "laguz"),
    ("R", [0x19, 0x8C, 0xE7], "ansuz"),
    ("Scala", [0xC2, 0x2D, 0x40], "berkanan"),
    ("Objective-C", [0x43, 0x8E, 0xFF], "ior"),
    ("Perl", [0x02, 0x98, 0xC3], "fehu"),
    ("Haskell", [0x5E, 0x50, 0x86], "mannaz"),
    ("Elixir", [0x6E, 0x4A, 0x7E], "ehwaz"),
    ("Dockerfile", [0x38, 0x4D, 0x54], "cealc"),
];
const OTHER: (Rgb, &str) = ([0xC8, 0x9B, 0x3C], "othala");

/// Blend toward white by 15% until the color is light enough (luma at least one half) to read on dark paper.
pub fn readable(c: Rgb) -> Rgb {
    let luma = |c: Rgb| (0.299 * c[0] as f64 + 0.587 * c[1] as f64 + 0.114 * c[2] as f64) / 255.0;
    let mut c = c;
    while luma(c) < 0.5 {
        c = c.map(|v| (v as f64 + (255.0 - v as f64) * 0.15).round() as u8);
    }
    c
}

/// The readable color and the rune sprite name for a language; unknown ones get othala in gold.
pub fn rune_of(name: &str) -> (Rgb, &'static str) {
    LANGS.iter().find(|(n, _, _)| *n == name).map_or(OTHER, |&(_, c, r)| (readable(c), r))
}

/// Every color a rune or bar can take, for the scene palette rule.
pub fn rune_colors() -> Vec<Rgb> {
    LANGS.iter().map(|&(_, c, _)| readable(c)).chain([readable(OTHER.0)]).collect()
}

/// A rune mask in `color` with a 1 px outline in the title edge ink, drawn unscaled with its top left at (x, y).
fn rune(c: &mut Card, mask: &Image, x: i64, y: i64, color: Rgb) {
    let edge = mask.map_colors(|_| c.ink("title_edge"));
    for dx in -1..=1 {
        for dy in -1..=1 {
            if (dx, dy) != (0, 0) {
                c.layer.alpha_composite(&edge, x + dx, y + dy);
            }
        }
    }
    c.layer.alpha_composite(&mask.map_colors(|_| color), x, y);
}

pub fn render(mut c: Card, look: &Look, s: &UserStats) -> Vec<Image> {
    let (scene, painting) = (c.scene, c.painting);
    c.title(&look.title_or(scene, "languages"));
    if let Some(sub) = &look.subtitle {
        c.subtitle(sub);
    }
    let list = painting.anchors.boxes["list"];
    // langs rows (five fill the page); each note line takes the place of the last language rows.
    let rows = ((look.langs as i64 * ROW - look.note.len() as i64 * LINE).max(0) / ROW) as usize;
    let langs: Vec<&(String, f64)> =
        s.languages.iter().filter(|(n, _)| !look.hide.contains(&n.to_lowercase())).take(rows).collect();
    if langs.is_empty() {
        c.message(look.word("empty", "No spells learned yet"));
        return vec![c.frame()];
    }
    let top = langs[0].1.max(f64::EPSILON);
    let mut runes = Vec::new();
    for (i, (name, share)) in langs.iter().enumerate() {
        let y = list.y + i as i64 * ROW;
        let (color, rune_name) = rune_of(name);
        let mask = scene.sprites.get(&format!("rune-{rune_name}")).unwrap_or(&scene.sprites["rune-othala"]);
        rune(&mut c, mask, list.x + 1, y, color);
        runes.push((list.x + 3, y - 1));
        let key = name.to_lowercase();
        let pct = look.value(&key, format!("{}{}", (share * 100.0).round() as u64, look.word("percent", "%")));
        c.row(look.word(&key, name), &pct, list.x + 12, y, list.w - 12);
        c.bar(list.x + 12, y + 7, list.w - 12, share / top, color);
    }
    let y = list.y + langs.len() as i64 * ROW;
    c.note(&look.note, &[(list.x + 12, y, list.w - 12, (list.y + list.h).max(list.y + 5 * ROW))]);
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
    fn every_language_has_its_rune_and_unknowns_get_othala() {
        let a = Assets::embedded().unwrap();
        let s = a.scene("forest").unwrap();
        for (name, _, rune) in LANGS {
            assert!(s.sprites.contains_key(&format!("rune-{rune}")), "{name}: rune-{rune}");
            assert_eq!(rune_of(name).1, *rune);
        }
        assert_eq!(rune_of("Brainfuck"), ([0xC8, 0x9B, 0x3C], "othala"));
        assert!(s.sprites.contains_key("rune-othala"));
    }

    #[test]
    fn dark_colors_are_lightened_until_readable() {
        assert_eq!(readable([0xF1, 0xE0, 0x5A]), [0xF1, 0xE0, 0x5A], "already light");
        for c in rune_colors() {
            assert!((0.299 * c[0] as f64 + 0.587 * c[1] as f64 + 0.114 * c[2] as f64) / 255.0 >= 0.5, "{c:?}");
        }
        assert!(readable([0x01, 0x24, 0x56]).iter().all(|&v| v > 0x56 / 2));
    }

    #[test]
    fn runes_keep_their_colors_at_night_and_are_in_the_palette_rule() {
        let a = Assets::embedded().unwrap();
        let s = a.scene("forest").unwrap();
        let look = Look { night: true, ..Default::default() };
        let frames = draw(&a, Widget::Languages, &look, &sample()).unwrap();
        let ts = rune_of("TypeScript").0;
        assert!(frames[0].px.iter().any(|p| [p[0], p[1], p[2]] == ts), "lit rune and bar at night");
        assert!(rune_colors().iter().all(|c| s.allowed().contains(c)));
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
