// Reading and writing questlog card addresses inside a README.

import { THEMES, SCENES, cardName, sceneName, type Widget } from "../data";

export const WIDGETS: Widget[] = ["stats", "languages", "streak"];
export const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
/** Hosts that serve questlog cards; the page's own host counts too. */
export const HOSTS = ["questlog.cc", "questlog.cevdetbaran.com", "www.questlog.cc"];

export type Card = {
  origin: string;
  user: string;
  widget: Widget;
  scene: string;
  night: boolean;
  /** Every other option, in the order it was written, decoded. */
  params: [string, string][];
  /** GitHub's #gh-dark-mode-only or #gh-light-mode-only, kept as written. */
  hash: string;
};

/** One card found in the README text. */
export type Spot = {
  /** The whole image, picture block or img tag. */
  start: number;
  end: number;
  kind: "md" | "html" | "picture";
  card: Card;
  /** A picture block's night card, shown to readers in dark mode. */
  dark?: Card;
  alt: string;
  /** Where each address sits in the text, for drawing the preview. */
  urls: { start: number; end: number; role: "img" | "dark" | "light" }[];
  /** A lone image on its own line, or one inside other text. */
  inline: boolean;
  /** An img tag's other attributes, kept when it is rewritten. */
  attrs: string;
};

const isWidget = (w: string): w is Widget => (WIDGETS as string[]).includes(w);

export function themeOf(scene: string) {
  return THEMES.find((t) => t.scenes.includes(scene)) ?? THEMES[0];
}

export const sceneLabel = sceneName;

/** A card address, or null for anything that is not one. Reads the short form /user/card/scene/time and the long
 * form /card?user=..&scene=..&time=.. */
export function parseCard(src: string, ownHost = ""): Card | null {
  let u: URL;
  try {
    u = new URL(src.trim().replace(/&amp;/g, "&"));
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol) || !(HOSTS.includes(u.host) || u.host === ownHost)) return null;
  let parts: string[];
  try {
    parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
  const q = u.searchParams;
  let user: string | null;
  let widget: string;
  let scene: string | null;
  let time: string | null;
  if (parts.length === 1) {
    [widget] = parts;
    user = q.get("user");
    scene = q.get("scene");
    time = q.get("time");
  } else if (parts.length >= 2 && parts.length <= 4 && parts[0] !== "demo") {
    [user, widget] = parts;
    scene = parts[2] ?? q.get("scene");
    time = parts[3] ?? q.get("time");
  } else {
    return null;
  }
  if (!isWidget(widget) || !user) return null;
  const params = [...q.entries()].filter(([k]) => !["user", "scene", "time"].includes(k));
  return { origin: u.origin, user, widget, scene: scene || "forest", night: time === "night", params, hash: u.hash };
}

/** Encoded like encodeURIComponent, but keeps the commas, colons and bars of lists readable. Brackets and quotes are
 * encoded too: a ")" would end a Markdown image and a "'" a quoted attribute. */
