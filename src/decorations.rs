//! /decorations/<name>: the painted banners that head a README section or divide two, with an optional title in
//! the card title style. They show no stats, so they take only the options about their title and the image.
use crate::canvas::{Image, Rgb};
use crate::card::outline;
use crate::fmt::fit;
use crate::params::{clip, color, text};
use crate::scene::{Align, Assets};
use crate::widgets::Drawn;
use std::collections::HashMap;

pub const OPTIONS: [&str; 8] = ["title", "title_color", "outline_color", "truncate", "animate", "scale", "time", "pixels"];

#[derive(Debug, Clone, PartialEq)]
pub struct Options {
    pub title: String,
    pub title_color: Option<Rgb>,
    pub outline_color: Option<Rgb>,
    pub truncate: bool,
    pub animate: bool,
    pub scale: u8,
    /// `time=night`: the night painting, for a dark theme.
    pub night: bool,
    /// `pixels=chunky`: the painting in pixels twice as big.
    pub chunky: bool,
}

impl Default for Options {
    fn default() -> Options {
        Options { title: String::new(), title_color: None, outline_color: None, truncate: true, animate: true, scale: 5, night: false, chunky: false }
    }
}

/// The options, or the message for an error card. Card options such as `user` or `scene` are refused by name, so a
/// copied card address does not quietly draw something else.
pub fn parse(q: &HashMap<String, String>) -> Result<Options, String> {
    if let Some(k) = q.keys().filter(|k| !OPTIONS.contains(&k.as_str())).min() {
        return Err(format!("Decorations take {}; not '{}'", OPTIONS.join(", "), clip(k)));
    }
    let mut o = Options { title: q.get("title").map(|t| text(t)).unwrap_or_default(), ..Default::default() };
    let switch = |k: &str| match q.get(k).map(String::as_str) {
        None | Some("true") | Some("1") => Ok(true),
        Some("false") | Some("0") => Ok(false),
        Some(v) => Err(format!("Unknown {k} '{}' (use true or false)", clip(v))),
    };
    o.night = match q.get("time").map(String::as_str) {
        None | Some("day") => false,
        Some("night") => true,
        Some(t) => return Err(format!("Unknown time '{}' (use day or night)", clip(t))),
    };
    o.chunky = match q.get("pixels").map(String::as_str) {
        None | Some("fine") => false,
        Some("chunky") => true,
        Some(p) => return Err(format!("Unknown pixels '{}' (use fine or chunky)", clip(p))),
    };
    o.truncate = switch("truncate")?;
    o.animate = switch("animate")?;
    if let Some(v) = q.get("scale") {
        o.scale = match v.parse::<u8>() {
            Ok(n @ 1..=5) => n,
            _ => return Err(format!("Unknown scale '{}' (use 1 to 5)", clip(v))),
        };
    }
    for (k, slot) in [("title_color", &mut o.title_color), ("outline_color", &mut o.outline_color)] {
        if let Some(v) = q.get(k) {
            *slot = Some(color(v).ok_or_else(|| format!("Bad {k} '{}': use a hex color like FFD700", clip(v)))?);
        }
    }
    Ok(o)
}

