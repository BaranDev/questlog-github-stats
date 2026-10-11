//! Numbers and strings that must fit their space in the pixel font. Text is trimmed, never shrunk, so it stays
//! crisp.
use crate::text::Font;

pub fn grouped(n: u64) -> String {
    let s = n.to_string();
    let mut out = String::new();
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    out
}

pub fn compact(n: u64) -> String {
    let one = |x: f64| {
        let s = format!("{:.1}", (x * 10.0).floor() / 10.0);
        s.strip_suffix(".0").map_or(s.clone(), str::to_string)
    };
    match n {
        0..1000 => n.to_string(),
        1000..1_000_000 => format!("{}k", one(n as f64 / 1e3)),
        _ => format!("{}M", one(n as f64 / 1e6)),
    }
}

pub fn number(font: &Font, n: u64, max_w: i64) -> String {
    let g = grouped(n);
    if font.length(&g) <= max_w { g } else { compact(n) }
}

pub fn fit(font: &Font, s: &str, max_w: i64) -> String {
    if font.length(s) <= max_w {
        return s.to_string();
    }
    let chars: Vec<char> = s.chars().collect();
    // prefix[k] = advance of the first k characters; keep the longest prefix that still fits with "..." after it.
    let dots = font.advance('.') * 3;
    let mut prefix = vec![0i64];
    for &c in &chars {
        prefix.push(prefix.last().unwrap() + font.advance(c));
    }
    let keep = (0..=chars.len()).rev().find(|&k| (prefix[k] + dots) / 64 <= max_w).unwrap_or(0);
    if keep == 0 {
        // Not even "..." fits: keep as many dots as do (possibly none).
        return (0..3).rev().map(|n| ".".repeat(n)).find(|d| font.length(d) <= max_w).unwrap_or_default();
    }
    format!("{}...", chars[..keep].iter().collect::<String>().trim_end())
}

/// "label value" within `w`: the label is trimmed before the value, and the value only when it alone is too wide.
pub fn line(font: &Font, label: &str, value: &str, w: i64) -> String {
    let value = fit(font, value, w);
    let label = fit(font, label, w - font.length(&value) - font.length(" "));
    if label.is_empty() { value } else { format!("{label} {value}") }
}

/// Greedy word wrap into at most `max_lines`; whatever doesn't fit lands on the last line, trimmed with "...".
pub fn wrap(font: &Font, s: &str, max_w: i64, max_lines: usize) -> Vec<String> {
    let words: Vec<&str> = s.split_whitespace().collect();
    if words.is_empty() {
        return Vec::new();
    }
    if max_lines <= 1 {
        return vec![fit(font, &words.join(" "), max_w)];
    }
    let (mut lines, mut cur) = (Vec::new(), String::new());
    for (i, w) in words.iter().enumerate() {
        let cand = if cur.is_empty() { w.to_string() } else { format!("{cur} {w}") };
        if cur.is_empty() || font.length(&cand) <= max_w {
            cur = cand;
            continue;
        }
        lines.push(std::mem::take(&mut cur));
        if lines.len() == max_lines - 1 {
            lines.push(words[i..].join(" "));
            break;
        }
        cur = w.to_string();
    }
    if !cur.is_empty() {
        lines.push(cur);
    }
    lines.into_iter().map(|l| fit(font, &l, max_w)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scene::Assets;

    #[test]
    fn numbers() {
        assert_eq!(grouped(0), "0");
        assert_eq!(grouped(3384), "3,384");
        assert_eq!(grouped(1234567), "1,234,567");
        assert_eq!(compact(999), "999");
        assert_eq!(compact(1000), "1k");
        assert_eq!(compact(12345), "12.3k");
        assert_eq!(compact(1_250_000), "1.2M");
        let f = Assets::embedded().unwrap().text_font;
        assert_eq!(number(&f, 3384, 100), "3,384");
        assert_eq!(number(&f, 123456, 18), "123.4k", "too narrow for 123,456");
    }

    #[test]
    fn fit_and_wrap() {
        let f = Assets::embedded().unwrap().text_font;
        let t = fit(&f, "a-very-long-repository-name-that-cannot-fit", 60);
        assert!(t.ends_with("...") && f.length(&t) <= 60);
        assert_eq!(fit(&f, "short", 60), "short");
        assert_eq!(fit(&f, "abcdef", 0), "");
        assert_eq!(fit(&f, "", -5), "");
        for w in 0..12 {
            let t = fit(&f, "abcdef", w);
            assert!(f.length(&t) <= w.max(0), "w={w} gave {t:?}");
        }
        let one = f.length(".");
        assert_eq!(fit(&f, "abcdef", one), ".");
        let lines = wrap(&f, "the scribe is inking your sheet ready in about forty seconds", 60, 3);
        assert!(lines.len() <= 3 && lines.iter().all(|l| f.length(l) <= 60), "{lines:?}");
        assert!(lines[2].ends_with("..."), "overflow is trimmed on the last line");
        assert_eq!(wrap(&f, "one", 60, 1), vec!["one"]);
        assert!(wrap(&f, "", 60, 2).is_empty());
    }
}
