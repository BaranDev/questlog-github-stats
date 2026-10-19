//! Embedded art: per scene a palette, named inks, a night table and default words, plus each widget's painting
//! (160×64 shown ×2, or 320×128 used as-is) with the anchors its renderer fills, and art-scale sprites. Fonts are
//! embedded here too.
use crate::BoxError;
use crate::canvas::{Image, Rgb};
use crate::text::Font;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};

pub mod embedded {
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
    /// <scene>/sprites-night/<name>.png: drawn instead of the sprite of the same name at night (a fire's glow is
    /// copied from the painting it lights, and the night painting differs).
    pub night_sprites: HashMap<String, Image>,
    /// fire=themed: <scene>/sprites-themed/ and sprites-themed-night/, the scene's own fire colors. A scene without
    /// them draws the classic fire.
    pub themed_sprites: HashMap<String, Image>,
    pub themed_night_sprites: HashMap<String, Image>,
}

impl Scene {
    /// The sprite to draw at this time of day and in this fire style: the night version when there is one, the
    /// themed one when asked for and the scene has it, else the classic one.
    pub fn sprite(&self, name: &str, night: bool, themed: bool) -> Option<&Image> {
        type Sprites = HashMap<String, Image>;
        fn pick<'a>(day: &'a Sprites, nights: &'a Sprites, name: &str, night: bool) -> Option<&'a Image> {
            night.then(|| nights.get(name)).flatten().or_else(|| day.get(name))
        }
        let own = if themed { pick(&self.themed_sprites, &self.themed_night_sprites, name, night) } else { None };
        own.or_else(|| pick(&self.sprites, &self.night_sprites, name, night))
    }

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
        s.extend(crate::widgets::languages::rune_colors());
        s
    }
}

/// Widget -> the anchor boxes its renderer needs.
const WIDGET_BOXES: [(&str, &[&str]); 3] =
    [("stats", &["left", "right"]), ("languages", &["list"]), ("streak", &["fire", "text", "notches"])];
const REQUIRED_SPRITES: [&str; 5] = ["flame-small-0", "flame-steady-0", "flame-bonfire-0", "ashes-0", "rune-othala"];

/// A scene that lacks a piece a renderer needs fails at load, naming the scene and the piece.
fn validate(scene: &Scene) -> Result<(), BoxError> {
    let name = &scene.name;
    for (w, boxes) in WIDGET_BOXES {
        let painting = scene.paintings.get(w).ok_or(format!("{name}: painting {w:?} missing ({w}.png and {w}.json)"))?;
        for b in boxes {
            if !painting.anchors.boxes.contains_key(*b) {
                return Err(format!("{name}: {w} box {b:?} missing").into());
            }
        }
        if !scene.titles.contains_key(w) {
            return Err(format!("{name}: title for {w:?} missing").into());
        }
    }
    if let Some(p) = scene.paintings.get("languages-3") {
        if !p.anchors.boxes.contains_key("list") {
            return Err(format!("{name}: languages-3 box \"list\" missing").into());
        }
    }
    if let Some(sprite) = REQUIRED_SPRITES.iter().find(|s| !scene.sprites.contains_key(**s)) {
        return Err(format!("{name}: sprite {sprite:?} missing").into());
    }
    Ok(())
}

