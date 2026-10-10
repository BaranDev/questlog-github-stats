//! URL query → what to draw, or the message for an error card. Logins are validated before anything else touches
//! them, so junk never reaches GitHub or the disk.
use crate::widgets::{Look, Widget};
use std::collections::HashMap;

const MAX_TEXT: usize = 60;

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

fn clip(s: &str) -> String {
    s.chars().take(20).collect()
}

fn text(s: &str) -> String {
    s.trim().chars().take(MAX_TEXT).collect()
}

fn labels(s: &str) -> Option<HashMap<String, String>> {
    s.split(',')
        .filter(|p| !p.trim().is_empty())
        .map(|p| {
            let (k, v) = p.split_once(':')?;
            let k = k.trim().to_lowercase();
            (!k.is_empty()).then(|| (k, text(v)))
        })
        .collect()
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
    match q.get("animate").map(String::as_str) {
        None | Some("true") | Some("1") => {}
        Some("false") | Some("0") => look.animate = false,
        Some(v) => fail(format!("Unknown animate '{}' (use true or false)", clip(v))),
    }
    look.title = q.get("title").map(|t| text(t)).filter(|t| !t.is_empty());
    look.subtitle = q.get("subtitle").map(|t| text(t)).filter(|t| !t.is_empty());
    if let Some(l) = q.get("labels") {
        match labels(l) {
            Some(m) => look.labels = m,
            None => fail("Bad labels: use key:Text,key:Text".into()),
        }
    }
    if let Some(h) = q.get("hide") {
        look.hide = h.split(',').map(|k| k.trim().to_lowercase()).filter(|k| !k.is_empty()).collect();
    }
    let user = q.get("user").map(|u| u.trim().to_lowercase()).unwrap_or_default();
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
    fn bad_values_explain_themselves_and_keep_the_rest() {
        let e = err(&[("user", "a"), ("scene", "castel"), ("time", "night")]);
        assert_eq!(e.message, "Unknown scene 'castel'");
        assert!(e.look.night && e.look.scene == "forest", "the error card still honours time=night");
        assert!(err(&[("user", "a"), ("time", "noon")]).message.starts_with("Unknown time 'noon'"));
        assert_eq!(err(&[("user", "a"), ("labels", "junk")]).message, "Bad labels: use key:Text,key:Text");
        assert!(err(&[("user", "a"), ("animate", "maybe")]).message.starts_with("Unknown animate"));
    }
}
