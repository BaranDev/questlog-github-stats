//! Text the way Pillow draws it with `fontmode = "1"`: glyph outlines hinted like FreeType (skrifa's ports of the
//! TrueType interpreter and the Adobe CFF hinter), rasterized by our port of FreeType's monochrome scan converter,
//! and laid out with Pillow's basic layout (hinted, pixel-rounded advances, no kerning).

use crate::raster::{self, Contour, Pt, Seg};
use skrifa::outline::{DrawSettings, Engine, HintingInstance, HintingOptions, OutlinePen, Target};
use skrifa::prelude::{LocationRef, Size};
use skrifa::raw::TableProvider;
use skrifa::{FontRef, MetadataProvider};
use crate::BoxError;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

/// FreeType's PIXEL(): 26.6 to whole pixels, rounding.
fn pixel(x: i64) -> i64 {
    (x + 32) >> 6
}

#[derive(Clone)]
struct Glyph {
    advance: i64,       // 26.6, already rounded to whole pixels
    cbox: [i64; 4],     // control box in pixels, grid-fitted outward: x_min, y_min, x_max, y_max
    left: i64,          // monochrome bitmap placement, y up from the baseline
    top: i64,
    width: i64,
    rows: i64,
    bits: Vec<bool>,    // rows top-down
}

/// What Pillow's `getmask2` returns: a mask plus its offset from the draw position.
pub struct TextMask {
    pub x_offset: i64,
    pub y_offset: i64,
    pub width: i64,
    pub height: i64,
    pub on: Vec<bool>,
}

pub struct Font {
    data: &'static [u8],
    hinter: HintingInstance,
    high_precision: bool,
    ascender: i64,
    // Keyed by glyph id: every character the font can't draw shares the .notdef entry, so the cache is bounded by the
    // font's glyph count. One Font serves every render thread.
    cache: RwLock<HashMap<u32, Arc<Glyph>>>,
}

/// Characters rasterized once at load; anything else is rasterized on first use and then cached by glyph id.
const PRELOAD: &str = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";

impl Font {
    /// `size` is the em in pixels, as with `ImageFont.truetype(path, size)`.
    pub fn from_bytes(data: &'static [u8], size: u32) -> Result<Font, BoxError> {
        let font = FontRef::new(data)?;
        let options = HintingOptions { engine: Engine::AutoFallback, target: Target::Mono };
        let hinter = HintingInstance::new(&font.outline_glyphs(), Size::new(size as f32), LocationRef::default(), options)?;
        // size->metrics.ascender: FreeType ceils it for CFF and rounds it for TrueType fonts with integer ppem
        let ascender = font.hhea()?.ascender().to_i16() as f64 * size as f64 / font.head()?.units_per_em() as f64;
        let ascender = if font.cff().is_ok() { ascender.ceil() } else { ascender.round() } as i64;
        let high_precision = size < 24; // the drivers set FT_OUTLINE_HIGH_PRECISION below 24 ppem
        let f = Font { data, hinter, high_precision, ascender, cache: RwLock::new(HashMap::new()) };
        for ch in PRELOAD.chars() {
            f.glyph(ch);
        }
        Ok(f)
    }

    fn glyph_id(&self, ch: char) -> u32 {
        let font = FontRef::new(self.data).expect("font parsed at load");
        font.charmap().map(ch).unwrap_or_default().to_u32()
    }

    fn glyph(&self, ch: char) -> Arc<Glyph> {
        let gid = self.glyph_id(ch);
        if let Some(g) = self.cache.read().expect("glyph cache lock").get(&gid) {
            return g.clone();
        }
        let g = Arc::new(self.load_glyph(gid));
        self.cache.write().expect("glyph cache lock").entry(gid).or_insert(g).clone()
    }

