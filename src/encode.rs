//! Overlay-scale frames → PNG at ×5. Several frames → APNG, looping forever; like Pillow, frames after the
//! first carry only the rectangle that changed, which keeps animated cards small. A title layer at twice the
//! frames' resolution is laid over every frame as it is scaled up.
use crate::BoxError;
use crate::canvas::Image;

pub const FRAME_MS: u16 = 180;

pub fn encode(frames: &[Image], title: Option<&Image>, scale: u8) -> Result<Vec<u8>, BoxError> {
    encode_at(frames, title, scale, FRAME_MS)
}

/// encode() with each frame shown for `frame_ms`: decorations keep the pace they were animated at.
pub fn encode_at(frames: &[Image], title: Option<&Image>, scale: u8, frame_ms: u16) -> Result<Vec<u8>, BoxError> {
    let first = frames.first().ok_or("no frames")?;
    let sc = scale as usize;
    let (w, h) = (first.w * sc, first.h * sc);
    let mut out = Vec::new();
    let mut enc = png::Encoder::new(&mut out, w as u32, h as u32);
    enc.set_color(png::ColorType::Rgb);
    enc.set_depth(png::BitDepth::Eight);
    enc.set_compression(png::Compression::High);
    if frames.len() > 1 {
        enc.set_animated(frames.len() as u32, 0)?;
        enc.set_frame_delay(frame_ms, 1000)?;
    }
    let mut wr = enc.write_header()?;
    wr.write_image_data(&rgb_scaled(first, title, (0, 0, first.w, first.h), sc))?;
    for pair in frames.windows(2) {
        let (x0, y0, x1, y1) = diff_box(&pair[0], &pair[1]).unwrap_or((0, 0, 1, 1));
        wr.set_frame_position(0, 0)?;
        wr.set_frame_dimension(((x1 - x0) * sc) as u32, ((y1 - y0) * sc) as u32)?;
        wr.set_frame_position((x0 * sc) as u32, (y0 * sc) as u32)?;
        wr.write_image_data(&rgb_scaled(&pair[1], title, (x0, y0, x1, y1), sc))?;
    }
    wr.finish()?;
    Ok(out)
}

/// The region [x0, x1) × [y0, y1) of `im`, upscaled ×sc with the title over it, as packed RGB. The title's
/// pixels are nearest-neighbour too: at an odd scale they are alternately one output pixel wider and narrower.
fn rgb_scaled(im: &Image, title: Option<&Image>, (x0, y0, x1, y1): (usize, usize, usize, usize), sc: usize) -> Vec<u8> {
    let mut out = Vec::with_capacity((x1 - x0) * (y1 - y0) * sc * sc * 3);
    for oy in y0 * sc..y1 * sc {
        for ox in x0 * sc..x1 * sc {
            let p = im.px[oy / sc * im.w + ox / sc];
            let t = title.map(|t| t.px[oy * 2 / sc * t.w + ox * 2 / sc]).filter(|t| t[3] != 0);
            out.extend_from_slice(&t.unwrap_or(p)[..3]);
        }
    }
    out
}

/// One frame as encode() draws it at ×sc, title included.
pub fn scaled(im: &Image, title: Option<&Image>, sc: usize) -> Image {
    let rgb = rgb_scaled(im, title, (0, 0, im.w, im.h), sc);
    Image { w: im.w * sc, h: im.h * sc, px: rgb.chunks(3).map(|c| [c[0], c[1], c[2], 255]).collect() }
}

/// Bounding box (x0, y0, x1, y1 exclusive) of the pixels that differ.
fn diff_box(a: &Image, b: &Image) -> Option<(usize, usize, usize, usize)> {
    let mut bb: Option<(usize, usize, usize, usize)> = None;
    for y in 0..a.h {
        for x in 0..a.w {
            if a.px[y * a.w + x] != b.px[y * a.w + x] {
                let r = bb.get_or_insert((x, y, x + 1, y + 1));
                *r = (r.0.min(x), r.1.min(y), r.2.max(x + 1), r.3.max(y + 1));
            }
        }
    }
    bb
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(c: [u8; 3]) -> Image {
        let mut f = Image::new(4, 2);
        f.fill_rect(0, 0, 3, 1, [10, 20, 30]);
        f.set(1, 1, c);
        f
    }

    fn info(bytes: &[u8]) -> (u32, u32, Option<(u32, u32)>) {
        let r = png::Decoder::new(std::io::Cursor::new(bytes)).read_info().unwrap();
        let i = r.info();
        (i.width, i.height, i.animation_control.map(|a| (a.num_frames, a.num_plays)))
    }

    #[test]
    fn still_png_is_scaled() {
        let bytes = encode(&[frame([1, 2, 3])], None, 5).unwrap();
        assert_eq!(info(&bytes), (20, 10, None));
        let img = Image::decode(&bytes).unwrap();
        assert_eq!(img.px[5 * 20 + 5], [1, 2, 3, 255], "pixel (1,1) becomes the 5x5 block at (5,5)");
    }

    #[test]
    fn scale_sets_the_size() {
        for sc in 1..=5u8 {
            let (w, h, _) = info(&encode(&[frame([1, 2, 3])], None, sc).unwrap());
            assert_eq!((w, h), (4 * sc as u32, 2 * sc as u32));
        }
    }

    #[test]
    fn the_title_is_drawn_at_twice_the_resolution_over_every_frame() {
        let mut title = Image::new(8, 4);
        title.set(1, 0, [9, 9, 9]); // the right half of card pixel (0, 0)
        let frames = [frame([1, 2, 3]), frame([4, 5, 6])];
        let img = scaled(&frames[0], Some(&title), 4);
        assert_eq!((img.px[0], img.px[2]), ([10, 20, 30, 255], [9, 9, 9, 255]), "a title pixel is half a card pixel");
        assert_eq!(img.px[4 * 16 + 5], [1, 2, 3, 255], "the frame shows where the title is empty");
        let apng = encode(&frames, Some(&title), 4).unwrap();
        assert_eq!(Image::decode(&apng).unwrap().px[2], [9, 9, 9, 255]);
    }

    #[test]
    fn apng_loops_forever() {
        let bytes = encode(&[frame([1, 2, 3]), frame([4, 5, 6]), frame([4, 5, 6])], None, 5).unwrap();
        assert_eq!(info(&bytes), (20, 10, Some((3, 0))));
    }
}
