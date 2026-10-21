//! One card: the scene painting (night-toned on request) under a transparent 320×128 layer for text, bars and
//! sprites. Every color comes from the scene (palette rule) except URL text colors, used as given day and night.
use crate::canvas::{Image, Rgb};
use crate::fmt::{fit, wrap};
use crate::scene::{Assets, OH, OW, Painting, Scene, Style, TITLE_SMALL_SIZE};
use crate::text::{Font, TextMask};

pub const LINE: i64 = 10;

pub struct Card<'a> {
    pub assets: &'a Assets,
    pub scene: &'a Scene,
    pub painting: &'a Painting,
    pub night: bool,
    pub layer: Image,
    /// Requested text colors (title fill, body fill, text outline), drawn untoned.
    pub title_color: Option<Rgb>,
    pub text_color: Option<Rgb>,
    pub outline_color: Option<Rgb>,
    /// truncate=false: a subtitle too long for its room is drawn whole instead of trimmed.
    pub truncate: bool,
    /// The title at twice the card's resolution, laid over every frame at scale 2 or more so big letters stay
    /// readable. None at scale 1, where the title is in `layer`.
    pub title_layer: Option<Image>,
    /// pixels=chunky: the painting drawn in 2x2 blocks; the text, bars and fire keep their own pixels.
    pub chunky: bool,
}

/// Where note lines may go: x, top y, width, and the y they must end above.
pub type Spot = (i64, i64, i64, i64);

