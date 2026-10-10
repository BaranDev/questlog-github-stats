//! Embedded art: per scene a palette, named inks, a night table and default words, plus each widget's painting
//! (160×64, shown ×2) with the anchors its renderer fills, and art-scale sprites. Fonts are embedded here too.
use crate::BoxError;
use crate::canvas::{Image, Rgb};
use crate::text::Font;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};

mod embedded {
    include!(concat!(env!("OUT_DIR"), "/art_files.rs"));
}
static TITLE_FONT: &[u8] = include_bytes!("../fonts/NodestoCapsCondensed-Bold.otf");
static TEXT_FONT: &[u8] = include_bytes!("../fonts/Tiny5-Regular.ttf");

pub const OW: usize = 320;
pub const OH: usize = 128;
pub const PAINT_W: usize = 160;
pub const PAINT_H: usize = 64;
const REQUIRED_INKS: [&str; 8] = ["title", "title_edge", "text", "bar", "bar_track", "xp", "spark", "notch"];

#[derive(Clone, Copy, Debug, Deserialize)]
pub struct Rect {
    pub x: i64,
    pub y: i64,
    pub w: i64,
    pub h: i64,
}

fn one() -> usize {
    1
}
fn title_line() -> i64 {
    24
}

#[derive(Clone, Copy, Debug, Deserialize)]
pub struct TextBox {
    pub x: i64,
    pub y: i64,
    pub w: i64,
    #[serde(default = "one")]
    pub lines: usize,
    #[serde(default = "title_line")]
    pub line_h: i64,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Style {
    Ink,      // plain ink, for text on paper
    Outlined, // title colors with a dark edge, for text on busy art
}

#[derive(Clone, Debug, Deserialize)]
pub struct Anchors {
    pub title: TextBox,
    pub subtitle: TextBox,
    pub message: Rect,
    pub style: Style,
    #[serde(default)]
    pub boxes: HashMap<String, Rect>,
}

pub struct Painting {
    pub image: Image,
    pub anchors: Anchors,
}

#[derive(Deserialize)]
struct SceneFile {
    palette: Vec<String>,
    ink: HashMap<String, String>,
    night: HashMap<String, String>,
    titles: HashMap<String, String>,
    labels: HashMap<String, String>,
}

pub struct Scene {
    pub name: String,
    pub palette: Vec<Rgb>,
    pub inks: HashMap<String, Rgb>,
    night: HashMap<Rgb, Rgb>,
    pub titles: HashMap<String, String>,
    pub labels: HashMap<String, String>,
    pub paintings: HashMap<String, Painting>,
    pub sprites: HashMap<String, Image>,
}

impl Scene {
    pub fn tone(&self, c: Rgb, night: bool) -> Rgb {
        if night { self.night.get(&c).copied().unwrap_or(c) } else { c }
    }

    pub fn ink(&self, name: &str, night: bool) -> Rgb {
        self.tone(self.inks[name], night) // REQUIRED_INKS are checked at load
    }

    pub fn tint(&self, img: &Image, night: bool) -> Image {
        if night { img.map_colors(|c| self.tone(c, true)) } else { img.clone() }
    }

    pub fn label<'a>(&'a self, key: &'a str) -> &'a str {
        self.labels.get(key).map_or(key, String::as_str)
    }

    /// Every color a card in this scene may contain, day or night.
    pub fn allowed(&self) -> HashSet<Rgb> {
        let mut s: HashSet<Rgb> = self.palette.iter().copied().collect();
        s.extend(self.inks.values().copied());
        s.extend(self.night.values().copied());
        s
    }
}

pub struct Assets {
    pub scenes: HashMap<String, Scene>,
    pub title_font: Font,
    pub text_font: Font,
}

fn hex(s: &str) -> Result<Rgb, BoxError> {
    let s = s.trim_start_matches('#');
    if s.len() != 6 {
        return Err(format!("bad color {s:?}").into());
    }
    let ch = |i: usize| u8::from_str_radix(&s[i..i + 2], 16);
    Ok([ch(0)?, ch(2)?, ch(4)?])
}

impl Assets {
    pub fn embedded() -> Result<Assets, BoxError> {
        Assets::from_files(embedded::FILES)
    }

