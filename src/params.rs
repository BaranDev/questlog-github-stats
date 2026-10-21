//! URL query → what to draw, or the message for an error card. Logins are validated before anything else touches
//! them, so junk never reaches GitHub or the disk.
use crate::canvas::Rgb;
use crate::widgets::{Look, Widget};
use std::collections::HashMap;

const MAX_TEXT: usize = 60;
const MAX_LABELS: usize = 20;
const MAX_HIDE: usize = 20;
const MAX_HIDE_KEY: usize = 40;
const MAX_NOTE: usize = 2;

#[derive(Debug)]
pub struct Request {
    pub widget: Widget,
    pub user: String,
    pub look: Look,
}

#[derive(Debug)]
pub struct ParamError {
    pub look: Look,
    pub message: String,
}

/// GitHub's login rules: 1–39 characters, letters, digits and single hyphens, not at either end.
pub fn valid_login(s: &str) -> bool {
    (1..=39).contains(&s.len())
        && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        && !s.starts_with('-')
        && !s.ends_with('-')
        && !s.contains("--")
}

pub(crate) fn clip(s: &str) -> String {
    s.chars().take(20).collect()
}

pub(crate) fn text(s: &str) -> String {
    s.trim().chars().take(MAX_TEXT).collect()
}

/// `key:Text,key:Text`, for labels and values.
fn pairs(s: &str) -> Option<HashMap<String, String>> {
    s.split(',')
        .filter(|p| !p.trim().is_empty())
        .take(MAX_LABELS)
        .map(|p| {
            let (k, v) = p.split_once(':')?;
            let k = clip(&k.trim().to_ascii_lowercase());
            (!k.is_empty()).then(|| (k, text(v)))
        })
        .collect()
}

/// `RRGGBB` or `RGB` hex digits, with an optional leading `#`; nothing else.
pub(crate) fn color(s: &str) -> Option<Rgb> {
    let h = s.strip_prefix('#').unwrap_or(s);
    let d = h.chars().take(7).map(|c| c.to_digit(16).map(|d| d as u8)).collect::<Option<Vec<u8>>>()?;
    match d[..] {
        [r, g, b] => Some([r * 17, g * 17, b * 17]),
        [r1, r2, g1, g2, b1, b2] => Some([r1 * 16 + r2, g1 * 16 + g2, b1 * 16 + b2]),
        _ => None,
    }
}

