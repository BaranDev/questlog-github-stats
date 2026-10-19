//! Overlay-scale frames → lossless WebP at ×scale; several frames → animated WebP, looping forever. libwebp's
//! animation encoder keeps only what changes between frames, which keeps animated cards small. A title layer at
//! twice the frames' resolution is laid over every frame as it is scaled up.
use crate::BoxError;
use crate::canvas::Image;
use webp::{AnimDecoder, AnimEncoder, AnimFrame, Encoder, WebPConfig};

pub const FRAME_MS: u16 = 180;
pub const CONTENT_TYPE: &str = "image/webp";

pub fn encode(frames: &[Image], title: Option<&Image>, scale: u8) -> Result<Vec<u8>, BoxError> {
    encode_at(frames, title, scale, FRAME_MS)
}

/// Lossless at libwebp's middle effort: about a third of a PNG's size, in tens of milliseconds per card.
fn config() -> Result<WebPConfig, BoxError> {
    let mut c = WebPConfig::new().map_err(|_| "webp: no config")?;
    c.lossless = 1;
    c.method = 4;
    c.quality = 75.0;
    Ok(c)
}

/// encode() with each frame shown for `frame_ms`: decorations keep the pace they were animated at.
pub fn encode_at(frames: &[Image], title: Option<&Image>, scale: u8, frame_ms: u16) -> Result<Vec<u8>, BoxError> {
    let first = frames.first().ok_or("no frames")?;
    let sc = scale as usize;
    let (w, h) = ((first.w * sc) as u32, (first.h * sc) as u32);
    let config = config()?;
    let rgb: Vec<Vec<u8>> = frames.iter().map(|f| rgb_scaled(f, title, sc)).collect();
    if rgb.len() == 1 {
        let out = Encoder::from_rgb(&rgb[0], w, h).encode_advanced(&config).map_err(|e| format!("webp: {e:?}"))?;
        return Ok(out.to_vec());
    }
    let mut enc = AnimEncoder::new(w, h, &config);
    enc.set_loop_count(0);
    for (i, f) in rgb.iter().enumerate() {
        enc.add_frame(AnimFrame::from_rgb(f, w, h, i as i32 * i32::from(frame_ms)));
    }
    Ok(enc.try_encode().map_err(|e| format!("webp: {e:?}"))?.to_vec())
}

/// `im` upscaled ×sc with the title over it, as packed RGB. The title's pixels are nearest-neighbour too: at an odd
/// scale they are alternately one output pixel wider and narrower.
fn rgb_scaled(im: &Image, title: Option<&Image>, sc: usize) -> Vec<u8> {
    let mut out = Vec::with_capacity(im.w * im.h * sc * sc * 3);
    for oy in 0..im.h * sc {
        for ox in 0..im.w * sc {
            let p = im.px[oy / sc * im.w + ox / sc];
            let t = title.map(|t| t.px[oy * 2 / sc * t.w + ox * 2 / sc]).filter(|t| t[3] != 0);
            out.extend_from_slice(&t.unwrap_or(p)[..3]);
        }
    }
    out
}

/// One frame as encode() draws it at ×sc, title included.
pub fn scaled(im: &Image, title: Option<&Image>, sc: usize) -> Image {
    let rgb = rgb_scaled(im, title, sc);
    Image { w: im.w * sc, h: im.h * sc, px: rgb.chunks(3).map(|c| [c[0], c[1], c[2], 255]).collect() }
}

/// One image as a lossless WebP, for files kept as references (the goldens).
pub fn still(im: &Image) -> Result<Vec<u8>, BoxError> {
    let rgba: Vec<u8> = im.px.concat();
    let out = Encoder::from_rgba(&rgba, im.w as u32, im.h as u32).encode_advanced(&config()?).map_err(|e| format!("webp: {e:?}"))?;
    Ok(out.to_vec())
}

/// Every frame of a WebP, still or animated, with how long it shows (ms).
pub fn decode(bytes: &[u8]) -> Result<Vec<(Image, i32)>, BoxError> {
    let anim = AnimDecoder::new(bytes).decode()?;
    let mut out: Vec<(Image, i32)> = Vec::new();
    let mut end_before = 0;
    for i in 0..anim.len() {
        let f = anim.get_frame(i).ok_or("webp: missing frame")?;
        let (w, h) = (f.width() as usize, f.height() as usize);
        let px = f.get_image().chunks(if f.get_layout().is_alpha() { 4 } else { 3 }).map(|c| [c[0], c[1], c[2], *c.get(3).unwrap_or(&255)]).collect();
        out.push((Image { w, h, px }, f.get_time_ms() - end_before));
        end_before = f.get_time_ms();
    }
    Ok(out)
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

    #[test]
    fn a_still_card_is_lossless_and_scaled() {
        for sc in 1..=5u8 {
            let frames = decode(&encode(&[frame([1, 2, 3])], None, sc).unwrap()).unwrap();
            assert_eq!(frames.len(), 1);
            assert_eq!(frames[0].0, scaled(&frame([1, 2, 3]), None, sc as usize), "scale {sc}: pixel for pixel");
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
        for (f, _) in decode(&encode(&frames, Some(&title), 4).unwrap()).unwrap() {
            assert_eq!(f.px[2], [9, 9, 9, 255]);
        }
    }

    #[test]
    fn an_animation_keeps_every_frame_and_its_pace() {
        let frames = [frame([1, 2, 3]), frame([4, 5, 6]), frame([7, 8, 9])];
        let out = decode(&encode_at(&frames, None, 3, 110).unwrap()).unwrap();
        assert_eq!(out.len(), 3);
        for ((img, ms), f) in out.iter().zip(&frames) {
            assert_eq!((img, *ms), (&scaled(f, None, 3), 110));
        }
    }

    #[test]
    fn a_reference_image_round_trips() {
        let img = scaled(&frame([1, 2, 3]), None, 2);
        assert_eq!(decode(&still(&img).unwrap()).unwrap()[0].0, img);
    }
}
