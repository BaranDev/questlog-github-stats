// Draws a card in the browser from static files only: the scene paintings, the layout and ink data exported from
// art/ at build time (public/preview), the card fonts and the sample adventurer. It follows the server's renderer
// (src/card.rs and src/widgets) step by step, so the preview looks like the real card without asking for one.
import { RUNES, type Widget } from "./data";

export const W = 320;
export const H = 128;
const LINE = 10;
const ROW = 11;
const FRAMES = 8;
export const FRAME_MS = 180;

type Rgb = [number, number, number];
type Rect = { x: number; y: number; w: number; h: number };
type TextBox = { x: number; y: number; w: number; lines?: number; line_h?: number; size?: number };
type Anchors = { title: TextBox; subtitle: TextBox; message: Rect; style: "ink" | "outlined"; boxes: Record<string, Rect> };
export type SceneData = {
  ink: Record<string, string>;
  night: Record<string, string>;
  titles: Record<string, string>;
  labels: Record<string, string>;
  anchors: Record<Widget, Anchors>;
  nightPaintings: Widget[];
  /** Sprite names per folder: sprites, sprites-night, sprites-themed, sprites-themed-night. */
  sprites: Record<string, string[]>;
};
export type Sample = {
  level: number; xp: number; commits: number; prs: number; repos: number; stars: number; issues: number;
  reviews: number; followers: number; contributions: number; languages: [string, number][]; class: string;
  current_streak: number; best_streak: number;
};
export type ArtData = { shared: string[]; scenes: Record<string, SceneData>; sample: Sample };

/** What the builder sets, as the strings a URL would carry. */
export type Options = {
  title: string; subtitle: string; labels: string; values: string; note: string;
  titleColor: string; textColor: string; hide: string; animate: boolean; fire: "classic" | "themed";
};

const hexRgb = (h: string): Rgb => {
  const s = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as Rgb;
};
const key = (c: Rgb) => (c[0] << 16) | (c[1] << 8) | c[2];

/** `RRGGBB` or `RGB`, optional `#`, as the server reads it. */
export function color(s: string): Rgb | null | undefined {
  if (!s.trim()) return undefined;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
  return hexRgb(h);
}

const text = (s: string) => Array.from(s.trim()).slice(0, 60).join("");

/** `key:Text,key:Text` as the server reads it; null when a pair has no colon. */
export function pairs(s: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const p of s.split(",").filter((p) => p.trim()).slice(0, 20)) {
    const i = p.indexOf(":");
    if (i < 0) return null;
    const k = Array.from(p.slice(0, i).trim().replace(/[A-Z]/g, (c) => c.toLowerCase())).slice(0, 20).join("");
    if (!k) return null;
    out[k] = text(p.slice(i + 1));
  }
  return out;
}

// ---- fonts: whole-pixel advances and 1-bit glyphs, like Pillow's fontmode "1" ----

/** A glyph as the server draws it: advance, offset from the pen and the ascender line, size, and its bits. */
type Glyph = { adv: number; ox: number; oy: number; w: number; h: number; on: Uint8Array };
type Font = { css: string; size: number; ascent: number; adv: Map<string, number>; glyphs: Map<string, Glyph> };
export type GlyphData = Record<string, Record<string, [number, number, number, number, number, string]>>;

/** The glyph table exported from the card fonts (public/preview/glyphs.json). */
function glyphTable(rows: GlyphData[string] = {}): Map<string, Glyph> {
  return new Map(
    Object.entries(rows).map(([ch, [adv, ox, oy, w, h, hex]]) => {
      const bits = hex ? BigInt(`0x${hex}`).toString(2).padStart(w * h, "0") : "";
      return [ch, { adv, ox, oy, w, h, on: Uint8Array.from(bits, (b) => (b === "1" ? 1 : 0)) }];
    }),
  );
}
let scratch: CanvasRenderingContext2D | null = null;
const ctx2d = () => (scratch ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true })!);