/// The decoration's frames with its title (on the finer title layer from scale 2, as on the cards), and how long
/// each frame shows. None for an unknown name.
pub fn render(assets: &Assets, name: &str, o: &Options) -> Option<(Drawn, u16)> {
    let d = assets.decorations.get(name)?;
    let painting = if o.night && !d.night.is_empty() { &d.night } else { &d.frames };
    let mut frames = if o.animate { painting.clone() } else { painting[..1].to_vec() };
    if o.chunky {
        frames = frames.iter().map(Image::chunky).collect();
    }
    let (w, h) = (frames[0].w, frames[0].h);
    let mut title = (o.scale >= 2).then(|| Image::new(2 * w, 2 * h));
    let line = if o.truncate { fit(&assets.title_font, &o.title, d.title.w) } else { o.title.clone() };
    if !line.is_empty() {
        let width = assets.title_font.length(&line);
        let x = match d.title.align {
            Align::Left => d.title.x,
            Align::Center => d.title.x + (d.title.w - width) / 2,
            Align::Right => d.title.x + d.title.w - width,
        };
        let ink = (o.outline_color.unwrap_or(d.title_edge), o.title_color.unwrap_or(d.title_ink));
        match &mut title {
            Some(layer) => outline(layer, &assets.title_fine.render(&line), 2 * (x + 1), 2 * (d.title.y + 1), 2, true, ink),
            None => {
                let m = assets.title_font.render(&line);
                frames.iter_mut().for_each(|f| outline(f, &m, x + 1, d.title.y + 1, 1, true, ink));
            }
        }
    }
    Some((Drawn { frames, title }, d.frame_ms))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn q(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn only_the_title_and_image_options() {
        let o = parse(&q(&[("title", " About Me "), ("truncate", "false"), ("scale", "2"), ("title_color", "fff")])).unwrap();
        assert_eq!((o.title.as_str(), o.truncate, o.scale, o.title_color), ("About Me", false, 2, Some([255, 255, 255])));
        assert_eq!(parse(&q(&[])).unwrap(), Options::default(), "an empty title by default");
        let e = parse(&q(&[("title", "x"), ("user", "octocat")])).unwrap_err();
        assert!(e.starts_with("Decorations take title,") && e.ends_with("not 'user'"), "{e}");
        assert!(parse(&q(&[("scale", "9")])).unwrap_err().starts_with("Unknown scale '9'"));
        assert!(parse(&q(&[("outline_color", "red")])).unwrap_err().starts_with("Bad outline_color"));
        assert!(parse(&q(&[("time", "night")])).unwrap().night);
        assert!(parse(&q(&[("time", "noon")])).unwrap_err().starts_with("Unknown time 'noon'"));
        assert!(parse(&q(&[("pixels", "chunky")])).unwrap().chunky);
        assert!(parse(&q(&[("pixels", "huge")])).unwrap_err().starts_with("Unknown pixels 'huge'"));
    }

    #[test]
    fn every_decoration_draws_with_and_without_a_title() {
        let a = Assets::embedded().unwrap();
        assert!(a.decorations.len() >= 5);
        for name in a.decorations.keys() {
            let (plain, ms) = render(&a, name, &Options::default()).unwrap();
            assert!(ms > 0 && plain.frames.len() > 1, "{name} is animated");
            assert!(plain.title.as_ref().unwrap().px.iter().all(|p| p[3] == 0), "{name}: no title by default");
            let (titled, _) = render(&a, name, &Options { title: "About Me".into(), ..Default::default() }).unwrap();
            assert_eq!(titled.frames, plain.frames, "{name}: the title is on its own layer");
            assert!(titled.title.unwrap().px.iter().any(|p| p[3] != 0), "{name}: the title is drawn");
            let (coarse, _) = render(&a, name, &Options { title: "About Me".into(), scale: 1, animate: false, ..Default::default() }).unwrap();
            assert!(coarse.title.is_none() && coarse.frames.len() == 1 && coarse.frames[0] != plain.frames[0], "{name}: scale 1");
        }
        assert!(render(&a, "nope", &Options::default()).is_none());
        for (name, d) in &a.decorations {
            assert_eq!(d.night.len(), d.frames.len(), "{name} has a night painting");
            let (night, _) = render(&a, name, &Options { night: true, ..Default::default() }).unwrap();
            assert_ne!(night.frames[0], render(&a, name, &Options::default()).unwrap().0.frames[0], "{name}: night differs");
        }
    }

    #[test]
    fn a_long_title_is_trimmed_unless_truncate_is_off() {
        let a = Assets::embedded().unwrap();
        let long = "A very long section title that cannot fit".to_string();
        let lit = |o: Options| render(&a, "raven-moon", &o).unwrap().0.title.unwrap().px.iter().filter(|p| p[3] != 0).count();
        let trimmed = lit(Options { title: long.clone(), ..Default::default() });
        let whole = lit(Options { title: long, truncate: false, ..Default::default() });
        assert!(whole > trimmed, "drawn whole: {whole} > {trimmed}");
    }
}
