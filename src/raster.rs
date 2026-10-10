//! Monochrome scan converter: a port of FreeType's "black" rasterizer (src/raster/ftraster.c, 2.14),
//! which is what Pillow's `fontmode = "1"` ends up calling. Coordinates are 26.6 fixed point like
//! FreeType outlines; the rules for pixel centers, drop-outs and stubs follow the C code closely.

#[derive(Clone, Copy, Default, Debug)]
pub struct Pt {
    pub x: i64,
    pub y: i64,
}

pub enum Seg {
    Line(Pt),
    Conic(Pt, Pt),
    Cubic(Pt, Pt, Pt),
}

pub struct Contour {
    pub start: Pt,
    pub segs: Vec<Seg>,
}

const FLOW_UP: u16 = 0x08;
const OVERSHOOT_TOP: u16 = 0x10;
const OVERSHOOT_BOTTOM: u16 = 0x20;
const DROPOUT: u16 = 0x40;

#[derive(Clone, Copy, PartialEq)]
enum State {
    Unknown,
    Ascending,
    Descending,
}

/// One y-monotonic run of an edge: the x crossing at every scanline it covers.
#[derive(Default)]
struct Profile {
    flags: u16,
    start: i64,
    height: i64, // remaining scanlines; 0 until the profile is committed
    offset: i64,
    x: i64,
    xs: Vec<i64>,
    next: usize, // successor in the same contour
}

struct Raster {
    precision_bits: i64,
    precision: i64,
    half: i64,
    scale: i64,
    step: i64,
    dropout_mode: u16,
    last_x: i64,
    last_y: i64,
    min_y: i64,
    max_y: i64,
    state: State,
    profiles: Vec<Profile>,
    cur: Option<usize>,
    contour_first: Option<usize>,
    committed: Vec<usize>,
    turns: Vec<i64>,
    turn_top: i64,
    width: i64,
    rows: i64,
    bits: Vec<bool>, // row 0 is the bottom row, as in FreeType's bitmap origin
}

/// Render an outline into a `width` x `rows` bitmap (top row first), the outline already shifted so the
/// bitmap's bottom-left corner is the origin. `high_precision` is FreeType's FT_OUTLINE_HIGH_PRECISION
/// (set by the font drivers below 24 ppem); `dropout_mode` is ftraster's 3-bit drop-out control.
pub fn render(contours: &[Contour], width: i64, rows: i64, high_precision: bool, dropout_mode: u16) -> Vec<bool> {
    let precision_bits = if high_precision && (rows - 1) + (width - 1) < 256 { 12 } else { 6 };
    let precision = 1 << precision_bits;
    let mut r = Raster {
        precision_bits,
        precision,
        half: precision >> 1,
        scale: precision >> 6,
        step: if precision_bits == 12 { 256 } else { 32 },
        dropout_mode,
        last_x: 0,
        last_y: 0,
        min_y: 0,
        max_y: 0,
        state: State::Unknown,
        profiles: Vec::new(),
        cur: None,
        contour_first: None,
        committed: Vec::new(),
        turns: Vec::new(),
        turn_top: 0,
        width,
        rows,
        bits: vec![false; (width * rows) as usize],
    };
    r.pass(contours, false); // vertical sweep: spans and drop-outs along rows
    r.pass(contours, true); // horizontal sweep: drop-outs along columns
    let w = width as usize;
    (0..rows as usize).rev().flat_map(|row| r.bits[row * w..(row + 1) * w].to_vec()).collect()
}

impl Raster {
    fn floor(&self, x: i64) -> i64 {
        x & -self.precision
    }
    fn ceiling(&self, x: i64) -> i64 {
        (x + self.precision - 1) & -self.precision
    }
    fn trunc(&self, x: i64) -> i64 {
        x >> self.precision_bits
    }
    fn is_bottom_overshoot(&self, x: i64) -> bool {
        self.ceiling(x) - x >= self.half
    }
    fn is_top_overshoot(&self, x: i64) -> bool {
        x - self.floor(x) >= self.half
    }
    /// Scale 26.6 to the raster precision and shift the grid so pixel centers sit on integers.
    fn scaled(&self, p: Pt, flipped: bool) -> Pt {
        let (x, y) = (p.x * self.scale - self.half, p.y * self.scale - self.half);
        if flipped { Pt { x: y, y: x } } else { Pt { x, y } }
    }

