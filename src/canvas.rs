//! RGBA images with Pillow-exact alpha compositing (the cards must match the Pillow originals pixel for pixel).
use crate::BoxError;

pub type Rgb = [u8; 3];

#[derive(Clone, Debug, PartialEq)]
pub struct Image {
    pub w: usize,
    pub h: usize,
    pub px: Vec<[u8; 4]>,
}

impl Image {
    pub fn new(w: usize, h: usize) -> Image {
        Image { w, h, px: vec![[0; 4]; w * h] }
    }

    pub fn decode(bytes: &[u8]) -> Result<Image, BoxError> {
        let mut decoder = png::Decoder::new(std::io::Cursor::new(bytes));
        decoder.set_transformations(png::Transformations::normalize_to_color8());
        let mut reader = decoder.read_info()?;
        let mut buf = vec![0; reader.output_buffer_size().ok_or("png too large")?];
        let info = reader.next_frame(&mut buf)?;
        let px = match info.color_type {
            png::ColorType::Rgb => buf.chunks_exact(3).map(|c| [c[0], c[1], c[2], 255]).collect(),
            png::ColorType::Rgba => buf.chunks_exact(4).map(|c| [c[0], c[1], c[2], c[3]]).collect(),
            png::ColorType::Grayscale => buf.iter().map(|&g| [g, g, g, 255]).collect(),
            png::ColorType::GrayscaleAlpha => buf.chunks_exact(2).map(|c| [c[0], c[0], c[0], c[1]]).collect(),
            png::ColorType::Indexed => return Err("palette png not expanded".into()),
        };
        Ok(Image { w: info.width as usize, h: info.height as usize, px })
    }

    pub fn to_png(&self) -> Vec<u8> {
        let mut out = Vec::new();
        let mut enc = png::Encoder::new(&mut out, self.w as u32, self.h as u32);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut w = enc.write_header().expect("png header");
        w.write_image_data(&self.px.concat()).expect("png data");
        w.finish().expect("png finish");
        out
    }

    /// Nearest-neighbour upscale by an integer factor.
    /// pixels=chunky: the image in 2x2 blocks, each the average of its four pixels moved to the nearest color the
    /// image already has, so the painting keeps its own palette at half the resolution.
    pub fn chunky(&self) -> Image {
        let mut colors: Vec<[u8; 4]> = self.px.clone();
        colors.sort_unstable();
        colors.dedup();
        let mut out = self.clone();
        for by in (0..self.h).step_by(2) {
            for bx in (0..self.w).step_by(2) {
                let cells: Vec<usize> = [(0, 0), (1, 0), (0, 1), (1, 1)]
                    .iter()
                    .filter(|(dx, dy)| bx + dx < self.w && by + dy < self.h)
                    .map(|(dx, dy)| (by + dy) * self.w + bx + dx)
                    .collect();
                let n = cells.len() as u32;
                let avg: [u32; 4] =
                    std::array::from_fn(|c| (cells.iter().map(|&i| self.px[i][c] as u32).sum::<u32>() + n / 2) / n);
                let dist = |p: &[u8; 4]| (0..4).map(|c| (p[c] as i32 - avg[c] as i32).pow(2)).sum::<i32>();
                let best = *colors.iter().min_by_key(|p| dist(p)).unwrap_or(&[0; 4]);
                cells.iter().for_each(|&i| out.px[i] = best);
            }
        }
        out
    }

    pub fn scaled(&self, k: usize) -> Image {
        let mut out = Image::new(self.w * k, self.h * k);
        for (i, p) in out.px.iter_mut().enumerate() {
            *p = self.px[(i / out.w / k) * self.w + (i % out.w) / k];
        }
        out
    }

    /// Pillow's `alpha_composite` of `src` with its top-left at (x, y); parts outside are clipped.
    pub fn alpha_composite(&mut self, src: &Image, x: i64, y: i64) {
        for sy in 0..src.h {
            for sx in 0..src.w {
                let (dx, dy) = (x + sx as i64, y + sy as i64);
                if dx >= 0 && dy >= 0 && (dx as usize) < self.w && (dy as usize) < self.h {
                    let d = &mut self.px[dy as usize * self.w + dx as usize];
                    *d = over(src.px[sy * src.w + sx], *d);
                }
            }
        }
    }