    /// `files` are (path under art/, bytes). Layout: <scene>/scene.json, <scene>/<widget>.png + .json,
    /// <scene>/sprites/<name>.png.
    pub fn from_files(files: &[(&str, &'static [u8])]) -> Result<Assets, BoxError> {
        let file = |p: &str| files.iter().find(|(n, _)| *n == p).map(|(_, b)| *b);
        let mut scenes = HashMap::new();
        for (path, bytes) in files {
            let Some(name) = path.strip_suffix("/scene.json") else { continue };
            let sf: SceneFile = serde_json::from_slice(bytes)?;
            let mut scene = Scene {
                name: name.to_string(),
                palette: sf.palette.iter().map(|c| hex(c)).collect::<Result<_, _>>()?,
                inks: sf.ink.iter().map(|(k, v)| Ok((k.clone(), hex(v)?))).collect::<Result<_, BoxError>>()?,
                night: sf.night.iter().map(|(k, v)| Ok((hex(k)?, hex(v)?))).collect::<Result<_, BoxError>>()?,
                titles: sf.titles,
                labels: sf.labels,
                paintings: HashMap::new(),
                sprites: HashMap::new(),
            };
            if let Some(missing) = REQUIRED_INKS.iter().find(|k| !scene.inks.contains_key(**k)) {
                return Err(format!("{name}: ink {missing:?} missing").into());
            }
            let prefix = format!("{name}/");
            for (p, b) in files.iter().filter(|(p, _)| p.starts_with(&prefix)) {
                let rest = &p[prefix.len()..];
                if let Some(sprite) = rest.strip_prefix("sprites/").and_then(|s| s.strip_suffix(".png")) {
                    scene.sprites.insert(sprite.to_string(), Image::decode(b)?);
                } else if let Some(widget) = rest.strip_suffix(".json").filter(|w| *w != "scene" && !w.contains('/')) {
                    let png = file(&format!("{prefix}{widget}.png")).ok_or(format!("{p}: painting missing"))?;
                    let img = Image::decode(png)?;
                    if (img.w, img.h) != (PAINT_W, PAINT_H) {
                        return Err(format!("{p}: painting must be {PAINT_W}×{PAINT_H}").into());
                    }
                    let anchors: Anchors = serde_json::from_slice(b)?;
                    scene.paintings.insert(widget.to_string(), Painting { image: img.scaled(2), anchors });
                }
            }
            scenes.insert(name.to_string(), scene);
        }
        Ok(Assets {
            scenes,
            title_font: Font::from_bytes(TITLE_FONT, 30)?,
            text_font: Font::from_bytes(TEXT_FONT, 8)?,
        })
    }

    pub fn scene(&self, name: &str) -> Option<&Scene> {
        self.scenes.get(name)
    }

    pub fn scene_names(&self) -> Vec<&str> {
        let mut v: Vec<&str> = self.scenes.keys().map(String::as_str).collect();
        v.sort();
        v
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assets() -> Assets {
        Assets::embedded().expect("embedded art loads")
    }

    #[test]
    fn forest_is_complete() {
        let a = assets();
        assert_eq!(a.scene_names(), vec!["forest"]);
        let s = a.scene("forest").unwrap();
        for w in ["stats", "languages", "streak"] {
            let p = &s.paintings[w];
            assert_eq!((p.image.w, p.image.h), (OW, OH), "{w}");
            assert!(s.titles.contains_key(w), "{w} title");
        }
        for (w, boxes) in [("stats", &["left", "right"][..]), ("languages", &["list"]), ("streak", &["fire", "text", "notches"])] {
            for b in boxes {
                assert!(s.paintings[w].anchors.boxes.contains_key(*b), "{w}.{b}");
            }
        }
        for t in ["small", "steady", "bonfire"] {
            assert!(s.sprites.contains_key(&format!("flame-{t}-0")));
        }
        assert!(s.sprites.contains_key("ashes-0") && s.sprites.contains_key("rune"));
    }

    #[test]
    fn palette_rule_and_night_coverage() {
        let a = assets();
        for s in a.scenes.values() {
            let mut day: HashSet<Rgb> = s.palette.iter().copied().collect();
            day.extend(s.inks.values().copied());
            let images = s.paintings.values().map(|p| &p.image).chain(s.sprites.values());
            for img in images {
                for p in img.px.iter().filter(|p| p[3] > 0) {
                    assert!(day.contains(&[p[0], p[1], p[2]]), "{} uses off-palette {:?}", s.name, p);
                }
            }
            let allowed = s.allowed();
            for c in &day {
                assert!(s.night.contains_key(c), "{}: no night color for {:?}", s.name, c);
                assert!(allowed.contains(&s.tone(*c, true)));
            }
        }
    }

    #[test]
    fn tone_maps_only_at_night() {
        let a = assets();
        let s = a.scene("forest").unwrap();
        let text = s.inks["text"];
        assert_eq!(s.tone(text, false), text);
        assert_ne!(s.tone(text, true), text);
        assert_eq!(s.ink("title", true), s.inks["title"], "title gold stays lit at night");
        assert_eq!(s.label("commits"), "Commits");
        assert_eq!(s.label("nope"), "nope");
    }
}