impl<'a> Card<'a> {
    pub fn new(assets: &'a Assets, scene: &'a Scene, widget: &str, night: bool) -> Option<Card<'a>> {
        let painting = scene.paintings.get(widget)?;
        Some(Card {
            assets,
            scene,
            painting,
            night,
            layer: Image::new(OW, OH),
            title_color: None,
            text_color: None,
            outline_color: None,
            truncate: true,
            title_layer: None,
            chunky: false,
        })
    }

    pub fn ink(&self, name: &str) -> Rgb {
        self.scene.ink(name, self.night)
    }

    pub fn text(&mut self, s: &str, x: i64, y: i64, c: Rgb) {
        let m = self.assets.text_font.render(s);
        stamp(&mut self.layer, &m, x, y, c);
    }

    fn title_ink(&self) -> Rgb {
        self.title_color.unwrap_or(self.ink("title"))
    }

    /// Text in `fill` with a 1 px dark edge (and a drop shadow), stamped as offsets like the Pillow cards.
    pub fn outlined(&mut self, font: &Font, s: &str, x: i64, y: i64, shadow: bool, fill: Rgb) {
        let edge = self.outline_color.unwrap_or(self.ink("title_edge"));
        outline(&mut self.layer, &font.render(s), x + 1, y + 1, 1, shadow, (edge, fill));
    }

    /// Body text in the painting's style: plain ink on paper, outlined on busy art.
    pub fn say(&mut self, s: &str, x: i64, y: i64) {
        match self.painting.anchors.style {
            Style::Ink => self.text(s, x, y, self.text_color.unwrap_or(self.ink("text"))),
            Style::Outlined => {
                let fill = self.text_color.unwrap_or(self.ink("title"));
                self.outlined(&self.assets.text_font, s, x, y, false, fill)
            }
        }
    }

    /// The font a title box asks for (`size` 20 is the smaller one).
    pub fn title_font(&self) -> &'a Font {
        let assets = self.assets;
        if self.painting.anchors.title.size == TITLE_SMALL_SIZE { &assets.title_small } else { &assets.title_font }
    }

    /// Draws the title; returns the width of its first line, so a subtitle can follow it on the same line.
    pub fn title(&mut self, s: &str) -> i64 {
        let (tb, font) = (self.painting.anchors.title, self.title_font());
        let assets = self.assets;
        let lines = wrap(font, s, tb.w, tb.lines);
        let fine = if tb.size == TITLE_SMALL_SIZE { &assets.title_small_fine } else { &assets.title_fine };
        let ink = (self.outline_color.unwrap_or(self.ink("title_edge")), self.title_ink());
        for (i, line) in lines.iter().enumerate() {
            let y = tb.y + i as i64 * tb.line_h;
            if let Some(layer) = &mut self.title_layer {
                // the same letters at twice the size on a grid twice as fine, outlined 1 card pixel as before
                outline(layer, &fine.render(line), 2 * (tb.x + 1), 2 * (y + 1), 2, true, ink);
            } else {
                self.outlined(font, line, tb.x, y, true, ink.1);
            }
        }
        lines.first().map_or(0, |l| font.length(l) + 3)
    }

    /// Where the subtitle starts: after the title's real width on the title's line, or at its own x when the
    /// scene puts it on a line of its own under the title (a page too narrow for both).
    pub fn subtitle_x(&self, title_width: i64) -> i64 {
        let (tb, title) = (self.painting.anchors.subtitle, self.painting.anchors.title);
        if tb.y >= title.y + title.line_h { tb.x } else { tb.x.max(title.x + title_width + 6) }
    }

    /// The subtitle after the title: the title always gets its room and the subtitle takes what is left,
    /// trimmed unless truncate=false.
    pub fn subtitle_after(&mut self, s: &str, title_width: i64) {
        let tb = self.painting.anchors.subtitle;
        let x = self.subtitle_x(title_width);
        let line = if self.truncate { fit(&self.assets.text_font, s, tb.x + tb.w - x) } else { s.to_string() };
        self.outlined(&self.assets.text_font, &line, x, tb.y, false, self.title_ink());
    }

    pub fn subtitle(&mut self, s: &str) {
        let tb = self.painting.anchors.subtitle;
        let line = if self.truncate { fit(&self.assets.text_font, s, tb.w) } else { s.to_string() };
        self.outlined(&self.assets.text_font, &line, tb.x, tb.y, false, self.title_ink());
    }

    /// Label left, value right-aligned; the label gives way (trimmed) so big numbers never collide. A value
    /// wider than the row is trimmed too.
    pub fn row(&mut self, label: &str, value: &str, x: i64, y: i64, w: i64) -> String {
        let value = fit(&self.assets.text_font, value, w);
        let vw = self.assets.text_font.length(&value);
        let label = fit(&self.assets.text_font, label, w - vw - 2);
        self.say(&label, x, y);
        self.say(&value, x + w - vw, y);
        label
    }

    /// Note lines in the first spot that holds the most of them, each trimmed to the spot's width. Lines that fit
    /// nowhere are dropped.
    pub fn note(&mut self, lines: &[String], spots: &[Spot]) {
        let room = |&(_, y, _, bottom): &Spot| ((bottom - y) / LINE).max(0) as usize;
        let Some(&spot) = spots.iter().rev().max_by_key(|s| room(s).min(lines.len())) else { return };
        let (x, y, w, _) = spot;
        for (i, line) in lines.iter().take(room(&spot)).enumerate() {
            let line = fit(&self.assets.text_font, line, w);
            self.say(&line, x, y + i as i64 * LINE);
        }
    }

    /// A 2 px bar: the track in `bar_track`, filled in whole art pixels.
    pub fn bar(&mut self, x: i64, y: i64, w: i64, frac: f64, fill: Rgb) {
        self.layer.fill_rect(x, y, x + w - 1, y + 1, self.ink("bar_track"));
        let n = ((w as f64 * frac.clamp(0.0, 1.0) / 2.0).round() as i64) * 2;
        if n > 0 {
            self.layer.fill_rect(x, y, x + n - 1, y + 1, fill);
        }
    }

    /// An art-scale sprite standing on `ground`, centered on `cx`, night-toned. Returns its top y. It is drawn twice its
    /// size: with Eagle on fine cards, so its pixels match the painting's, and pixel for pixel on chunky ones.
    pub fn sprite(&mut self, img: &Image, cx: i64, ground: i64) -> i64 {
        let small = self.scene.tint(img, self.night);
        let big = if self.chunky { small.scaled(2) } else { small.eagle() };
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
        let mut out = match (&self.painting.night, self.night) {
            (Some(night), true) => night.clone(),
            _ => self.scene.tint(&self.painting.image, self.night),
        };
        if self.chunky {
            out = out.chunky();
        }
        out.alpha_composite(&self.layer, 0, 0);
        out
    }
}

/// Pillow's `ImageDraw.text` with fontmode "1": every mask pixel becomes exactly `c`.
fn stamp(img: &mut Image, m: &TextMask, x: i64, y: i64, c: Rgb) {
    for row in 0..m.height {
        for col in 0..m.width {
            if m.on[(row * m.width + col) as usize] {
                img.set(x + m.x_offset + col, y + m.y_offset + row, c);
            }
        }
    }
}