    fn pass(&mut self, contours: &[Contour], flipped: bool) {
        let limit = if flipped { self.width - 1 } else { self.rows - 1 };
        self.min_y = 0;
        self.max_y = limit * self.precision;
        self.profiles.clear();
        self.committed.clear();
        self.turns.clear();
        self.cur = None;
        for c in contours {
            self.state = State::Unknown;
            self.contour_first = None;
            let start = self.scaled(c.start, flipped);
            (self.last_x, self.last_y) = (start.x, start.y);
            for seg in &c.segs {
                match *seg {
                    Seg::Line(p) => {
                        let p = self.scaled(p, flipped);
                        self.line_to(p.x, p.y);
                    }
                    Seg::Conic(c1, p) => {
                        let (c1, p) = (self.scaled(c1, flipped), self.scaled(p, flipped));
                        self.conic_to(c1, p);
                    }
                    Seg::Cubic(c1, c2, p) => {
                        let (c1, c2, p) = (self.scaled(c1, flipped), self.scaled(c2, flipped), self.scaled(p, flipped));
                        self.cubic_to(c1, c2, p);
                    }
                }
            }
            self.line_to(start.x, start.y);
            let Some(first) = self.contour_first else { continue };
            let cur = self.cur.unwrap();
            // the contour's last and first profiles join: don't count the shared scanline twice
            if self.last_y & (self.precision - 1) == 0
                && (self.min_y..=self.max_y).contains(&self.last_y)
                && self.profiles[first].flags & FLOW_UP == self.profiles[cur].flags & FLOW_UP
            {
                self.profiles[cur].xs.pop();
            }
            self.end_profile();
        }
        if self.committed.is_empty() {
            return;
        }
        // successor links within each contour (the last profile wraps to the contour's first)
        for k in 0..self.committed.len() - 1 {
            let (p, q) = (self.committed[k], self.committed[k + 1]);
            if self.profiles[q].next == self.profiles[p].next {
                self.profiles[p].next = q;
            }
        }
        self.draw_sweep(flipped);
    }

    fn new_profile(&mut self, state: State) {
        let reuse = matches!(self.cur, Some(c) if self.profiles[c].height == 0);
        if !reuse {
            self.profiles.push(Profile::default());
            self.cur = Some(self.profiles.len() - 1);
        }
        let mut flags = self.dropout_mode;
        let e = if state == State::Ascending {
            flags |= FLOW_UP;
            if self.is_bottom_overshoot(self.last_y) {
                flags |= OVERSHOOT_BOTTOM;
            }
            self.ceiling(self.last_y)
        } else {
            if self.is_top_overshoot(self.last_y) {
                flags |= OVERSHOOT_TOP;
            }
            self.floor(self.last_y)
        };
        let e = e.min(self.max_y).max(self.min_y);
        let start = self.trunc(e);
        let (last_x, last_y) = (self.last_x, self.last_y);
        let p = &mut self.profiles[self.cur.unwrap()];
        p.flags = flags;
        p.start = start;
        if last_y == e {
            p.xs.push(last_x);
        }
        self.state = state;
    }

    fn end_profile(&mut self) {
        let c = self.cur.unwrap();
        let top_overshoot = self.is_top_overshoot(self.last_y);
        let bottom_overshoot = self.is_bottom_overshoot(self.last_y);
        let p = &mut self.profiles[c];
        let h = p.xs.len() as i64;
        if h == 0 {
            return;
        }
        p.height = h;
        let (bottom, top);
        if p.flags & FLOW_UP != 0 {
            if top_overshoot {
                p.flags |= OVERSHOOT_TOP;
            }
            bottom = p.start;
            top = bottom + h;
            p.offset = 0;
            p.x = p.xs[0];
        } else {
            if bottom_overshoot {
                p.flags |= OVERSHOOT_BOTTOM;
            }
            top = p.start + 1;
            bottom = top - h;
            p.start = bottom;
            p.offset = h - 1;
            p.x = p.xs[(h - 1) as usize];
        }
        if let Err(i) = self.turns.binary_search(&bottom) {
            self.turns.insert(i, bottom);
        }
        self.turn_top = if self.committed.is_empty() { top } else { self.turn_top.max(top) };
        let first = *self.contour_first.get_or_insert(c);
        self.profiles[c].next = first;
        self.committed.push(c);
    }

    fn push_x(&mut self, x: i64) {
        let c = self.cur.unwrap();
        self.profiles[c].xs.push(x);
    }