export function font(family: string, size: number, cff: boolean, rows?: GlyphData[string]): Font {
  const c = ctx2d();
  c.font = `${size}px ${family}`;
  const a = c.measureText("H").fontBoundingBoxAscent;
  const glyphs = glyphTable(rows);
  return { css: c.font, size, ascent: cff ? Math.ceil(a) : Math.round(a), adv: new Map([...glyphs].map(([ch, g]) => [ch, g.adv])), glyphs };
}

function advance(f: Font, ch: string): number {
  let a = f.adv.get(ch);
  if (a === undefined) {
    const c = ctx2d();
    c.font = f.css;
    a = Math.round(c.measureText(ch).width);
    f.adv.set(ch, a);
  }
  return a;
}

const length = (f: Font, s: string) => Array.from(s).reduce((n, ch) => n + advance(f, ch), 0);

type Mask = { w: number; h: number; on: Uint8Array; pad: number };

function mask(f: Font, s: string): Mask {
  const pad = 4;
  if (Array.from(s).every((ch) => f.glyphs.has(ch))) {
    // the exported glyphs: the same pixels the server stamps
    const w = Math.max(1, length(f, s) + pad * 2 + f.size);
    const h = f.size * 2 + pad * 2;
    const on = new Uint8Array(w * h);
    let pen = pad;
    for (const ch of s) {
      const g = f.glyphs.get(ch)!;
      for (let r = 0; r < g.h; r++)
        for (let col = 0; col < g.w; col++) {
          const x = pen + g.ox + col;
          const y = pad + g.oy + r;
          if (g.on[r * g.w + col] && x >= 0 && x < w && y >= 0 && y < h) on[y * w + x] = 1;
        }
      pen += g.adv;
    }
    return { w, h, on, pad };
  }
  const w = Math.max(1, length(f, s) + pad * 2);
  const h = f.size * 2 + pad * 2;
  const c = ctx2d();
  c.canvas.width = w;
  c.canvas.height = h;
  c.font = f.css;
  c.fillStyle = "#fff";
  c.textBaseline = "alphabetic";
  let pen = pad;
  for (const ch of s) {
    c.fillText(ch, pen, pad + f.ascent);
    pen += advance(f, ch);
  }
  const d = c.getImageData(0, 0, w, h).data;
  const on = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) on[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
  return { w, h, on, pad };
}

export function fit(f: Font, s: string, maxW: number): string {
  if (length(f, s) <= maxW) return s;
  const chars = Array.from(s);
  const dots = advance(f, ".") * 3;
  let sum = 0;
  let keep = 0;
  for (let k = 1; k <= chars.length; k++) {
    sum += advance(f, chars[k - 1]);
    if (sum + dots <= maxW) keep = k;
  }
  if (keep === 0) return ["..", ".", ""].find((d) => length(f, d) <= maxW) ?? "";
  return `${chars.slice(0, keep).join("").trimEnd()}...`;
}

function wrap(f: Font, s: string, maxW: number, maxLines: number): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  if (maxLines <= 1) return [fit(f, words.join(" "), maxW)];
  const lines: string[] = [];
  let cur = "";
  for (let i = 0; i < words.length; i++) {
    const cand = cur ? `${cur} ${words[i]}` : words[i];
    if (!cur || length(f, cand) <= maxW) {
      cur = cand;
      continue;
    }
    lines.push(cur);
    cur = "";
    if (lines.length === maxLines - 1) {
      lines.push(words.slice(i).join(" "));
      break;
    }
    cur = words[i];
  }
  if (cur) lines.push(cur);
  return lines.map((l) => fit(f, l, maxW));
}

function line(f: Font, label: string, value: string, w: number): string {
  const v = fit(f, value, w);
  const l = fit(f, label, w - length(f, v) - length(f, " "));
  return l ? `${l} ${v}` : v;
}

const grouped = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
function compact(n: number): string {
  const one = (x: number) => (Math.floor(x * 10) / 10).toFixed(1).replace(/\.0$/, "");
  return n < 1000 ? `${n}` : n < 1e6 ? `${one(n / 1e3)}k` : `${one(n / 1e6)}M`;
}
const number = (f: Font, n: number, maxW: number) => (length(f, grouped(n)) <= maxW ? grouped(n) : compact(n));

// ---- images ----

export type Img = { w: number; h: number; px: Uint8ClampedArray };

