//! Overlay-scale frames → PNG at ×5. Several frames → APNG, looping forever; like Pillow, frames after the
//! first carry only the rectangle that changed, which keeps animated cards small.
use crate::BoxError;
use crate::canvas::Image;

pub const FRAME_MS: u16 = 180;

pub fn encode(frames: &[Image], scale: u8) -> Result<Vec<u8>, BoxError> {
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
        enc.set_frame_delay(FRAME_MS, 1000)?;
    }
    let mut wr = enc.write_header()?;
    wr.write_image_data(&rgb_scaled(first, 0, 0, first.w, first.h, sc))?;
    for pair in frames.windows(2) {
        let (x0, y0, x1, y1) = diff_box(&pair[0], &pair[1]).unwrap_or((0, 0, 1, 1));
        wr.set_frame_position(0, 0)?;
        wr.set_frame_dimension(((x1 - x0) * sc) as u32, ((y1 - y0) * sc) as u32)?;
        wr.set_frame_position((x0 * sc) as u32, (y0 * sc) as u32)?;
        wr.write_image_data(&rgb_scaled(&pair[1], x0, y0, x1, y1, sc))?;
    }
    wr.finish()?;
    Ok(out)
}

/// The region [x0, x1) × [y0, y1) of `im`, upscaled ×sc, as packed RGB.
fn rgb_scaled(im: &Image, x0: usize, y0: usize, x1: usize, y1: usize, sc: usize) -> Vec<u8> {
    let mut out = Vec::with_capacity((x1 - x0) * (y1 - y0) * sc * sc * 3);
    for y in y0..y1 {
        let mut row = Vec::with_capacity((x1 - x0) * sc * 3);
        for x in x0..x1 {
            let p = im.px[y * im.w + x];
            for _ in 0..sc {
                row.extend_from_slice(&p[..3]);
            }
        }
        for _ in 0..sc {
            out.extend_from_slice(&row);
        }
    }
    out
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
        let bytes = encode(&[frame([1, 2, 3])], 5).unwrap();
        assert_eq!(info(&bytes), (20, 10, None));
        let img = Image::decode(&bytes).unwrap();
        assert_eq!(img.px[5 * 20 + 5], [1, 2, 3, 255], "pixel (1,1) becomes the 5x5 block at (5,5)");
    }

    #[test]
    fn scale_sets_the_size() {
        for sc in 1..=5u8 {
            let (w, h, _) = info(&encode(&[frame([1, 2, 3])], sc).unwrap());
            assert_eq!((w, h), (4 * sc as u32, 2 * sc as u32));
        }
    }

    #[test]
    fn apng_loops_forever() {
        let bytes = encode(&[frame([1, 2, 3]), frame([4, 5, 6]), frame([4, 5, 6])], 5).unwrap();
        assert_eq!(info(&bytes), (20, 10, Some((3, 0))));
    }
}