    fn switch_state(&mut self, state: State) {
        if self.state != state {
            if self.state != State::Unknown {
                self.end_profile();
            }
            self.new_profile(state);
        }
    }

    fn line_to(&mut self, x: i64, y: i64) {
        if y != self.last_y {
            let state = if self.last_y < y { State::Ascending } else { State::Descending };
            self.switch_state(state);
            let (lx, ly, miny, maxy) = (self.last_x, self.last_y, self.min_y, self.max_y);
            if state == State::Ascending {
                self.line_up(lx, ly, x, y, miny, maxy);
            } else {
                self.line_up(lx, -ly, x, -y, -maxy, -miny);
            }
        }
        (self.last_x, self.last_y) = (x, y);
    }

    /// x crossings of an ascending segment at each scanline, with FreeType's exact integer stepping.
    fn line_up(&mut self, x1: i64, y1: i64, x2: i64, y2: i64, miny: i64, maxy: i64) {
        if y2 < miny || y1 > maxy {
            return;
        }
        let e2 = if y2 > maxy { maxy } else { self.floor(y2) };
        let mut e = if y1 < miny { miny } else { self.ceiling(y1) };
        if y1 == e {
            e += self.precision;
        }
        if e2 < e {
            return;
        }
        let mut size = self.trunc(e2 - e) + 1;
        let (dx, dy) = (x2 - x1, y2 - y1);
        if dx == 0 {
            for _ in 0..size {
                self.push_x(x1);
            }
            return;
        }
        let mut ix = (e - y1) * dx / dy;
        let mut x = x1 + ix;
        self.push_x(x);
        size -= 1;
        if size > 0 {
            let mut ax = dx * (e - y1) - dy * ix; // remainder
            ix = self.precision * dx / dy;
            let mut rx = dx * self.precision - dy * ix;
            let mut sx = 1;
            if x2 < x {
                ax = -ax;
                rx = -rx;
                sx = -1;
            }
            while size > 0 {
                x += ix;
                ax += rx;
                if ax >= dy {
                    ax -= dy;
                    x += sx;
                }
                self.push_x(x);
                size -= 1;
            }
        }
    }

    /// x crossings of an ascending Bezier arc stored at `arcs[base..=base + degree]` (end point first).
    fn bezier_up(&mut self, degree: usize, arcs: &mut Vec<Pt>, base: usize, miny: i64, maxy: i64) {
        let (y1, y2) = (arcs[base + degree].y, arcs[base].y);
        if y2 < miny || y1 > maxy {
            return;
        }
        let e2 = if y2 > maxy { maxy } else { self.floor(y2) };
        let mut e = if y1 < miny { miny } else { self.ceiling(y1) };
        if y1 == e {
            e += self.precision;
        }
        if e2 < e {
            return;
        }
        let mut arc = base as isize;
        loop {
            let a = arc as usize;
            let (x2, y2) = (arcs[a].x, arcs[a].y);
            if y2 > e {
                let dy = y2 - arcs[a + degree].y;
                let dx = x2 - arcs[a + degree].x;
                if dy > self.step || dx > self.step || -dx > self.step {
                    split(arcs, a, degree);
                    arc += degree as isize;
                } else {
                    self.push_x(x2 - (y2 - e) * dx / dy);
                    e += self.precision;
                    arc -= degree as isize;
                }
            } else {
                if y2 == e {
                    self.push_x(x2);
                    e += self.precision;
                }
                arc -= degree as isize;
            }
            if e > e2 || arc < base as isize {
                break;
            }
        }
    }

    fn bezier_down(&mut self, degree: usize, arcs: &mut Vec<Pt>, base: usize, miny: i64, maxy: i64) {
        for p in &mut arcs[base..=base + degree] {
            p.y = -p.y;
        }
        self.bezier_up(degree, arcs, base, -maxy, -miny);
        arcs[base].y = -arcs[base].y;
    }

    fn conic_to(&mut self, c: Pt, p: Pt) {
        let mut arcs = vec![Pt::default(); 3];
        arcs[2] = Pt { x: self.last_x, y: self.last_y };
        arcs[1] = c;
        arcs[0] = p;
        self.curve_to(arcs, 2);
    }

    fn cubic_to(&mut self, c1: Pt, c2: Pt, p: Pt) {
        let mut arcs = vec![Pt::default(); 4];
        arcs[3] = Pt { x: self.last_x, y: self.last_y };
        arcs[2] = c1;
        arcs[1] = c2;
        arcs[0] = p;
        self.curve_to(arcs, 3);
    }