const blank = (w = W, h = H): Img => ({ w, h, px: new Uint8ClampedArray(w * h * 4) });

export function imgFrom(el: HTMLImageElement, scaleTo?: [number, number]): Img {
  const [w, h] = scaleTo ?? [el.naturalWidth, el.naturalHeight];
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.drawImage(el, 0, 0, w, h);
  return { w, h, px: g.getImageData(0, 0, w, h).data };
}

function over(dst: Img, src: Img, x: number, y: number) {
  for (let r = 0; r < src.h; r++) {
    const ty = y + r;
    if (ty < 0 || ty >= dst.h) continue;
    for (let col = 0; col < src.w; col++) {
      const tx = x + col;
      if (tx < 0 || tx >= dst.w) continue;
      const s = (r * src.w + col) * 4;
      const a = src.px[s + 3] / 255;
      if (!a) continue;
      const d = (ty * dst.w + tx) * 4;
      const da = dst.px[d + 3] / 255;
      const oa = a + da * (1 - a);
      for (let k = 0; k < 3; k++) dst.px[d + k] = Math.round((src.px[s + k] * a + dst.px[d + k] * da * (1 - a)) / oa);
      dst.px[d + 3] = Math.round(oa * 255);
    }
  }
}

function mapColors(img: Img, f: (c: Rgb) => Rgb): Img {
  const out = { w: img.w, h: img.h, px: new Uint8ClampedArray(img.px) };
  for (let i = 0; i < out.px.length; i += 4) {
    if (!out.px[i + 3]) continue;
    const c = f([out.px[i], out.px[i + 1], out.px[i + 2]]);
    out.px.set(c, i);
  }
  return out;
}

function scaled2(img: Img): Img {
  const out = blank(img.w * 2, img.h * 2);
  for (let y = 0; y < out.h; y++)
    for (let x = 0; x < out.w; x++) {
      const s = ((y >> 1) * img.w + (x >> 1)) * 4;
      out.px.set(img.px.subarray(s, s + 4), (y * out.w + x) * 4);
    }
  return out;
}

// ---- the card ----

/** Everything loaded for one scene and card: paintings and sprites already decoded. */
export type Loaded = {
  scene: SceneData;
  day: Img;
  night: Img | null;
  /** The scene's sprites by folder, then the shared ones. */
  sprites: Record<string, Map<string, Img>>;
  shared: Map<string, Img>;
  text: Font;
  title: Font;
  titleSmall: Font;
};