export function enc(v: string) {
  return encodeURIComponent(v)
    .replace(/[()'!*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%2C/g, ",")
    .replace(/%3A/g, ":")
    .replace(/%7C/g, "|");
}

/** The short address: the scene and night as path parts when they differ from the defaults, the rest as a query. */
export function writeCard(c: Card, night = c.night): string {
  const path = night ? `/${c.scene}/night` : c.scene !== "forest" ? `/${c.scene}` : "";
  const query = c.params.map(([k, v]) => `${k}=${enc(v)}`).join("&");
  return `${c.origin}/${enc(c.user)}/${c.widget}${path}${query ? `?${query}` : ""}${c.hash}`;
}

/** `base` with the change from `before` to `after` made to it: a picture's night card keeps its own scene and options
 * unless that one changed. */
function carry(base: Card, before: Card, after: Card): Card {
  let out: Card = { ...base };
  for (const k of ["origin", "user", "widget", "scene"] as const) if (before[k] !== after[k]) out = { ...out, [k]: after[k] };
  const keys = new Set([...before.params, ...after.params].map(([k]) => k));
  for (const k of keys) if (getParam(before, k) !== getParam(after, k)) out = setParam(out, k, getParam(after, k));
  return out;
}

export function getParam(c: Card, key: string) {
  return c.params.find(([k]) => k === key)?.[1] ?? "";
}

/** The card with one option set, or removed when empty. A new option goes last. */
export function setParam(c: Card, key: string, value: string): Card {
  const v = value.trim() === "" ? "" : value;
  const has = c.params.some(([k]) => k === key);
  const params: [string, string][] = has
    ? c.params.flatMap(([k, x]): [string, string][] => (k !== key ? [[k, x]] : v ? [[k, v]] : []))
    : v
      ? [...c.params, [key, v]]
      : c.params;
  return { ...c, params };
}

/** `key:Text,key:Text` as a map, lower-case keys. */
export function readPairs(s: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of s.split(",")) {
    const i = p.indexOf(":");
    // the value keeps its trailing space, so a name can be typed word by word
    if (i > 0) m.set(p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trimStart());
  }
  return m;
}

export function writePairs(m: Map<string, string>) {
  return [...m].filter(([, v]) => v.trim()).map(([k, v]) => `${k}:${v.replace(/,/g, " ")}`).join(",");
}

/** The alt text a card gets when it is added; also what counts as "not written by hand" when the card changes. */
export function autoAlt(c: Card) {
  return `${c.user}'s ${cardName(c.widget, c.scene)}`;
}

function isAutoAlt(alt: string, c: Card) {
  const a = alt.trim().toLowerCase();
  const names = [c.widget, cardName(c.widget, c.scene), ...SCENES.map((s) => cardName(c.widget, s))];
  return a === "" || names.some((n) => a === `${c.user}'s ${n}`.toLowerCase());
}

/** The alt text after a card changes: kept when written by hand, renamed when it was the automatic one. */
export function nextAlt(alt: string, before: Card, after: Card) {
  return isAutoAlt(alt, before) ? autoAlt(after) : alt;
}

/** The text of one card, written fresh: one Markdown line, or a picture block when it switches with dark mode. A card
 * that was HTML stays HTML (`html`), since GitHub shows Markdown inside an HTML block as plain text. */
export function writeSpot(c: Card, alt: string, mode: "single" | "auto", attrs = "", inline = false, html = false): string {
  const a = alt.replace(/"/g, "&quot;");
  if (mode === "auto") {
    const lines = [
      "<picture>",
      `  <source media="(prefers-color-scheme: dark)" srcset="${writeCard(c, true)}">`,
      `  <img alt="${a}" src="${writeCard(c, false)}"${attrs}>`,
      "</picture>",
    ];
    return inline ? lines.map((l) => l.trim()).join("") : lines.join("\n");
  }
  if (attrs || html) return `<img alt="${a}" src="${writeCard(c)}"${attrs}>`;
  return `![${alt.replace(/[[\]]/g, "")}](${writeCard(c)})`;
}

/** Text ranges that Markdown shows as code or hides: fenced blocks, inline code and HTML comments. */
function quiet(text: string): [number, number][] {
  const out: [number, number][] = [];
  const fence = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[`~]*[ \t]*$|(?![\s\S]))/gm;
  for (const m of text.matchAll(fence)) out.push([m.index, m.index + m[0].length]);
  for (const m of text.matchAll(/<!--[\s\S]*?(?:-->|$(?![\s\S]))/g)) out.push([m.index, m.index + m[0].length]);
  // a code span ends at a blank line, like on GitHub
  for (const m of text.matchAll(/(`+)(?!`)(?:(?!\n[ \t]*\n)[\s\S])*?[^`]\1(?!`)/g)) {
    if (!out.some(([a, b]) => m.index >= a && m.index < b)) out.push([m.index, m.index + m[0].length]);
  }
  return out;
}

/** An attribute's value and where the value sits inside the tag. */
function attr(tag: string, name: string): { value: string; start: number; end: number } | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(tag);
  if (!m) return null;
  const value = m[1] ?? m[2] ?? m[3] ?? "";
  const start = m.index + m[0].length - value.length - (m[3] !== undefined ? 0 : 1);
  return { value, start, end: start + value.length };
}

const firstSrc = (srcset: string) => srcset.trim().split(/\s+/)[0] ?? "";

/** Whether a range has nothing else on its lines. */
function alone(text: string, start: number, end: number) {
  const before = text.slice(text.lastIndexOf("\n", start - 1) + 1, start);
  const nl = text.indexOf("\n", end);
  const after = text.slice(end, nl < 0 ? text.length : nl);
  return !before.trim() && !after.trim();
}

/** Whether a range is a paragraph of its own: alone on its lines, with a blank line (or the text's edge) above and
 * below. */
function paragraph(text: string, start: number, end: number) {
  if (!alone(text, start, end)) return false;
  const above = text.slice(0, text.lastIndexOf("\n", start - 1) + 1);
  const nl = text.indexOf("\n", end);
  const below = nl < 0 ? "" : text.slice(nl + 1);
  return (above === "" || /\n[ \t]*\n$/.test(above) || /^[ \t]*\n$/.test(above)) && (below === "" || /^[ \t]*(\n|$)/.test(below));
}

function otherAttrs(tag: string) {
  return tag
    .replace(/^<img\b/i, "")
    .replace(/\/?>$/, "")
    .replace(/\s(?:src|alt)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+)/gi, "")
    .replace(/\s+/g, " ")
    .trimEnd();
}

export function findSpots(text: string, ownHost = ""): Spot[] {
  const hidden = quiet(text);
  const inQuiet = (i: number) => hidden.some(([a, b]) => i >= a && i < b);
  const spots: Spot[] = [];
  const taken: [number, number][] = [];

  for (const m of text.matchAll(/<picture\b[^>]*>[\s\S]*?<\/picture\s*>/gi)) {
    if (inQuiet(m.index)) continue;
    const block = m[0];
    const urls: Spot["urls"] = [];
    let card: Card | null = null;
    let dark: Card | undefined;
    let alt = "";
    let attrs = "";
    for (const s of block.matchAll(/<source\b[^>]*>/gi)) {
      const srcset = attr(s[0], "srcset");
      const media = attr(s[0], "media")?.value.replace(/\s+/g, "") ?? "";
      if (!srcset) continue;
      const c = parseCard(firstSrc(srcset.value), ownHost);
      if (!c) continue;
      const at = m.index + s.index + srcset.start + srcset.value.length - srcset.value.trimStart().length;
      const role = media.includes("prefers-color-scheme:dark") ? "dark" : "light";
      urls.push({ start: at, end: at + firstSrc(srcset.value).length, role });
      if (role === "dark") dark = c;
      else card ??= c;
    }
    const img = /<img\b[^>]*>/i.exec(block);
    if (img) {
      const src = attr(img[0], "src");
      const c = src && parseCard(src.value, ownHost);
      if (src && c) {
        const at = m.index + img.index + src.start;
        urls.push({ start: at, end: src.end - src.start + at, role: "img" });
        card = c;
      }
      alt = attr(img[0], "alt")?.value ?? "";
      attrs = otherAttrs(img[0]);
    }
    card ??= dark ?? null;
    if (!card) continue;
    const end = m.index + block.length;
    taken.push([m.index, end]);
    spots.push({ start: m.index, end, kind: "picture", card, dark, alt, urls, inline: !alone(text, m.index, end), attrs: attrs ? ` ${attrs.trim()}` : "" });
  }
  const inTaken = (i: number) => taken.some(([a, b]) => i >= a && i < b);

  const md = /!\[([^\]\n]*)\]\(\s*(<[^>\n]*>|[^\s)]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*\)/g;
  for (const m of text.matchAll(md)) {
    if (inQuiet(m.index) || inTaken(m.index)) continue;
    const raw = m[2];
    const url = raw.startsWith("<") ? raw.slice(1, -1) : raw;
    const card = parseCard(url, ownHost);
    if (!card) continue;
    const at = m.index + m[0].indexOf(raw, 3 + m[1].length) + (raw.startsWith("<") ? 1 : 0);
    const end = m.index + m[0].length;
    spots.push({ start: m.index, end, kind: "md", card, alt: m[1], urls: [{ start: at, end: at + url.length, role: "img" }], inline: !alone(text, m.index, end), attrs: "" });
  }

  for (const m of text.matchAll(/<img\b[^>]*>/gi)) {
    if (inQuiet(m.index) || inTaken(m.index)) continue;
    const src = attr(m[0], "src");
    const card = src && parseCard(src.value, ownHost);
    if (!src || !card) continue;
    const at = m.index + src.start;
    const end = m.index + m[0].length;
    const rest = otherAttrs(m[0]);
    spots.push({
      start: m.index,
      end,
      kind: "html",
      card,
      alt: attr(m[0], "alt")?.value ?? "",
      urls: [{ start: at, end: at + src.value.length, role: "img" }],
      inline: !alone(text, m.index, end),
      attrs: rest ? ` ${rest.trim()}` : "",
    });
  }
  return spots.sort((a, b) => a.start - b.start);
}

/** The text with one card rewritten. Options change only its addresses; switching to or from "switch with dark
 * mode" rewrites the whole card. */
export function replaceSpot(text: string, spot: Spot, card: Card, mode: "single" | "auto"): string {
  const was: "single" | "auto" = spot.kind === "picture" && spot.dark ? "auto" : "single";
  const alt = nextAlt(spot.alt, spot.card, card);
  if (was === mode && spot.kind !== "picture") {
    const u = spot.urls[0];
    let out = text.slice(0, u.start) + writeCard(card) + text.slice(u.end);
    if (alt !== spot.alt) out = renameAlt(out, spot, alt, writeCard(card).length - (u.end - u.start));
    return out;
  }
  if (was === mode) {
    // a picture keeps its shape; each address follows its role
    let out = text;
    const dark = spot.dark ? carry(spot.dark, spot.card, card) : card;
    for (const u of [...spot.urls].sort((a, b) => b.start - a.start)) {
      const url = mode === "auto" ? (u.role === "dark" ? writeCard(dark, true) : writeCard(card, false)) : writeCard(card, card.night);
      out = out.slice(0, u.start) + url + out.slice(u.end);
    }
    return alt === spot.alt ? out : findAndRename(out, spot.start, alt);
  }
  let before = text.slice(0, spot.start);
  let after = text.slice(spot.end);
  // later lines of a picture block line up with the line it starts on
  const indent = /[ \t]*$/.exec(before)?.[0] ?? "";
  // an img tag stays one, and so does a picture inside an HTML block, where Markdown would show as plain text
  const html = spot.kind === "html" || (spot.kind === "picture" && !paragraph(text, spot.start, spot.end));
  const fresh = writeSpot(card, alt, mode, spot.attrs, spot.inline, html).replace(/\n/g, `\n${indent}`);
  if (mode === "auto" && spot.kind === "md" && !spot.inline) {
    // a picture block is HTML, which runs to the next blank line, so a Markdown line becoming one gets blank lines
    // around it; a card already inside HTML stays where it is
    if (before.trim() && !before.endsWith("\n\n")) before += "\n";
    if (after.trim() && !after.startsWith("\n\n")) after = `\n${after}`;
  }
  return before + fresh + after;
}

/** Renames the alt text of a single image after its address changed length by `shift`. */
function renameAlt(text: string, spot: Spot, alt: string, shift: number) {
  const block = text.slice(spot.start, spot.end + shift);
  const next =
    spot.kind === "md"
      ? block.replace(/^!\[[^\]\n]*\]/, `![${alt.replace(/[[\]]/g, "")}]`)
      : block.replace(/(\salt\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s"'>]+)/i, `$1"${alt.replace(/"/g, "&quot;")}"`);
  return text.slice(0, spot.start) + next + text.slice(spot.end + shift);
}

/** Renames the alt of the img inside the picture block starting at `start`. */
function findAndRename(text: string, start: number, alt: string) {
  const m = /<picture\b[^>]*>[\s\S]*?<\/picture\s*>/gi;
  m.lastIndex = start;
  const block = m.exec(text);
  if (!block || block.index !== start) return text;
  const next = block[0].replace(/(<img\b[^>]*\salt\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s"'>]+)/i, `$1"${alt.replace(/"/g, "&quot;")}"`);
  return text.slice(0, start) + next + text.slice(start + block[0].length);
}

/** The text without one card, and without the blank line it leaves behind. */
export function removeSpot(text: string, spot: Spot): string {
  let { start, end } = spot;
  if (!spot.inline) {
    start = text.lastIndexOf("\n", start - 1) + 1;
    const nl = text.indexOf("\n", end);
    end = nl < 0 ? text.length : nl + 1;
    if (text.slice(end).startsWith("\n") && (start === 0 || text.slice(0, start).endsWith("\n\n"))) end += 1;
  }
  return text.slice(0, start) + text.slice(end);
}

/** The text with a new card put at the cursor, on lines of its own with a blank line around it. */
export function insertAt(text: string, at: number, snippet: string): { text: string; start: number; end: number } {
  let i = Math.max(0, Math.min(at, text.length));
  // never split a line: a card goes after the line the cursor is on
  const nl = text.indexOf("\n", i);
  if (text.slice(text.lastIndexOf("\n", i - 1) + 1, i).trim() || (nl >= 0 && text.slice(i, nl).trim())) {
    i = nl < 0 ? text.length : nl;
  }
  const before = text.slice(0, i);
  const after = text.slice(i);
  const lead = before === "" ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const tail = after === "" ? "\n" : after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const start = before.length + lead.length;
  return { text: before + lead + snippet + tail + after, start, end: start + snippet.length };
}

/** Every card of one login moved to another, for when the login changes after cards were added. */
export function renameUser(text: string, from: string, to: string, ownHost = ""): string {
  let out = text;
  for (const spot of findSpots(text, ownHost).reverse()) {
    if (spot.card.user.toLowerCase() !== from.toLowerCase()) continue;
    const card = { ...spot.card, user: to };
    const mode = spot.kind === "picture" && spot.dark ? "auto" : "single";
    out = replaceSpot(out, spot, card, mode);
  }
  return out;
}