    /// Shared body of Conic_To and Cubic_To: split until y-monotonic, then emit each piece.
    fn curve_to(&mut self, mut arcs: Vec<Pt>, degree: usize) {
        let mut arc = 0usize;
        loop {
            let (y1, y4, x4) = (arcs[arc + degree].y, arcs[arc].y, arcs[arc].x);
            let (ymin1, ymax1) = if y1 <= y4 { (y1, y4) } else { (y4, y1) };
            let (ymin2, ymax2) = if degree == 2 {
                (arcs[arc + 1].y, arcs[arc + 1].y)
            } else {
                let (a, b) = (arcs[arc + 2].y, arcs[arc + 1].y);
                if a <= b { (a, b) } else { (b, a) }
            };
            if ymin2 < self.floor(ymin1) || ymax2 > self.ceiling(ymax1) {
                split(&mut arcs, arc, degree);
                arc += degree;
                continue;
            } else if y1 != y4 {
                let state = if y1 < y4 { State::Ascending } else { State::Descending };
                self.switch_state(state);
                let (miny, maxy) = (self.min_y, self.max_y);
                if state == State::Ascending {
                    self.bezier_up(degree, &mut arcs, arc, miny, maxy);
                } else {
                    self.bezier_down(degree, &mut arcs, arc, miny, maxy);
                }
            }
            (self.last_x, self.last_y) = (x4, y4);
            if arc == 0 {
                break;
            }
            arc -= degree;
        }
    }

    fn draw_sweep(&mut self, flipped: bool) {
        let (min_y, max_y) = (self.turns[0], self.turn_top - 1);
        let mut waiting = self.committed.clone();
        let (mut left, mut right): (Vec<usize>, Vec<usize>) = (Vec::new(), Vec::new());
        for y in min_y..=max_y {
            // activate the profiles starting on this scanline, keeping each list sorted by x
            let mut i = 0;
            while i < waiting.len() {
                let p = waiting[i];
                if self.profiles[p].start == y {
                    waiting.remove(i);
                    let list = if self.profiles[p].flags & FLOW_UP != 0 { &mut left } else { &mut right };
                    let x = self.profiles[p].x;
                    let at = list.iter().position(|&q| self.profiles[q].x >= x).unwrap_or(list.len());
                    list.insert(at, p);
                } else {
                    i += 1;
                }
            }
            let mut dropouts = 0;
            for (&pl, &pr) in left.iter().zip(&right) {
                let (mut x1, mut x2) = (self.profiles[pl].x, self.profiles[pr].x);
                if x1 > x2 {
                    std::mem::swap(&mut x1, &mut x2);
                }
                if self.ceiling(x1) <= self.floor(x2) {
                    if flipped { self.horizontal_span(y, x1, x2) } else { self.vertical_span(y, x1, x2) }
                    continue;
                }
                // drop-out: the span misses every pixel center
                let mode = self.profiles[pl].flags & 7;
                if mode & 2 != 0 {
                    continue;
                }
                if mode & 1 != 0 {
                    let l = &self.profiles[pl];
                    let wide = x2 - x1 >= self.half;
                    if l.height == 1 && l.next == pr && !(l.flags & OVERSHOOT_TOP != 0 && wide) {
                        continue; // upper stub
                    }
                    if l.offset == 0 && self.profiles[pr].next == pl && !(l.flags & OVERSHOOT_BOTTOM != 0 && wide) {
                        continue; // lower stub
                    }
                }
                if mode & 4 != 0 {
                    x2 = self.floor((x1 + x2 + self.precision * 63 / 64) >> 1);
                    x1 = if x1 > x2 { x2 + self.precision } else { x2 - self.precision };
                } else {
                    x2 = self.floor(x2);
                    x1 = self.ceiling(x1);
                }
                self.profiles[pl].x = x2;
                self.profiles[pr].x = x1;
                self.profiles[pl].flags |= DROPOUT;
                dropouts += 1;
            }
            for (&pl, &pr) in left.iter().zip(&right) {
                if dropouts == 0 {
                    break;
                }
                if self.profiles[pl].flags & DROPOUT != 0 {
                    let (x1, x2) = (self.profiles[pl].x, self.profiles[pr].x);
                    if flipped { self.horizontal_drop(y, x1, x2) } else { self.vertical_drop(y, x1, x2) }
                    self.profiles[pl].flags &= !DROPOUT;
                    dropouts -= 1;
                }
            }
            self.increment(&mut left, 1);
            self.increment(&mut right, -1);
        }
    }