class Card {
  layer = blank();
  nightTable: Map<number, Rgb>;
  constructor(
    public L: Loaded,
    public w: Widget,
    public isNight: boolean,
    public titleColor: Rgb | undefined,
    public textColor: Rgb | undefined,
  ) {
    this.nightTable = new Map(Object.entries(L.scene.night).map(([k, v]) => [key(hexRgb(k)), hexRgb(v)]));
  }
  get anchors() {
    return this.L.scene.anchors[this.w];
  }
  tone(c: Rgb): Rgb {
    return this.isNight ? (this.nightTable.get(key(c)) ?? c) : c;
  }
  ink(name: string): Rgb {
    return this.tone(hexRgb(this.L.scene.ink[name]));
  }
  set(x: number, y: number, c: Rgb) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    this.layer.px.set([c[0], c[1], c[2], 255], i);
  }
  fillRect(x0: number, y0: number, x1: number, y1: number, c: Rgb) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c);
  }
  stamp(m: Mask, x: number, y: number, c: Rgb) {
    for (let r = 0; r < m.h; r++) for (let col = 0; col < m.w; col++) if (m.on[r * m.w + col]) this.set(x + col, y + r, c);
  }
  plain(s: string, x: number, y: number, c: Rgb) {
    const m = mask(this.L.text, s);
    this.stamp(m, x - m.pad, y - m.pad, c);
  }
  outlined(f: Font, s: string, x: number, y: number, shadow: boolean, fill: Rgb) {
    const m = mask(f, s);
    let minX = m.w;
    let minY = m.h;
    for (let r = 0; r < m.h; r++)
      for (let col = 0; col < m.w; col++)
        if (m.on[r * m.w + col]) {
          minX = Math.min(minX, col);
          minY = Math.min(minY, r);
        }
    if (minX === m.w) return;
    const [ox, oy] = [x + 1 - minX, y + 1 - minY];
    const span = shadow ? [-1, 0, 1, 2] : [-1, 0, 1];
    const edge = this.ink("title_edge");
    for (const dx of span) for (const dy of span) this.stamp(m, ox + dx, oy + dy, edge);
    this.stamp(m, ox, oy, fill);
  }
  titleInk() {
    return this.titleColor ?? this.ink("title");
  }
  say(s: string, x: number, y: number) {
    if (this.anchors.style === "ink") this.plain(s, x, y, this.textColor ?? this.ink("text"));
    else this.outlined(this.L.text, s, x, y, false, this.textColor ?? this.ink("title"));
  }
  titleFont() {
    return this.anchors.title.size === 20 ? this.L.titleSmall : this.L.title;
  }
  title(s: string): number {
    const tb = this.anchors.title;
    const f = this.titleFont();
    const lines = wrap(f, s, tb.w, tb.lines ?? 1);
    lines.forEach((l, i) => this.outlined(f, l, tb.x, tb.y + i * (tb.line_h ?? 24), true, this.titleInk()));
    return lines.length ? length(f, lines[0]) + 3 : 0;
  }
  subtitleAfter(s: string, titleWidth: number) {
    const tb = this.anchors.subtitle;
    const x = Math.max(tb.x, this.anchors.title.x + titleWidth + 6);
    this.outlined(this.L.text, fit(this.L.text, s, tb.x + tb.w - x), x, tb.y, false, this.titleInk());
  }
  subtitle(s: string) {
    const tb = this.anchors.subtitle;
    this.outlined(this.L.text, fit(this.L.text, s, tb.w), tb.x, tb.y, false, this.titleInk());
  }
  row(label: string, value: string, x: number, y: number, w: number) {
    const f = this.L.text;
    const v = fit(f, value, w);
    const vw = length(f, v);
    this.say(fit(f, label, w - vw - 2), x, y);
    this.say(v, x + w - vw, y);
  }
  note(lines: string[], spots: [number, number, number, number][]) {
    const room = (s: number[]) => Math.max(0, Math.trunc((s[3] - s[1]) / LINE));
    let best = spots[0];
    for (const s of spots) if (Math.min(room(s), lines.length) > Math.min(room(best), lines.length)) best = s;
    if (!best) return;
    lines.slice(0, room(best)).forEach((l, i) => this.say(fit(this.L.text, l, best[2]), best[0], best[1] + i * LINE));
  }
  bar(x: number, y: number, w: number, frac: number, fill: Rgb) {
    this.fillRect(x, y, x + w - 1, y + 1, this.ink("bar_track"));
    const n = Math.round((w * Math.min(1, Math.max(0, frac))) / 2) * 2;
    if (n > 0) this.fillRect(x, y, x + n - 1, y + 1, fill);
  }
  message(msg: string) {
    const r = this.anchors.message;
    const f = this.L.text;
    const lines = wrap(f, msg, r.w, Math.max(1, Math.trunc(r.h / LINE)));
    const top = r.y + Math.trunc((r.h - lines.length * LINE) / 2);
    lines.forEach((l, i) => this.say(l, r.x + Math.trunc((r.w - length(f, l)) / 2), top + i * LINE));
  }
  painting(): Img {
    const { day, night } = this.L;
    if (!this.isNight) return day;
    return night ?? mapColors(day, (c) => this.tone(c));
  }
  frame(layer = this.layer): Img {
    const out = { w: W, h: H, px: new Uint8ClampedArray(this.painting().px) };
    over(out, layer, 0, 0);
    return out;
  }
}

