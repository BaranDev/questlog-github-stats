//! Drawing one card: the scene painting (night-toned on request) under a transparent 320×128 layer for text,
//! bars and sprites. Every color comes from the scene, so cards obey the palette rule by construction.
use crate::canvas::{Image, Rgb};
use crate::fmt::{fit, wrap};
use crate::scene::{Assets, OH, OW, Painting, Scene, Style};
use crate::text::TextMask;

pub const LINE: i64 = 10;

pub struct Card<'a> {
    pub assets: &'a Assets,
    pub scene: &'a Scene,
    pub painting: &'a Painting,
    pub night: bool,
    pub layer: Image,
}

impl<'a> Card<'a> {
    pub fn new(assets: &'a Assets, scene: &'a Scene, widget: &str, night: bool) -> Option<Card<'a>> {
        let painting = scene.paintings.get(widget)?;
        Some(Card { assets, scene, painting, night, layer: Image::new(OW, OH) })
    }

    pub fn ink(&self, name: &str) -> Rgb {
        self.scene.ink(name, self.night)
    }

    /// Pillow's `ImageDraw.text` with fontmode "1": every mask pixel becomes exactly `c`.
    fn stamp(&mut self, m: &TextMask, x: i64, y: i64, c: Rgb) {
        for row in 0..m.height {
            for col in 0..m.width {
                if m.on[(row * m.width + col) as usize] {
                    self.layer.set(x + m.x_offset + col, y + m.y_offset + row, c);
                }
            }
        }
    }

    pub fn text(&mut self, s: &str, x: i64, y: i64, c: Rgb) {
        let m = self.assets.text_font.render(s);
        self.stamp(&m, x, y, c);
    }

    /// Title-colored text with a 1 px dark edge (and a drop shadow), stamped as offsets like the Pillow cards.
    pub fn outlined(&mut self, title_font: bool, s: &str, x: i64, y: i64, shadow: bool) {
        let font = if title_font { &self.assets.title_font } else { &self.assets.text_font };
        let m = font.render(s);
        let (x, y) = (x - m.x_offset + 1, y - m.y_offset + 1);
        let span: &[i64] = if shadow { &[-1, 0, 1, 2] } else { &[-1, 0, 1] };
        let (edge, gold) = (self.ink("title_edge"), self.ink("title"));
        for &dx in span {
            for &dy in span {
                self.stamp(&m, x + dx, y + dy, edge);
            }
        }
        self.stamp(&m, x, y, gold);
    }

    /// Body text in the painting's style: plain ink on paper, outlined on busy art.
    pub fn say(&mut self, s: &str, x: i64, y: i64) {
        match self.painting.anchors.style {
            Style::Ink => self.text(s, x, y, self.ink("text")),
            Style::Outlined => self.outlined(false, s, x, y, false),
        }
    }

    pub fn title(&mut self, s: &str) {
        let tb = self.painting.anchors.title;
        for (i, line) in wrap(&self.assets.title_font, s, tb.w, tb.lines).iter().enumerate() {
            self.outlined(true, line, tb.x, tb.y + i as i64 * tb.line_h, true);
        }
    }

    pub fn subtitle(&mut self, s: &str) {
        let tb = self.painting.anchors.subtitle;
        let line = fit(&self.assets.text_font, s, tb.w);
        self.outlined(false, &line, tb.x, tb.y, false);
    }

    /// Label left, value right-aligned; the label gives way (trimmed) so big numbers never collide.
    pub fn row(&mut self, label: &str, value: &str, x: i64, y: i64, w: i64) -> String {
        let vw = self.assets.text_font.length(value);
        let label = fit(&self.assets.text_font, label, w - vw - 2);
        self.say(&label, x, y);
        self.say(value, x + w - vw, y);
        label
    }

    /// A 2 px bar: the track in `bar_track`, filled in whole art pixels.
    pub fn bar(&mut self, x: i64, y: i64, w: i64, frac: f64, fill: Rgb) {
        self.layer.fill_rect(x, y, x + w - 1, y + 1, self.ink("bar_track"));
        let n = ((w as f64 * frac.clamp(0.0, 1.0) / 2.0).round() as i64) * 2;
        if n > 0 {
            self.layer.fill_rect(x, y, x + n - 1, y + 1, fill);
        }
    }

    /// An art-scale sprite standing on `ground`, centered on `cx`, night-toned. Returns its top y.
    pub fn sprite(&mut self, img: &Image, cx: i64, ground: i64) -> i64 {
        let big = self.scene.tint(img, self.night).scaled(2);
        let (x, y) = (cx - (big.w as i64 / 2 / 2 * 2), ground - big.h as i64);
        self.layer.alpha_composite(&big, x, y);
        y
    }

    /// A message centered in the painting's message area (placeholder and error cards).
    pub fn message(&mut self, msg: &str) {
        let r = self.painting.anchors.message;
        let font = &self.assets.text_font;
        let lines = wrap(font, msg, r.w, (r.h / LINE).max(1) as usize);
        let lens: Vec<i64> = lines.iter().map(|l| font.length(l)).collect();
        let top = r.y + (r.h - lines.len() as i64 * LINE) / 2;
        for (i, (line, len)) in lines.iter().zip(lens).enumerate() {
            self.say(line, r.x + (r.w - len) / 2, top + i as i64 * LINE);
        }
    }

    pub fn frame(&self) -> Image {
        let mut out = self.scene.tint(&self.painting.image, self.night);
        out.alpha_composite(&self.layer, 0, 0);
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scene::Assets;

    fn drawn_right_edge(img: &Image) -> i64 {
        let mut right = -1;
        for y in 0..img.h {
            for x in 0..img.w {
                if img.px[y * img.w + x][3] > 0 {
                    right = right.max(x as i64);
                }
            }
        }
        right
    }

    #[test]
    fn default_title_wraps_onto_two_lines() {
        let a = Assets::embedded().unwrap();
        let s = a.scene("forest").unwrap();
        let c = Card::new(&a, s, "stats", false).unwrap();
        let tb = c.painting.anchors.title;
        assert_eq!(wrap(&a.title_font, "Character Sheet", tb.w, tb.lines), vec!["Character", "Sheet"]);
    }

    #[test]
    fn hostile_titles_stay_in_their_box() {
        let a = Assets::embedded().unwrap();
        let s = a.scene("forest").unwrap();
        for title in ["x".repeat(200), "🐉🐉🐉 漢字漢字 ünïcödé".to_string(), "W".repeat(60)] {
            let mut c = Card::new(&a, s, "stats", false).unwrap();
            let tb = c.painting.anchors.title;
            c.title(&title);
            assert!(drawn_right_edge(&c.layer) <= tb.x + tb.w + 3, "title {title:?} overflows");
        }
    }

    #[test]
    fn rows_keep_the_value_whole() {
        let a = Assets::embedded().unwrap();
        let mut c = Card::new(&a, a.scene("forest").unwrap(), "stats", false).unwrap();
        let label = c.row("Commits", "12,345", 0, 0, 48);
        assert!(a.text_font.length(&label) + 2 + a.text_font.length("12,345") <= 48, "{label}");
    }

    #[test]
    fn rows_with_a_huge_value_never_overlap() {
        let a = Assets::embedded().unwrap();
        let mut c = Card::new(&a, a.scene("forest").unwrap(), "stats", false).unwrap();
        let label = c.row("Commits", "123,456,789", 0, 0, 30);
        let f = &a.text_font;
        assert!(label.is_empty() || f.length(&label) + 2 + f.length("123,456,789") <= 30, "{label:?}");
    }

    #[test]
    fn frames_use_only_scene_colors() {
        let a = Assets::embedded().unwrap();
        let s = a.scene("forest").unwrap();
        for night in [false, true] {
            let mut c = Card::new(&a, s, "streak", night).unwrap();
            c.title("Campfire");
            c.say("Current 4 days", 196, 60);
            c.bar(196, 80, 40, 0.5, c.ink("bar"));
            c.sprite(&s.sprites["flame-steady-0"], 160, 112);
            let allowed = s.allowed();
            assert!(c.frame().px.iter().all(|p| allowed.contains(&[p[0], p[1], p[2]])), "night={night}");
        }
    }

    #[test]
    fn missing_painting_is_none() {
        let a = Assets::embedded().unwrap();
        assert!(Card::new(&a, a.scene("forest").unwrap(), "trophies", false).is_none());
    }
}