    fn increment(&mut self, list: &mut Vec<usize>, flow: i64) {
        list.retain(|&p| {
            let p = &mut self.profiles[p];
            p.height -= 1;
            if p.height == 0 {
                return false;
            }
            p.offset += flow;
            p.x = p.xs[p.offset as usize];
            true
        });
        // keep sorted (contours may cross): bubble sort with restart, as FreeType does
        let mut i = 0;
        while i + 1 < list.len() {
            if self.profiles[list[i]].x <= self.profiles[list[i + 1]].x {
                i += 1;
            } else {
                list.swap(i, i + 1);
                i = 0;
            }
        }
    }

    fn set(&mut self, col: i64, row: i64) {
        self.bits[(row * self.width + col) as usize] = true;
    }
    fn get(&self, col: i64, row: i64) -> bool {
        self.bits[(row * self.width + col) as usize]
    }

    fn vertical_span(&mut self, y: i64, x1: i64, x2: i64) {
        let (e1, e2) = (self.trunc(self.ceiling(x1)), self.trunc(self.floor(x2)));
        let right = self.width - 1;
        if e2 >= 0 && e1 <= right {
            for col in e1.max(0)..=e2.min(right) {
                self.set(col, y);
            }
        }
    }

    fn vertical_drop(&mut self, y: i64, x1: i64, x2: i64) {
        let (mut e1, e2) = (self.trunc(x1), self.trunc(x2));
        let right = self.width - 1;
        if e1 < 0 || e1 > right {
            e1 = e2;
        } else if e2 >= 0 && e2 <= right && self.get(e2, y) {
            return;
        }
        if e1 >= 0 && e1 <= right {
            self.set(e1, y);
        }
    }

    /// Only span ends lying exactly on pixel centers matter here (horizontal edges through centers).
    fn horizontal_span(&mut self, y: i64, x1: i64, x2: i64) {
        let top = self.rows - 1;
        for (x, e) in [(x1, self.ceiling(x1)), (x2, self.floor(x2))] {
            let row = self.trunc(e);
            if x == e && row >= 0 && row <= top {
                self.set(y, row);
            }
        }
    }

    fn horizontal_drop(&mut self, y: i64, x1: i64, x2: i64) {
        let (mut e1, e2) = (self.trunc(x1), self.trunc(x2));
        let top = self.rows - 1;
        if e1 < 0 || e1 > top {
            e1 = e2;
        } else if e2 >= 0 && e2 <= top && self.get(y, e2) {
            return;
        }
        if e1 >= 0 && e1 <= top {
            self.set(y, e1);
        }
    }
}

/// de Casteljau halving in place on the arc stack (FreeType's Split_Conic / Split_Cubic): the arc at `base`
/// (end point first) becomes two arcs, the first half on top of the stack at `base + degree`.
fn split(arcs: &mut Vec<Pt>, base: usize, degree: usize) {
    if arcs.len() < base + 2 * degree + 1 {
        arcs.resize(base + 2 * degree + 1, Pt::default());
    }
    let b = &mut arcs[base..];
    let xs: Vec<i64> = b[..=degree].iter().map(|p| p.x).collect();
    let ys: Vec<i64> = b[..=degree].iter().map(|p| p.y).collect();
    let (xs, ys) = (split_axis(&xs), split_axis(&ys));
    for (p, (x, y)) in b.iter_mut().zip(xs.into_iter().zip(ys)) {
        *p = Pt { x, y };
    }
}

/// One coordinate of a split, with FreeType's integer shifts; `v[0]` is the end point.
fn split_axis(v: &[i64]) -> Vec<i64> {
    if v.len() == 3 {
        let (a, c) = (v[0] + v[1], v[1] + v[2]);
        vec![v[0], a >> 1, (a + c) >> 2, c >> 1, v[2]]
    } else {
        let (a, b, c) = (v[0] + v[1], v[1] + v[2], v[2] + v[3]);
        let (a2, c2) = (a + b, c + b);
        vec![v[0], a >> 1, a2 >> 2, (a2 + c2) >> 3, c2 >> 2, c >> 1, v[3]]
    }
}