/** The look a URL with these options would ask for, or the error card's message. */
function look(o: Options) {
  const labels = pairs(o.labels);
  const values = pairs(o.values);
  const tc = color(o.titleColor);
  const xc = color(o.textColor);
  const error =
    labels === null ? "Bad labels: use key:Text,key:Text"
    : values === null ? "Bad values: use key:Text,key:Text"
    : tc === null ? "Bad title_color: use RRGGBB or RGB"
    : xc === null ? "Bad text_color: use RRGGBB or RGB"
    : undefined;
  return {
    error,
    title: text(o.title),
    subtitle: text(o.subtitle),
    labels: labels ?? {},
    values: values ?? {},
    note: o.note.split("|").map(text).filter(Boolean).slice(0, 2),
    titleColor: tc ?? undefined,
    textColor: xc ?? undefined,
    hide: new Set(o.hide.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean)),
  };
}

export function tier(current: number) {
  return current === 0 ? "ashes" : current <= 6 ? "flame-small" : current <= 29 ? "flame-steady" : "flame-bonfire";
}

/** The card's frames (one for /stats, eight for the others, one when still). */
export function draw(L: Loaded, w: Widget, isNight: boolean, o: Options, s: Sample): Img[] {
  const lk = look(o);
  const c = new Card(L, w, isNight, lk.titleColor, lk.textColor);
  const sc = L.scene;
  const label = (k: string) => lk.labels[k] ?? sc.labels[k] ?? k;
  const word = (k: string, d: string) => lk.labels[k] ?? d;
  const value = (k: string, real: string) => lk.values[k] ?? real;
  const shown = (k: string) => !lk.hide.has(k);
  const f = L.text;
  const boxes = c.anchors.boxes;
  const tw = c.title(lk.title || sc.titles[w] || "");
  if (lk.error) {
    c.message(lk.error);
    return [c.frame()];
  }
  let frames: Img[];
  if (w === "stats") {
    c.subtitleAfter(lk.subtitle || s.class, tw);
    const { left, right } = boxes;
    let y = left.y;
    if (shown("level")) {
      c.say(line(f, label("level"), value("level", `${s.level}`), left.w), left.x, y);
      c.bar(left.x, y + 8, left.w, s.xp, c.ink("xp"));
      y += 14;
    }
    const ends: number[] = [];
    for (const [rows, b, y0] of [
      [[["commits", s.commits], ["prs", s.prs], ["repos", s.repos], ["stars", s.stars]], left, y],
      [[["issues", s.issues], ["reviews", s.reviews], ["followers", s.followers], ["contributions", s.contributions]], right, right.y],
    ] as [[string, number][], Rect, number][]) {
      let yy = y0;
      for (const [k, v] of rows.filter(([k]) => shown(k))) {
        c.row(label(k), value(k, number(f, v, Math.trunc(b.w / 2))), b.x, yy, b.w);
        yy += LINE;
      }
      ends.push(yy);
    }
    const bottom = Math.max(left.y + left.h, right.y + right.h, left.y + 14 + 4 * LINE);
    c.note(lk.note, [
      [left.x, Math.max(ends[0], ends[1]), right.x + right.w - left.x, bottom],
      [right.x, ends[1], right.w, bottom],
      [left.x, ends[0], left.w, bottom],
    ]);
    frames = [c.frame()];
  } else if (w === "languages") {
    if (lk.subtitle) c.subtitle(lk.subtitle);
    const list = boxes.list;
    const rows = Math.trunc((5 * ROW - lk.note.length * LINE) / ROW);
    const langs = s.languages.filter(([n]) => !lk.hide.has(n.toLowerCase())).slice(0, rows);
    if (!langs.length) {
      c.message(word("empty", "No spells learned yet"));
      return [c.frame()];
    }
    const top = Math.max(langs[0][1], Number.EPSILON);
    const runes: [number, number][] = [];
    const edge = c.ink("title_edge");
    langs.forEach(([name, share], i) => {
      const y = list.y + i * ROW;
      const r = RUNES.find((r) => r.lang === name) ?? RUNES[RUNES.length - 1];
      const col = hexRgb(r.color);
      const cells = [...r.d.matchAll(/M(\d+) (\d+)h(\d+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
      for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]])
        for (const [cx, cy, cw] of cells) c.fillRect(list.x + 1 + cx + dx, y + cy + dy, list.x + cx + cw + dx, y + cy + dy, edge);
      for (const [cx, cy, cw] of cells) c.fillRect(list.x + 1 + cx, y + cy, list.x + cx + cw, y + cy, col);
      runes.push([list.x + 3, y - 1]);
      const k = name.toLowerCase();
      c.row(word(k, name), value(k, `${Math.round(share * 100)}${word("percent", "%")}`), list.x + 12, y, list.w - 12);
      c.bar(list.x + 12, y + 7, list.w - 12, share / top, col);
    });
    c.note(lk.note, [[list.x + 12, list.y + langs.length * ROW, list.w - 12, Math.max(list.y + list.h, list.y + 5 * ROW)]]);
    const base = c.layer;
    const spark = c.ink("spark");
    frames = Array.from({ length: FRAMES }, (_, fr) => {
      c.layer = { ...base, px: new Uint8ClampedArray(base.px) };
      runes.forEach(([x, y], i) => {
        const rise = ((fr + i * 3) % 4) * 2;
        const sx = x + ((fr + i) % 2 === 0 ? -2 : 2);
        c.fillRect(sx, y - 2 - rise, sx + 1, y - 1 - rise, spark);
      });
      return c.frame();
    });
  } else {
    if (lk.subtitle) c.subtitle(lk.subtitle);
    const { fire, text: tb, notches } = boxes;
    const days = label("days");
    let y = tb.y;
    for (const [k, v, unit] of [["current", s.current_streak, true], ["best", s.best_streak, true], ["total", s.contributions, false]] as [string, number, boolean][]) {
      if (!shown(k)) continue;
      const n = number(f, v, Math.trunc(tb.w / 2));
      c.say(line(f, label(k), value(k, unit ? `${n} ${days}` : n), tb.w), tb.x, y);
      y += LINE;
    }
    const t = c.anchors.title;
    const top = Math.max(t.y + (t.lines ?? 1) * (t.line_h ?? 24), c.anchors.subtitle.y + LINE);
    c.note(lk.note, [
      [tb.x, y, tb.w, tb.y + tb.h],
      [tb.x, notches.y + notches.h + 2, tb.w, H - 2],
      [tb.x, Math.max(top, tb.y - lk.note.length * LINE), tb.w, tb.y],
    ]);
    if (shown("best")) {
      const marks = Math.min(Math.trunc(s.best_streak / 5), Math.trunc(notches.w / 4));
      for (let i = 0; i < marks; i++) c.fillRect(notches.x + i * 4, notches.y, notches.x + i * 4 + 1, notches.y + notches.h - 1, c.ink("notch"));
    }
    const themed = o.fire === "themed";
    // the themed fire's own drawings first, then the scene's, then the shared flames; a -night folder wins at night
    const dirs = [...(themed ? ["sprites-themed"] : []), "sprites"].flatMap((d) => (isNight ? [`${d}-night`, d] : [d]));
    const sprite = (name: string) => dirs.map((d) => L.sprites[d]?.get(name)).find(Boolean) ?? L.shared.get(name);
    const seq = (p: string) => {
      const out: Img[] = [];
      for (let i = 0; ; i++) {
        const im = sprite(`${p}-${i}`);
        if (!im) return out;
        out.push(im);
      }
    };
    const prefix = tier(s.current_streak);
    const sprites = seq(prefix);
    const glows = prefix.startsWith("flame-") ? seq(`glow-${prefix.slice(6)}`) : [];
    const base = c.layer;
    const [cx, ground] = [fire.x + Math.trunc(fire.w / 2), fire.y + fire.h];
    frames = Array.from({ length: FRAMES }, (_, fr) => {
      let layer: Img = { ...base, px: new Uint8ClampedArray(base.px) };
      const glow = glows[fr % Math.max(1, glows.length)];
      if (glow) {
        const g = blank();
        over(g, glow.w === W ? glow : scaled2(glow), 0, 0);
        over(g, base, 0, 0);
        layer = g;
      }
      const sp = sprites[fr % Math.max(1, sprites.length)];
      if (sp) {
        const big = scaled2(mapColors(sp, (col) => c.tone(col)));
        over(layer, big, cx - Math.trunc(big.w / 2 / 2) * 2, ground - big.h);
      }
      return c.frame(layer);
    });
  }
  return o.animate ? frames : frames.slice(0, 1);
}
