//! Embedded art: per scene a palette, named inks, a night table and default words, plus each widget's painting
//! (160×64 shown ×2, or 320×128 used as-is) with the anchors its renderer fills, and art-scale sprites. Fonts are
//! embedded here too.
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
pub const TITLE_SIZE: u32 = 30;
pub const TITLE_SMALL_SIZE: u32 = 20;
pub const PAINT_W: usize = 160;
pub const PAINT_H: usize = 64;
/// Sprites every scene gets; a scene's own sprite of the same name wins. `_shared` has no scene.json, so it is no scene.
const SHARED_SPRITES: &str = "_shared/sprites/";
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
fn title_size() -> u32 {
    TITLE_SIZE
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
    /// Title font size: 30, or 20 for the smaller title. Ignored on subtitles.
    #[serde(default = "title_size")]
    pub size: u32,
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
    /// `<widget>-night.png`, when the scene paints its own night version; otherwise the night table tints `image`.
    pub night: Option<Image>,
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
    pub title_small: Font,
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

/// A painting PNG at art scale (160×64, shown ×2) or at overlay scale (320×128, as-is), returned at overlay scale.
fn painting_image(path: &str, png: &[u8]) -> Result<Image, BoxError> {
    let img = Image::decode(png)?;
    match (img.w, img.h) {
        (PAINT_W, PAINT_H) => Ok(img.scaled(2)),
        (OW, OH) => Ok(img),
        (w, h) => Err(format!("{path}: painting must be {PAINT_W}×{PAINT_H} or {OW}×{OH}, got {w}×{h}").into()),
    }
}

impl Assets {
    pub fn embedded() -> Result<Assets, BoxError> {
        Assets::from_files(embedded::FILES)
    }

    /// `files` are (path under art/, bytes). Layout: <scene>/scene.json, <scene>/<widget>.png + .json (+ <widget>-night.png),
    /// <scene>/sprites/<name>.png, plus _shared/sprites/<name>.png for all scenes.
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
            for (p, b) in files.iter().filter(|(p, _)| p.starts_with(SHARED_SPRITES)) {
                if let Some(sprite) = p[SHARED_SPRITES.len()..].strip_suffix(".png") {
                    scene.sprites.insert(sprite.to_string(), Image::decode(b)?);
                }
            }
            let prefix = format!("{name}/");
            for (p, b) in files.iter().filter(|(p, _)| p.starts_with(&prefix)) {
                let rest = &p[prefix.len()..];
                if let Some(sprite) = rest.strip_prefix("sprites/").and_then(|s| s.strip_suffix(".png")) {
                    scene.sprites.insert(sprite.to_string(), Image::decode(b)?);
                } else if let Some(widget) = rest.strip_suffix(".json").filter(|w| *w != "scene" && !w.contains('/')) {
                    let png_path = format!("{prefix}{widget}.png");
                    let png = file(&png_path).ok_or(format!("{p}: painting missing"))?;
                    let anchors: Anchors = serde_json::from_slice(b)?;
                    let image = painting_image(&png_path, png)?;
                    let night_path = format!("{prefix}{widget}-night.png");
                    let night = file(&night_path).map(|b| painting_image(&night_path, b)).transpose()?;
                    if ![TITLE_SIZE, TITLE_SMALL_SIZE].contains(&anchors.title.size) {
                        return Err(format!("{p}: title size must be {TITLE_SIZE} or {TITLE_SMALL_SIZE}").into());
                    }
                    scene.paintings.insert(widget.to_string(), Painting { image, night, anchors });
                }
            }
            scenes.insert(name.to_string(), scene);
        }
        Ok(Assets {
            scenes,
            title_font: Font::from_bytes(TITLE_FONT, TITLE_SIZE)?,
            title_small: Font::from_bytes(TITLE_FONT, TITLE_SMALL_SIZE)?,
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
            let sprites = s.sprites.iter().filter(|(n, _)| !n.starts_with("rune-")).map(|(_, i)| i); // white masks, recolored when drawn
            let images = s.paintings.values().map(|p| &p.image).chain(sprites);
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

    const SCENE_JSON: &str = r##"{"palette":["#112233"],"ink":{"title":"#112233","title_edge":"#112233","text":"#112233","bar":"#112233","bar_track":"#112233","xp":"#112233","spark":"#112233","notch":"#112233"},"night":{},"titles":{},"labels":{}}"##;
    const ANCHORS_JSON: &str = r#"{"title":{"x":0,"y":0,"w":10},"subtitle":{"x":0,"y":0,"w":10},"message":{"x":0,"y":0,"w":10,"h":10},"style":"ink"}"#;

    fn solid(w: usize, h: usize, c: Rgb) -> &'static [u8] {
        let mut img = Image::new(w, h);
        img.fill_rect(0, 0, w as i64 - 1, h as i64 - 1, c);
        Box::leak(img.to_png().into_boxed_slice())
    }

    fn load(files: Vec<(&str, &'static [u8])>) -> Result<Assets, BoxError> {
        Assets::from_files(&files)
    }

    #[test]
    fn shared_sprites_reach_every_scene_and_scenes_override_them() {
        let (a, c) = ([1, 1, 1], [3, 3, 3]);
        let assets = load(vec![
            ("_shared/sprites/lit.png", solid(2, 2, a)),
            ("_shared/sprites/both.png", solid(2, 2, a)),
            ("one/scene.json", SCENE_JSON.as_bytes()),
            ("one/sprites/both.png", solid(2, 2, c)),
            ("two/scene.json", SCENE_JSON.as_bytes()),
        ])
        .unwrap();
        assert_eq!(assets.scene_names(), vec!["one", "two"], "_shared is not a scene");
        let (one, two) = (assets.scene("one").unwrap(), assets.scene("two").unwrap());
        assert_eq!(one.sprites["lit"].px[0][..3], a);
        assert_eq!(two.sprites["lit"].px[0][..3], a);
        assert_eq!(one.sprites["both"].px[0][..3], c, "scene sprite wins");
        assert_eq!(two.sprites["both"].px[0][..3], a, "shared fills in");
    }

    #[test]
    fn paintings_come_in_two_sizes() {
        let red = [200, 0, 0];
        for (w, h) in [(PAINT_W, PAINT_H), (OW, OH)] {
            let a = load(vec![
                ("t/scene.json", SCENE_JSON.as_bytes()),
                ("t/stats.json", ANCHORS_JSON.as_bytes()),
                ("t/stats.png", solid(w, h, red)),
            ])
            .unwrap_or_else(|e| panic!("{w}x{h}: {e}"));
            let img = &a.scene("t").unwrap().paintings["stats"].image;
            assert_eq!((img.w, img.h), (OW, OH), "{w}x{h}");
            assert_eq!(img.px[OW * OH - 1], [200, 0, 0, 255]);
        }
        let err = load(vec![
            ("t/scene.json", SCENE_JSON.as_bytes()),
            ("t/stats.json", ANCHORS_JSON.as_bytes()),
            ("t/stats.png", solid(100, 50, red)),
        ])
        .err()
        .expect("100x50 is rejected");
        assert!(err.to_string().contains("t/stats.png"), "{err}");
    }
}
