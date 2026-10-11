//! Renders every scene's three cards, day and night, from the golden fixture into target/preview/, plus a contact
//! sheet per scene. A visual check after art changes: cargo test --test preview -- --ignored
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
    for scene in a.scene_names() {
        let mut sheet = Image::new(640, 384);
        for (row, w) in [Widget::Stats, Widget::Languages, Widget::Streak].into_iter().enumerate() {
            for (col, night) in [false, true].into_iter().enumerate() {
                let look = Look { scene: scene.into(), night, ..Default::default() };
                let frames = widgets::render(&a, w, &look, &stats).unwrap();
                sheet.alpha_composite(&frames[0], col as i64 * 320, row as i64 * 128);
            }
        }
        std::fs::write(out.join(format!("{scene}.png")), sheet.to_png()).unwrap();
    }
}
