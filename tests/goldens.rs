//! Pixel goldens: every widget × scene × time, plus a still, custom words, an empty account and a message card,
//! rendered from fixed stats and compared with tests/goldens/<name>.png (frames stacked vertically, 320×128 each).
//! Regenerate deliberately after an art change: UPDATE_GOLDENS=1 cargo test --test goldens
use questlog::canvas::Image;
use questlog::scene::Assets;
use questlog::stats::{RawUser, UserStats, derive};
use questlog::widgets::{self, Look, Widget};
use std::path::Path;

fn stack(frames: &[Image]) -> Image {
    Image { w: frames[0].w, h: frames[0].h * frames.len(), px: frames.iter().flat_map(|f| f.px.clone()).collect() }
}

#[test]
fn goldens() {
    let a = Assets::embedded().unwrap();
    let sample: UserStats = serde_json::from_str(include_str!("fixtures/sample.json")).unwrap();
    let empty = derive(&RawUser { login: "newbie".into(), ..Default::default() }, 0, 0);
    let mut cases: Vec<(String, Vec<Image>)> = Vec::new();
    for scene in a.scene_names() {
        for w in [Widget::Stats, Widget::Languages, Widget::Streak] {
            for night in [false, true] {
                let look = Look { scene: scene.into(), night, ..Default::default() };
                let name = format!("{scene}-{}-{}", w.key(), if night { "night" } else { "day" });
                cases.push((name, widgets::render(&a, w, &look, &sample).unwrap()));
            }
        }
    }
    let still = Look { animate: false, ..Default::default() };
    cases.push(("forest-streak-still".into(), widgets::render(&a, Widget::Streak, &still, &sample).unwrap()));
    let mut custom = Look { title: Some("My Journey".into()), subtitle: Some("Full Stack Developer".into()), ..Default::default() };
    custom.labels.insert("commits".into(), "Deeds".into());
    custom.hide.insert("stars".into());
    cases.push(("forest-stats-custom".into(), widgets::render(&a, Widget::Stats, &custom, &sample).unwrap()));
    for w in [Widget::Languages, Widget::Streak] {
        cases.push((format!("forest-{}-empty", w.key()), widgets::render(&a, w, &Look::default(), &empty).unwrap()));
    }
    let msg = widgets::message(&a, Widget::Stats, &Look::default(), "The scribe is inking your sheet... ready in ~10 s");
    cases.push(("forest-stats-placeholder".into(), vec![msg.unwrap()]));

    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/goldens");
    let out = Path::new(env!("CARGO_MANIFEST_DIR")).join("target/golden-actual");
    let update = std::env::var("UPDATE_GOLDENS").is_ok();
    std::fs::create_dir_all(&dir).unwrap();
    let mut failed = Vec::new();
    for (name, frames) in cases {
        let bytes = questlog::encode::encode(&frames).unwrap().len();
        let budget = if frames.len() > 1 { 1_000_000 } else { 150_000 }; // spec: still < 150 KB, animated < 1 MB
        assert!(bytes < budget, "{name}: {bytes} bytes is over the {budget} byte budget");
        let got = stack(&frames);
        let path = dir.join(format!("{name}.png"));
        if update {
            std::fs::write(&path, got.to_png()).unwrap();
            continue;
        }
        let want = std::fs::read(&path).ok().and_then(|b| Image::decode(&b).ok());
        if want.as_ref() != Some(&got) {
            std::fs::create_dir_all(&out).unwrap();
            std::fs::write(out.join(format!("{name}.png")), got.to_png()).unwrap();
            failed.push(name);
        }
    }
    assert!(failed.is_empty(), "goldens differ (actual images in target/golden-actual): {failed:?}");
}