pub fn parse(widget: Widget, q: &HashMap<String, String>, scenes: &[&str]) -> Result<Request, ParamError> {
    let mut look = Look::default();
    let mut err: Option<String> = None;
    let mut fail = |m: String| {
        if err.is_none() {
            err = Some(m);
        }
    };
    if let Some(s) = q.get("scene") {
        if scenes.contains(&s.as_str()) {
            look.scene = s.clone();
        } else {
            fail(format!("Unknown scene '{}'", clip(s)));
        }
    }
    match q.get("time").map(String::as_str) {
        None | Some("day") => {}
        Some("night") => look.night = true,
        Some(t) => fail(format!("Unknown time '{}' (use day or night)", clip(t))),
    }
    match q.get("pixels").map(String::as_str) {
        None | Some("fine") => {}
        Some("chunky") => look.chunky = true,
        Some(p) => fail(format!("Unknown pixels '{}' (use fine or chunky)", clip(p))),
    }
    match q.get("fire").map(String::as_str) {
        None | Some("classic") => {}
        Some("themed") => look.themed = true,
        Some(f) => fail(format!("Unknown fire '{}' (use classic or themed)", clip(f))),
    }
    match q.get("langs").map(String::as_str) {
        None | Some("5") => {}
        Some("3") => look.langs = 3,
        Some(v) => fail(format!("Unknown langs '{}' (use 3 or 5)", clip(v))),
    }
    match q.get("truncate").map(String::as_str) {
        None | Some("true") | Some("1") => {}
        Some("false") | Some("0") => look.truncate = false,
        Some(v) => fail(format!("Unknown truncate '{}' (use true or false)", clip(v))),
    }
    match q.get("animate").map(String::as_str) {
        None | Some("true") | Some("1") => {}
        Some("false") | Some("0") => look.animate = false,
        Some(v) => fail(format!("Unknown animate '{}' (use true or false)", clip(v))),
    }
    match q.get("scale").map(String::as_str) {
        None => {}
        Some(v) => match v.parse::<u8>() {
            Ok(n @ 1..=5) => look.scale = n,
            _ => fail(format!("Unknown scale '{}' (use 1 to 5)", clip(v))),
        },
    }
    look.title = q.get("title").map(|t| text(t)).filter(|t| !t.is_empty());
    look.subtitle = q.get("subtitle").map(|t| text(t)).filter(|t| !t.is_empty());
    for (name, map) in [("labels", &mut look.labels), ("values", &mut look.values)] {
        if let Some(l) = q.get(name) {
            match pairs(l) {
                Some(m) => *map = m,
                None => fail(format!("Bad {name}: use key:Text,key:Text")),
            }
        }
    }
    if let Some(n) = q.get("note") {
        look.note = n.split('|').map(text).filter(|l| !l.is_empty()).take(MAX_NOTE).collect();
    }
    for (name, slot) in [("title_color", &mut look.title_color), ("text_color", &mut look.text_color), ("outline_color", &mut look.outline_color)] {
        if let Some(v) = q.get(name) {
            match color(v) {
                Some(c) => *slot = Some(c),
                None => fail(format!("Bad {name}: use RRGGBB or RGB")),
            }
        }
    }
    if let Some(h) = q.get("hide") {
        look.hide = h
            .split(',')
            .map(|k| k.trim().to_ascii_lowercase())
            .filter(|k| !k.is_empty())
            .take(MAX_HIDE)
            .map(|k| k.chars().take(MAX_HIDE_KEY).collect())
            .collect();
    }
    let user = q.get("user").map(|u| u.trim().to_ascii_lowercase()).unwrap_or_default();
    if user.is_empty() {
        fail("Add ?user=your-github-login".into());
    } else if !valid_login(&user) {
        fail(format!("'{}' is not a GitHub login", clip(&user)));
    }
    match err {
        Some(message) => Err(ParamError { look, message }),
        None => Ok(Request { widget, user, look }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn q(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    fn ok(pairs: &[(&str, &str)]) -> Request {
        parse(Widget::Stats, &q(pairs), &["castle", "forest"]).unwrap_or_else(|e| panic!("{}", e.message))
    }

    fn err(pairs: &[(&str, &str)]) -> ParamError {
        parse(Widget::Stats, &q(pairs), &["castle", "forest"]).err().expect("should fail")
    }

    #[test]
    fn fire_style() {
        assert!(!ok(&[("user", "a")]).look.themed, "classic by default");
        assert!(!ok(&[("user", "a"), ("fire", "classic")]).look.themed);
        assert!(ok(&[("user", "a"), ("fire", "themed")]).look.themed);
        assert!(err(&[("user", "a"), ("fire", "lava")]).message.starts_with("Unknown fire 'lava'"));
        let upper = err(&[("user", "a"), ("fire", "Themed")]);
        assert!(upper.message.starts_with("Unknown fire 'Themed'"), "lowercase only");
    }

    #[test]
    fn truncate_switch() {
        assert!(ok(&[("user", "a")]).look.truncate, "trimmed by default");
        assert!(ok(&[("user", "a"), ("truncate", "true")]).look.truncate);
        assert!(!ok(&[("user", "a"), ("truncate", "false")]).look.truncate);
        assert!(!ok(&[("user", "a"), ("truncate", "0")]).look.truncate);
        assert!(err(&[("user", "a"), ("truncate", "no")]).message.starts_with("Unknown truncate 'no'"));
        assert!(ok(&[("user", "a"), ("pixels", "chunky")]).look.chunky);
        assert!(!ok(&[("user", "a"), ("pixels", "fine")]).look.chunky);
        assert!(err(&[("user", "a"), ("pixels", "big")]).message.starts_with("Unknown pixels 'big'"));
    }

    #[test]
    fn langs_count() {
        assert_eq!(ok(&[("user", "a")]).look.langs, 5, "five by default");
        assert_eq!(ok(&[("user", "a"), ("langs", "5")]).look.langs, 5);
        assert_eq!(ok(&[("user", "a"), ("langs", "3")]).look.langs, 3);
        for bad in ["4", "0", "three", " 3"] {
            assert!(err(&[("user", "a"), ("langs", bad)]).message.starts_with(&format!("Unknown langs '{bad}'")), "{bad}");
        }
    }

    #[test]
    fn defaults() {
        let r = ok(&[("user", "octocat")]);
        assert_eq!(r.look, Look::default());
        assert_eq!(r.user, "octocat");
    }

    #[test]
    fn logins_are_normalized_or_refused() {
        assert_eq!(ok(&[("user", " OctoCat ")]).user, "octocat", "one cache entry per user");
        let long = "x".repeat(40);
        for bad in ["octo cat", "a--b", "-a", "a-", long.as_str(), "../x", "a_b"] {
            assert!(err(&[("user", bad)]).message.contains("not a GitHub login"), "{bad}");
        }
        assert!(err(&[]).message.starts_with("Add ?user="));
        assert!(valid_login(&"x".repeat(39)));
    }

    #[test]
    fn look_options() {
        let r = ok(&[("user", "a"), ("scene", "castle"), ("time", "night"), ("animate", "false"),
            ("hide", "PRS, stars,"), ("labels", "commits:Deeds, prs : Pacts"), ("title", "  My Journey ")]);
        assert_eq!((r.look.scene.as_str(), r.look.night, r.look.animate), ("castle", true, false));
        assert!(r.look.hide.contains("prs") && r.look.hide.contains("stars") && r.look.hide.len() == 2);
        assert_eq!(r.look.labels["commits"], "Deeds");
        assert_eq!(r.look.labels["prs"], "Pacts");
        assert_eq!(r.look.title.as_deref(), Some("My Journey"));
        let long = "t".repeat(200);
        assert_eq!(ok(&[("user", "a"), ("title", long.as_str())]).look.title.unwrap().len(), 60);
    }

    #[test]
    fn values_and_notes() {
        let r = ok(&[("user", "a"), ("values", "Level:Archmage, commits:∞,typescript:Master"), ("note", " Line one |Line two|three")]);
        assert_eq!((r.look.values["level"].as_str(), r.look.values["commits"].as_str()), ("Archmage", "∞"));
        assert_eq!(r.look.values["typescript"], "Master");
        assert_eq!(r.look.note, vec!["Line one", "Line two"], "at most two lines, trimmed");
        assert!(ok(&[("user", "a"), ("note", "||")]).look.note.is_empty());
        let long = "n".repeat(200);
        assert_eq!(ok(&[("user", "a"), ("note", &format!("{long}|{long}"))]).look.note.iter().map(String::len).collect::<Vec<_>>(), [60, 60]);
        let many: Vec<String> = (0..50).map(|i| format!("k{i}:v")).collect();
        assert_eq!(ok(&[("user", "a"), ("values", &many.join(","))]).look.values.len(), 20);
        assert_eq!(err(&[("user", "a"), ("values", "junk")]).message, "Bad values: use key:Text,key:Text");
    }

    #[test]
    fn colors_are_hex_only() {
        let r = ok(&[("user", "a"), ("title_color", "#FF8800"), ("text_color", "0af"), ("outline_color", "123456")]);
        assert_eq!(r.look.title_color, Some([0xFF, 0x88, 0x00]));
        assert_eq!(r.look.text_color, Some([0x00, 0xAA, 0xFF]));
        assert_eq!(r.look.outline_color, Some([0x12, 0x34, 0x56]));
        for bad in ["", "#", "red", "#12345", "1234567", "##fff", " fff", "fff ", "12345g", "+fff", "ｆｆｆ"] {
            assert_eq!(err(&[("user", "a"), ("text_color", bad)]).message, "Bad text_color: use RRGGBB or RGB", "{bad:?}");
        }
        let e = err(&[("user", "a"), ("title_color", "nope"), ("text_color", "fff")]);
        assert_eq!((e.message.as_str(), e.look.title_color, e.look.text_color), ("Bad title_color: use RRGGBB or RGB", None, Some([255; 3])));
    }

    #[test]
    fn non_ascii_logins_are_refused() {
        assert!(err(&[("user", "\u{212A}elvin")]).message.contains("not a GitHub login"), "Kelvin sign");
    }

    #[test]
    fn labels_and_hide_are_capped() {
        let many: Vec<String> = (0..50).map(|i| format!("k{i}")).collect();
        let labels: Vec<String> = many.iter().map(|k| format!("{k}:v")).collect();
        let r = ok(&[("user", "a"), ("labels", &labels.join(",")), ("hide", &many.join(","))]);
        assert_eq!((r.look.labels.len(), r.look.hide.len()), (20, 20));
        let long = "x".repeat(100);
        let r = ok(&[("user", "a"), ("labels", &format!("{long}:v")), ("hide", &long)]);
        assert!(r.look.labels.keys().all(|k| k.len() == 20) && r.look.hide.iter().all(|k| k.len() == 40));
    }

    #[test]
    fn bad_values_explain_themselves_and_keep_the_rest() {
        let e = err(&[("user", "a"), ("scene", "castel"), ("time", "night")]);
        assert_eq!(e.message, "Unknown scene 'castel'");
        assert!(e.look.night && e.look.scene == "forest", "the error card still honours time=night");
        assert!(err(&[("user", "a"), ("time", "noon")]).message.starts_with("Unknown time 'noon'"));
        assert_eq!(err(&[("user", "a"), ("labels", "junk")]).message, "Bad labels: use key:Text,key:Text");
        assert!(err(&[("user", "a"), ("animate", "maybe")]).message.starts_with("Unknown animate"));
        for bad in ["0", "6", "9", "x", "-1", ""] {
            assert!(err(&[("user", "a"), ("scale", bad)]).message.starts_with("Unknown scale"), "{bad}");
        }
        assert_eq!(ok(&[("user", "a"), ("scale", "2")]).look.scale, 2);
    }
}
