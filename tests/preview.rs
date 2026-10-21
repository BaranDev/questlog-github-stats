//! Renders every scene's cards and contact sheets (day, night, custom words and colors) into target/preview/, for a
//! visual check after art changes: cargo test --test preview -- --ignored
use questlog::canvas::Image;
use questlog::scene::Assets;
use questlog::stats::UserStats;
use questlog::widgets::{self, Look, Widget};
use std::path::Path;

#[test]
#[ignore]
fn preview_every_scene() {
    let a = Assets::embedded().unwrap();
    let stats: UserStats = serde_json::from_str(include_str!("fixtures/sample.json")).unwrap();
    let out = Path::new(env!("CARGO_MANIFEST_DIR")).join("target/preview");
    std::fs::create_dir_all(&out).unwrap();
    let mut custom = Look {
        note: vec!["Open to work, say hi on the forum!".into(), "Second line of the note that runs on and on".into()],
        title_color: Some([0xFF, 0x99, 0x33]),
        text_color: Some([0x22, 0x88, 0xEE]),
        ..Default::default()
    };
    for (k, v) in [("level", "Archmage"), ("current", "Forever"), ("typescript", "Master")] {
        custom.values.insert(k.into(), v.into());
    }
    for scene in a.scene_names() {
        for (suffix, base) in [("", Look::default()), ("-custom", custom.clone())] {
            let mut sheet = Image::new(640, 384);
            for (row, w) in [Widget::Stats, Widget::Languages, Widget::Streak].into_iter().enumerate() {
                for (col, night) in [false, true].into_iter().enumerate() {
                    let look = Look { scene: scene.into(), night, ..base.clone() };
                    let look = Look { scale: 1, ..look };
                    let frames = widgets::render(&a, w, &look, &stats).unwrap().frames;
                    sheet.alpha_composite(&frames[0], col as i64 * 320, row as i64 * 128);
                }
            }
            std::fs::write(out.join(format!("{scene}{suffix}.png")), sheet.to_png()).unwrap();
        }
    }
}