    /// Opaque rectangle, corners inclusive, clipped to the image.
    pub fn fill_rect(&mut self, x0: i64, y0: i64, x1: i64, y1: i64, c: Rgb) {
        for y in y0.max(0)..=y1.min(self.h as i64 - 1) {
            for x in x0.max(0)..=x1.min(self.w as i64 - 1) {
                self.px[y as usize * self.w + x as usize] = [c[0], c[1], c[2], 255];
            }
        }
    }

    pub fn set(&mut self, x: i64, y: i64, c: Rgb) {
        self.fill_rect(x, y, x, y, c);
    }

    /// Recolor every visible pixel; fully transparent pixels stay as they are.
    pub fn map_colors(&self, f: impl Fn(Rgb) -> Rgb) -> Image {
        let px = self
            .px
            .iter()
            .map(|p| if p[3] == 0 { *p } else { let c = f([p[0], p[1], p[2]]); [c[0], c[1], c[2], p[3]] })
            .collect();
        Image { w: self.w, h: self.h, px }
    }
}

/// Pillow's ImagingAlphaComposite (7 extra bits of precision, /255 by shifts).
pub fn over(s: [u8; 4], d: [u8; 4]) -> [u8; 4] {
    if s[3] == 0 {
        return d;
    }
    let div255 = |a: u32| ((a >> 8) + a) >> 8;
    let (sa, da) = (s[3] as u32, d[3] as u32);
    let outa255 = sa * 255 + da * (255 - sa);
    let coef1 = sa * 255 * 255 * 128 / outa255;
    let coef2 = 255 * 128 - coef1;
    let ch = |i: usize| (div255(s[i] as u32 * coef1 + d[i] as u32 * coef2 + (0x80 << 7)) >> 7) as u8;
    [ch(0), ch(1), ch(2), div255(outa255 + 0x80) as u8]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunky_keeps_the_palette_in_2x2_blocks() {
        let mut img = Image::new(4, 2);
        img.px = vec![[10, 0, 0, 255], [12, 0, 0, 255], [200, 0, 0, 255], [200, 0, 0, 255],
                      [10, 0, 0, 255], [12, 0, 0, 255], [190, 0, 0, 255], [200, 0, 0, 255]];
        let c = img.chunky();
        assert!(c.px.iter().all(|p| img.px.contains(p)), "only colors the image has");
        assert!(c.px[0] == c.px[1] && c.px[0] == c.px[4] && c.px[0] == c.px[5], "one color per block");
        assert_eq!(c.px[2], [200, 0, 0, 255]);
    }

    #[test]
    fn over_matches_pillow() {
        assert_eq!(over([255, 0, 0, 255], [0, 0, 255, 255]), [255, 0, 0, 255]);
        assert_eq!(over([255, 0, 0, 0], [0, 0, 255, 255]), [0, 0, 255, 255]);
        // Pillow: Image.alpha_composite of (255,0,0,128) over (0,0,255,255)
        assert_eq!(over([255, 0, 0, 128], [0, 0, 255, 255]), [128, 0, 127, 255]);
    }

    #[test]
    fn scaled_is_nearest() {
        let mut a = Image::new(2, 1);
        a.set(0, 0, [1, 2, 3]);
        a.set(1, 0, [4, 5, 6]);
        let b = a.scaled(2);
        assert_eq!((b.w, b.h), (4, 2));
        assert_eq!(b.px[1], [1, 2, 3, 255]);
        assert_eq!(b.px[2], [4, 5, 6, 255]);
        assert_eq!(b.px[4 + 3], [4, 5, 6, 255]);
    }

    #[test]
    fn fill_clips_and_map_keeps_alpha() {
        let mut a = Image::new(3, 3);
        a.fill_rect(-5, -5, 0, 0, [9, 9, 9]);
        assert_eq!(a.px[0], [9, 9, 9, 255]);
        assert_eq!(a.px[1], [0, 0, 0, 0]);
        let m = a.map_colors(|c| [c[0] + 1, c[1], c[2]]);
        assert_eq!(m.px[0], [10, 9, 9, 255]);
        assert_eq!(m.px[1], [0, 0, 0, 0], "transparent pixels stay untouched");
    }

    #[test]
    fn png_roundtrip() {
        let mut a = Image::new(2, 2);
        a.set(1, 1, [7, 8, 9]);
        let b = Image::decode(&a.to_png()).unwrap();
        assert_eq!(a, b);
    }
}