/// Text in `ink.1` over an edge in `ink.0` `unit` pixels wide (and a drop shadow as wide again), stamped as offsets
/// like the Pillow cards, with the ink's top left at (x, y).
pub(crate) fn outline(img: &mut Image, m: &TextMask, x: i64, y: i64, unit: i64, shadow: bool, ink: (Rgb, Rgb)) {
    let (x, y) = (x - m.x_offset, y - m.y_offset);
    let reach = if shadow { 2 * unit } else { unit };
    for dx in -unit..=reach {
        for dy in -unit..=reach {
            stamp(img, m, x + dx, y + dy, ink.0);
        }
    }
    stamp(img, m, x, y, ink.1);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scene::Assets;
    use crate::scene::fixture::*;

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
        assert_eq!(wrap(&a.title_font, "Character Sheet", 100, 2), vec!["Character", "Sheet"]);
        for scene in a.scenes.values() {
            let c = Card::new(&a, scene, "stats", false).unwrap();
            let tb = c.painting.anchors.title;
            let font = if tb.size == 20 { &a.title_small } else { &a.title_font };
            let lines = wrap(font, "Character Sheet", tb.w, tb.lines);
            assert!(lines.iter().all(|l| font.length(l) <= tb.w), "{}: {lines:?}", scene.name);
        }
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
    fn night_painting_is_used_when_present_and_the_tint_when_absent() {
        let night_png = solid(OW, OH, [0xAA, 0xBB, 0xCC]);
        let with_night = with(scene("t"), vec![("t/stats-night.png", Some(night_png))]).unwrap();
        let t = with_night.scene("t").unwrap();
        assert_eq!(t.paintings.len(), 3, "-night.png is not a widget");
        let day = Card::new(&with_night, t, "stats", false).unwrap().frame();
        let night = Card::new(&with_night, t, "stats", true).unwrap().frame();
        assert_eq!([day.px[0][0], day.px[0][1], day.px[0][2]], COLOR);
        assert_eq!(night.px[0], [0xAA, 0xBB, 0xCC, 255], "own night painting");

        let tinted = with(scene("t"), vec![]).unwrap();
        let night = Card::new(&tinted, tinted.scene("t").unwrap(), "stats", true).unwrap().frame();
        assert_eq!([night.px[0][0], night.px[0][1], night.px[0][2]], NIGHT_COLOR, "falls back to the night table");
    }

    #[test]
    fn small_titles_wrap_and_fit_inside_their_box() {
        let anchors = |size: u32| ANCHORS.replace(r#""line_h":18"#, &format!(r#""line_h":18,"size":{size}"#));
        let a = with(
            [scene("t"), scene("u")].concat(),
            vec![
                ("t/stats.json", Some(leak(anchors(20).into_bytes()))),
                ("u/stats.json", Some(leak(anchors(30).into_bytes()))),
            ],
        )
        .unwrap();
        let (small, big) = (Card::new(&a, a.scene("t").unwrap(), "stats", false).unwrap(), Card::new(&a, a.scene("u").unwrap(), "stats", false).unwrap());
        assert!(std::ptr::eq(small.title_font(), &a.title_small) && std::ptr::eq(big.title_font(), &a.title_font));
        assert!(a.title_small.length("Character") < a.title_font.length("Character"));
        let tb = small.painting.anchors.title;
        for title in ["x".repeat(200), "🐉🐉🐉 漢字漢字 ünïcödé".to_string(), "W".repeat(60), "Character Sheet of Doom".to_string()] {
            let mut c = Card::new(&a, a.scene("t").unwrap(), "stats", false).unwrap();
            c.title(&title);
            assert!(drawn_right_edge(&c.layer) <= tb.x + tb.w + 3, "title {title:?} overflows");
            let lines = wrap(&a.title_small, &title, tb.w, tb.lines);
            assert!(lines.len() <= tb.lines && lines.iter().all(|l| a.title_small.length(l) <= tb.w), "{title:?}");
        }
        let bad = ANCHORS.replace(r#""line_h":18"#, r#""line_h":18,"size":25"#);
        assert!(with(scene("t"), vec![("t/stats.json", Some(leak(bad.into_bytes())))]).is_err(), "only 30 and 20 are allowed");
    }

    #[test]
    fn missing_painting_is_none() {
        let a = Assets::embedded().unwrap();
        assert!(Card::new(&a, a.scene("forest").unwrap(), "trophies", false).is_none());
    }
}