pub struct Assets {
    pub scenes: HashMap<String, Scene>,
    pub title_font: Font,
    pub title_small: Font,
    /// The title fonts at twice the size, for titles drawn on the card's finer title layer.
    pub title_fine: Font,
    pub title_small_fine: Font,
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
    /// <scene>/sprites/<name>.png (+ sprites-night/, sprites-themed/, sprites-themed-night/), plus
    /// _shared/sprites/<name>.png for all scenes.
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
                night_sprites: HashMap::new(),
                themed_sprites: HashMap::new(),
                themed_night_sprites: HashMap::new(),
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
                } else if let Some(sprite) = rest.strip_prefix("sprites-night/").and_then(|s| s.strip_suffix(".png")) {
                    scene.night_sprites.insert(sprite.to_string(), Image::decode(b)?);
                } else if let Some(sprite) = rest.strip_prefix("sprites-themed/").and_then(|s| s.strip_suffix(".png")) {
                    scene.themed_sprites.insert(sprite.to_string(), Image::decode(b)?);
                } else if let Some(sprite) =
                    rest.strip_prefix("sprites-themed-night/").and_then(|s| s.strip_suffix(".png"))
                {
                    scene.themed_night_sprites.insert(sprite.to_string(), Image::decode(b)?);
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
            validate(&scene)?;
            scenes.insert(name.to_string(), scene);
        }
        Ok(Assets {
            scenes,
            title_font: Font::from_bytes(TITLE_FONT, TITLE_SIZE)?,
            title_small: Font::from_bytes(TITLE_FONT, TITLE_SMALL_SIZE)?,
            title_fine: Font::from_bytes(TITLE_FONT, 2 * TITLE_SIZE)?,
            title_small_fine: Font::from_bytes(TITLE_FONT, 2 * TITLE_SMALL_SIZE)?,
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

/// Small complete scenes built in memory, for tests of the loader and the card code.
#[cfg(test)]
pub(crate) mod fixture {
    use super::*;

    pub const ANCHORS: &str = r#"{"title":{"x":8,"y":40,"w":90,"lines":2,"line_h":18},"subtitle":{"x":0,"y":0,"w":10},"message":{"x":0,"y":0,"w":10,"h":10},"style":"ink","boxes":{"left":{"x":0,"y":0,"w":1,"h":1},"right":{"x":0,"y":0,"w":1,"h":1},"list":{"x":0,"y":0,"w":1,"h":1},"fire":{"x":0,"y":0,"w":1,"h":1},"text":{"x":0,"y":0,"w":1,"h":1},"notches":{"x":0,"y":0,"w":1,"h":1}}}"#;
    pub const COLOR: Rgb = [0x11, 0x22, 0x33];
    pub const NIGHT_COLOR: Rgb = [0x44, 0x55, 0x66];

    pub fn leak(b: Vec<u8>) -> &'static [u8] {
        Box::leak(b.into_boxed_slice())
    }

    pub fn solid(w: usize, h: usize, c: Rgb) -> &'static [u8] {
        let mut img = Image::new(w, h);
        img.fill_rect(0, 0, w as i64 - 1, h as i64 - 1, c);
        leak(img.to_png())
    }

    pub type Files = Vec<(String, &'static [u8])>;

    /// Every file a valid scene needs: 160×64 paintings, anchors, titles, the required sprites.
    pub fn scene(name: &str) -> Files {
        let inks = ["title", "title_edge", "text", "bar", "bar_track", "xp", "spark", "notch"]
            .map(|k| format!(r##""{k}":"#112233""##))
            .join(",");
        let json = format!(
            r##"{{"palette":["#112233"],"ink":{{{inks}}},"night":{{"#112233":"#445566"}},"titles":{{"stats":"S","languages":"L","streak":"C"}},"labels":{{}}}}"##
        );
        let mut files: Files = vec![(format!("{name}/scene.json"), leak(json.into_bytes()))];
        for w in ["stats", "languages", "streak"] {
            files.push((format!("{name}/{w}.json"), ANCHORS.as_bytes()));
            files.push((format!("{name}/{w}.png"), solid(PAINT_W, PAINT_H, COLOR)));
        }
        for s in REQUIRED_SPRITES {
            files.push((format!("{name}/sprites/{s}.png"), solid(2, 2, COLOR)));
        }
        files
    }

    /// Load `files` plus `extra`; a later entry replaces an earlier one with the same path, and `None` removes it.
    pub fn with(files: Files, extra: Vec<(&str, Option<&'static [u8]>)>) -> Result<Assets, BoxError> {
        let mut kept: Files = files;
        for (p, b) in extra {
            kept.retain(|(q, _)| q != p);
            if let Some(b) = b {
                kept.push((p.to_string(), b));
            }
        }
        let refs: Vec<(&str, &'static [u8])> = kept.iter().map(|(p, b)| (p.as_str(), *b)).collect();
        Assets::from_files(&refs)
    }
}

#[cfg(test)]
mod tests {
    use super::fixture::*;
    use super::*;

    fn assets() -> Assets {
        Assets::embedded().expect("embedded art loads")
    }

    #[test]
    fn every_scene_is_complete() {
        let a = assets();
        assert!(a.scene_names().contains(&"forest"));
        assert!(!a.scene_names().contains(&"_shared"));
        for s in a.scenes.values() {
            for w in ["stats", "languages", "streak"] {
                let p = &s.paintings[w];
                assert_eq!((p.image.w, p.image.h), (OW, OH), "{} {w}", s.name);
                if let Some(n) = &p.night {
                    assert_eq!((n.w, n.h), (OW, OH), "{} {w} night", s.name);
                }
                assert!(s.titles.contains_key(w), "{} {w} title", s.name);
            }
            for t in REQUIRED_SPRITES {
                assert!(s.sprites.contains_key(t), "{} {t}", s.name);
            }
        }
    }

    #[test]
    fn palette_rule_and_night_coverage() {
        let a = assets();
        for s in a.scenes.values() {
            let mut day: HashSet<Rgb> = s.palette.iter().copied().collect();
            day.extend(s.inks.values().copied());
            let allowed = s.allowed();
            // rune masks are white and always recolored when drawn
            let all = s.sprites.iter().chain(&s.themed_sprites);
            let sprites = all.filter(|(n, _)| !n.starts_with("rune-")).map(|(_, i)| i);
            let images = s.paintings.values().map(|p| &p.image).chain(sprites);
            for img in images {
                for p in img.px.iter().filter(|p| p[3] > 0) {
                    assert!(day.contains(&[p[0], p[1], p[2]]), "{} uses off-palette {:?}", s.name, p);
                }
            }
            let night_sprites = s.night_sprites.values().chain(s.themed_night_sprites.values());
            for night in s.paintings.values().filter_map(|p| p.night.as_ref()).chain(night_sprites) {
                for p in night.px.iter().filter(|p| p[3] > 0) {
                    assert!(allowed.contains(&[p[0], p[1], p[2]]), "{} night painting uses off-palette {:?}", s.name, p);
                }
            }
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
        for &c in &s.palette {
            assert_eq!(s.tone(c, false), c, "day is untouched");
        }
        assert!(s.palette.iter().any(|&c| s.tone(c, true) != c), "night changes some colors");
        assert_eq!(s.ink("title", true), s.inks["title"], "title gold stays lit at night");
        assert_eq!(s.label("commits"), "Commits");
        assert_eq!(s.label("nope"), "nope");
    }

    #[test]
    fn shared_sprites_reach_every_scene_and_scenes_override_them() {
        let (a, c) = ([1, 1, 1], [3, 3, 3]);
        let assets = with(
            [scene("one"), scene("two")].concat(),
            vec![
                ("_shared/sprites/lit.png", Some(solid(2, 2, a))),
                ("_shared/sprites/both.png", Some(solid(2, 2, a))),
                ("one/sprites/both.png", Some(solid(2, 2, c))),
            ],
        )
        .unwrap();
        assert_eq!(assets.scene_names(), vec!["one", "two"], "_shared is not a scene");
        let (one, two) = (assets.scene("one").unwrap(), assets.scene("two").unwrap());
        assert_eq!(one.sprites["lit"].px[0][..3], a);
        assert_eq!(two.sprites["lit"].px[0][..3], a);
        assert_eq!(one.sprites["both"].px[0][..3], c, "scene sprite wins");
        assert_eq!(two.sprites["both"].px[0][..3], a, "shared fills in");
    }

    #[test]
    fn night_sprites_replace_their_day_sprite_at_night_only() {
        let (a, c) = ([1, 1, 1], [3, 3, 3]);
        let assets = with(
            scene("one"),
            vec![("one/sprites/glow.png", Some(solid(2, 2, a))), ("one/sprites-night/glow.png", Some(solid(2, 2, c)))],
        )
        .unwrap();
        let one = assets.scene("one").unwrap();
        assert_eq!(one.sprite("glow", false, false).unwrap().px[0][..3], a);
        assert_eq!(one.sprite("glow", true, false).unwrap().px[0][..3], c);
        let night_falls_back = one.sprite("flame-small-0", true, false).is_some();
        assert!(night_falls_back, "no night version: the day sprite serves the night");
        assert!(one.sprite("missing", true, false).is_none());
    }

    #[test]
    fn themed_sprites_win_when_asked_and_fall_back_to_classic() {
        let (a, c, t, tn) = ([1, 1, 1], [3, 3, 3], [5, 5, 5], [7, 7, 7]);
        let assets = with(
            [scene("one"), scene("two")].concat(),
            vec![
                ("one/sprites/glow.png", Some(solid(2, 2, a))),
                ("one/sprites-night/glow.png", Some(solid(2, 2, c))),
                ("one/sprites-themed/glow.png", Some(solid(2, 2, t))),
                ("one/sprites-themed-night/glow.png", Some(solid(2, 2, tn))),
                ("two/sprites/glow.png", Some(solid(2, 2, a))),
            ],
        )
        .unwrap();
        let (one, two) = (assets.scene("one").unwrap(), assets.scene("two").unwrap());
        assert_eq!(one.sprite("glow", false, true).unwrap().px[0][..3], t);
        assert_eq!(one.sprite("glow", true, true).unwrap().px[0][..3], tn);
        assert_eq!(one.sprite("glow", false, false).unwrap().px[0][..3], a, "classic unless asked");
        assert_eq!(two.sprite("glow", false, true).unwrap().px[0][..3], a, "no themed art: the classic fire");
    }

    #[test]
    fn shared_sprites_can_complete_a_scene() {
        let a = with(
            scene("t"),
            vec![("t/sprites/rune-othala.png", None), ("_shared/sprites/rune-othala.png", Some(solid(5, 9, [255; 3])))],
        )
        .unwrap();
        assert!(a.scene("t").unwrap().sprites.contains_key("rune-othala"));
    }

    #[test]
    fn paintings_come_in_two_sizes() {
        let red = [200, 0, 0];
        for (w, h) in [(PAINT_W, PAINT_H), (OW, OH)] {
            let a = with(scene("t"), vec![("t/stats.png", Some(solid(w, h, red)))]).unwrap_or_else(|e| panic!("{w}x{h}: {e}"));
            let img = &a.scene("t").unwrap().paintings["stats"].image;
            assert_eq!((img.w, img.h), (OW, OH), "{w}x{h}");
            assert_eq!(img.px[OW * OH - 1], [200, 0, 0, 255]);
        }
        let err = with(scene("t"), vec![("t/stats.png", Some(solid(100, 50, red)))]).err().expect("100x50 is rejected");
        assert!(err.to_string().contains("t/stats.png"), "{err}");
    }

    #[test]
    fn a_scene_missing_a_piece_fails_naming_scene_and_piece() {
        assert!(with(scene("t"), vec![]).is_ok());
        let no_title = r##"{"palette":[],"ink":{"title":"#000000","title_edge":"#000000","text":"#000000","bar":"#000000","bar_track":"#000000","xp":"#000000","spark":"#000000","notch":"#000000"},"night":{},"titles":{"stats":"S","languages":"L"},"labels":{}}"##;
        let mut cases: Vec<(Vec<(String, Option<&'static [u8]>)>, String)> = Vec::new();
        for w in ["stats", "languages", "streak"] {
            cases.push((vec![(format!("t/{w}.json"), None)], w.to_string()));
        }
        for s in REQUIRED_SPRITES {
            cases.push((vec![(format!("t/sprites/{s}.png"), None)], s.to_string()));
        }
        cases.push((vec![("t/scene.json".to_string(), Some(no_title.as_bytes()))], "streak".to_string()));
        for (w, b) in [("stats", "right"), ("languages", "list"), ("streak", "notches")] {
            let gone = format!(r#""{b}":{{"x":0,"y":0,"w":1,"h":1}}"#);
            let json = ANCHORS.replace(&format!("{gone},"), "").replace(&format!(",{gone}"), "");
            assert_ne!(json, ANCHORS, "{b} removed");
            cases.push((vec![(format!("t/{w}.json"), Some(leak(json.into_bytes())))], b.to_string()));
        }
        for (extra, piece) in cases {
            let extra: Vec<(&str, Option<&'static [u8]>)> = extra.iter().map(|(p, b)| (p.as_str(), *b)).collect();
            let msg = with(scene("t"), extra).err().unwrap_or_else(|| panic!("{piece}: loaded")).to_string();
            assert!(msg.contains(&piece) && (msg.starts_with("t:") || msg.contains("t/")), "{piece}: {msg}");
        }
    }
}