    fn load_glyph(&self, gid: u32) -> Glyph {
        let font = FontRef::new(self.data).expect("font parsed at load");
        let gid = skrifa::GlyphId::new(gid);
        let mut pen = ContourPen::default();
        let mut advance = 0;
        if let Some(outline) = font.outline_glyphs().get(gid) {
            let metrics = outline.draw(DrawSettings::hinted(&self.hinter, false), &mut pen).expect("glyph draws");
            advance = ((metrics.advance_width.unwrap_or(0.0) as f64 * 64.0).round() as i64 + 32) & !63;
        }
        pen.finish();
        let contours = pen.contours;
        // FT_Outline_Get_CBox over every point, on- and off-curve
        let mut cb = [i64::MAX, i64::MAX, i64::MIN, i64::MIN];
        for c in &contours {
            let pts = c.segs.iter().flat_map(|s| match *s {
                Seg::Line(p) => vec![p],
                Seg::Conic(a, p) => vec![a, p],
                Seg::Cubic(a, b, p) => vec![a, b, p],
            });
            for p in std::iter::once(c.start).chain(pts) {
                cb = [cb[0].min(p.x), cb[1].min(p.y), cb[2].max(p.x), cb[3].max(p.y)];
            }
        }
        if contours.is_empty() {
            cb = [0; 4];
        }
        // ft_glyphslot_preset_bitmap, mono branch: round the box so pixel centers inside are kept
        let (left, right) = mono_extent(cb[0], cb[2]);
        let (bottom, top) = mono_extent(cb[1], cb[3]);
        let (width, rows) = (right - left, top - bottom);
        let shifted: Vec<Contour> = contours.iter().map(|c| c.shifted(-left * 64, -bottom * 64)).collect();
        // CFF outlines carry no drop-out flags, so ftraster uses mode 1 (simple drop-outs, no stubs);
        // Tiny5 sits on the pixel grid at 8 px, so it never produces drop-outs whatever its SCANTYPE.
        let bits = raster::render(&shifted, width, rows, self.high_precision, 1);
        Glyph {
            advance,
            cbox: [cb[0] >> 6, cb[1] >> 6, (cb[2] + 63) >> 6, (cb[3] + 63) >> 6],
            left,
            top,
            width,
            rows,
            bits,
        }
    }

    /// `ImageDraw.textlength`: the sum of the advances.
    pub fn length(&self, text: &str) -> i64 {
        text.chars().map(|c| self.advance(c)).sum::<i64>() / 64
    }

    /// One character's advance in 26.6 pixels (always a whole number of pixels).
    pub fn advance(&self, ch: char) -> i64 {
        self.glyph(ch).advance
    }

    /// `FreeTypeFont.getmask2(text, "1")` with the default "la" anchor (Pillow 12 `font_render`).
    pub fn render(&self, text: &str) -> TextMask {
        let glyphs: Vec<Arc<Glyph>> = text.chars().map(|c| self.glyph(c)).collect();
        // bounding_box_and_anchors: glyph control boxes plus the pen line from 0 to the end
        let (mut pos, mut x_min, mut x_max, mut y_min, mut y_max) = (0, 0, 0, 0, 0);
        for g in &glyphs {
            let px = pixel(pos);
            pos += g.advance;
            x_max = x_max.max(pixel(pos)).max(g.cbox[2] + px);
            x_min = x_min.min(g.cbox[0] + px);
            y_max = y_max.max(g.cbox[3]);
            y_min = y_min.min(g.cbox[1]);
        }
        let (width, height) = (x_max - x_min, y_max - y_min);
        let mut on = vec![false; (width * height) as usize];
        // the pen origin inside the mask comes from the bitmap boxes, not the control boxes
        let (mut origin_x, mut origin_y, mut pos) = (0, 0, 0);
        for g in &glyphs {
            origin_x = origin_x.min(g.left + pixel(pos));
            origin_y = origin_y.max(g.top);
            pos += g.advance;
        }
        let mut pos = -origin_x * 64;
        for g in &glyphs {
            let (xx, yy) = (pixel(pos) + g.left, origin_y - g.top);
            for row in 0..g.rows {
                let ty = yy + row;
                if ty < 0 || ty >= height {
                    continue;
                }
                for col in 0..g.width {
                    let tx = xx + col;
                    if tx >= 0 && tx < width && g.bits[(row * g.width + col) as usize] {
                        on[(ty * width + tx) as usize] = true;
                    }
                }
            }
            pos += g.advance;
        }
        TextMask { x_offset: x_min, y_offset: self.ascender - y_max, width, height, on }
    }
}

/// Monochrome pixel extent of [lo, hi] (26.6), from ft_glyphslot_preset_bitmap.
fn mono_extent(lo: i64, hi: i64) -> (i64, i64) {
    let (rl, rh) = (lo & 63, hi & 63);
    let (mut a, mut b) = ((lo >> 6) + ((rl + 31) >> 6), (hi >> 6) + ((rh + 32) >> 6));
    if a == b {
        if ((rl + 31) & 63) - 31 + ((rh + 32) & 63) - 32 < 0 {
            a -= 1;
        } else {
            b += 1;
        }
    }
    (a, b)
}

impl Contour {
    fn shifted(&self, dx: i64, dy: i64) -> Contour {
        let s = |p: Pt| Pt { x: p.x + dx, y: p.y + dy };
        Contour {
            start: s(self.start),
            segs: self
                .segs
                .iter()
                .map(|seg| match *seg {
                    Seg::Line(p) => Seg::Line(s(p)),
                    Seg::Conic(a, p) => Seg::Conic(s(a), s(p)),
                    Seg::Cubic(a, b, p) => Seg::Cubic(s(a), s(b), s(p)),
                })
                .collect(),
        }
    }
}

/// Collects skrifa's path into contours of 26.6 points. CFF hinting yields 16.16 values, which FreeType
/// truncates to 26.6 (`>> 10`) before rasterizing; flooring does the same here.
#[derive(Default)]
struct ContourPen {
    contours: Vec<Contour>,
    open: Option<Contour>,
}

fn fixed(x: f32, y: f32) -> Pt {
    Pt { x: (x as f64 * 64.0).floor() as i64, y: (y as f64 * 64.0).floor() as i64 }
}

impl ContourPen {
    fn finish(&mut self) {
        if let Some(c) = self.open.take() {
            self.contours.push(c);
        }
    }
    fn seg(&mut self, seg: Seg) {
        self.open.as_mut().expect("path starts with move_to").segs.push(seg);
    }
}

impl OutlinePen for ContourPen {
    fn move_to(&mut self, x: f32, y: f32) {
        self.finish();
        self.open = Some(Contour { start: fixed(x, y), segs: Vec::new() });
    }
    fn line_to(&mut self, x: f32, y: f32) {
        self.seg(Seg::Line(fixed(x, y)));
    }
    fn quad_to(&mut self, cx0: f32, cy0: f32, x: f32, y: f32) {
        self.seg(Seg::Conic(fixed(cx0, cy0), fixed(x, y)));
    }
    fn curve_to(&mut self, cx0: f32, cy0: f32, cx1: f32, cy1: f32, x: f32, y: f32) {
        self.seg(Seg::Cubic(fixed(cx0, cy0), fixed(cx1, cy1), fixed(x, y)));
    }
    fn close(&mut self) {
        self.finish();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    static TINY: &[u8] = include_bytes!("../fonts/Tiny5-Regular.ttf");
    static TITLE: &[u8] = include_bytes!("../fonts/NodestoCapsCondensed-Bold.otf");

    fn send_sync<T: Send + Sync>() {}

    #[test]
    fn font_is_shareable() {
        send_sync::<Font>();
    }

    #[test]
    fn lengths_match_pillow() {
        let t = Font::from_bytes(TINY, 8).unwrap();
        assert_eq!(t.length("Commits"), 30);
        assert_eq!(t.length("Level 23"), 28);
        assert_eq!(Font::from_bytes(TITLE, 30).unwrap().length("Character"), 96);
    }

    #[test]
    fn mask_matches_pillow() {
        let m = Font::from_bytes(TINY, 8).unwrap().render("Ag");
        assert_eq!((m.x_offset, m.y_offset, m.width, m.height), (0, 2, 9, 6));
        let rows = [".##......", "#..#..##.", "####.#.#.", "#..#.#.#.", "#..#..##.", ".....##.."];
        for (y, row) in rows.iter().enumerate() {
            let got: String = (0..9).map(|x| if m.on[y * 9 + x] { '#' } else { '.' }).collect();
            assert_eq!(&got, row, "row {y}");
        }
    }

    #[test]
    fn cached_glyph_matches_fresh_rasterization() {
        let t = Font::from_bytes(TINY, 8).unwrap();
        let gid = t.glyph_id('é');
        let fresh = t.load_glyph(gid);
        let (a, b) = (t.render("é漢"), t.render("é漢"));
        assert_eq!((a.width, a.height, &a.on), (b.width, b.height, &b.on));
        let cached = t.glyph('é');
        assert_eq!((cached.advance, cached.cbox, &cached.bits), (fresh.advance, fresh.cbox, &fresh.bits));
        assert_eq!(t.glyph_id('漢'), t.glyph_id('字'), "undrawable characters share .notdef");
        assert_eq!(t.glyph_id('漢'), 0);
    }

    #[test]
    fn unknown_characters_do_not_panic() {
        let t = Font::from_bytes(TINY, 8).unwrap();
        let m = t.render("héllo 🐉 漢字");
        assert!(m.width > 0);
        assert!(t.length("🐉") >= 0);
    }
}
