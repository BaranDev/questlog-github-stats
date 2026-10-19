// The README drawn the way GitHub shows it: GitHub-flavored Markdown, HTML kept to what GitHub keeps.

import { Marked } from "marked";
import DOMPurify from "dompurify";
import { parseCard, type Spot } from "./cards";

export type Theme = "light" | "dark";

const markdown = new Marked({ gfm: true, breaks: false, async: false });
const MARK = "https://questlog.invalid/";

/** GitHub drops scripts, styles, frames and forms, and every style, class and id attribute. */
const PURIFY = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["style", "form", "button", "select", "textarea", "iframe", "object", "embed"],
  FORBID_ATTR: ["style", "class", "id"],
};

/** Where the preview loads a card from: this site, so a self-hosted or local copy draws its own cards. `v` changes
 * only to load a card again after its stats arrive; the server ignores it. */
export function previewSrc(url: string, ownHost: string, v: number) {
  const card = parseCard(url, ownHost);
  if (!card) return url;
  let u: URL;
  try {
    u = new URL(url.replace(/&amp;/g, "&"));
  } catch {
    return url;
  }
  const local = new URL(`${u.pathname}${u.search}`, location.origin);
  if (v) local.searchParams.set("v", String(v));
  return local.href;
}

const relative = (u: string) => u !== "" && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u);

/** The README as a detached element, ready to replace the preview's content. Each card's img carries
 * data-spot, its index in `spots`. */
export function render(text: string, spots: Spot[], o: { theme: Theme; login: string; ownHost: string; v: number }) {
  // every card address becomes a marker, so the drawn img can be traced back to its place in the text
  const urls: string[] = [];
  const marks: { start: number; end: number; tag: string }[] = [];
  spots.forEach((spot, i) =>
    spot.urls.forEach((u) => {
      urls.push(text.slice(u.start, u.end));
      marks.push({ start: u.start, end: u.end, tag: `${MARK}${i}/${urls.length - 1}` });
    }),
  );
  let marked = text;
  for (const m of [...marks].sort((a, b) => b.start - a.start)) marked = marked.slice(0, m.start) + m.tag + marked.slice(m.end);

  const html = DOMPurify.sanitize(markdown.parse(marked) as string, PURIFY) as string;
  // parsed in an inert document, so nothing loads before the addresses are final
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement;

  const resolve = (src: string) => {
    if (src.startsWith(MARK)) {
      const [spot, url] = src.slice(MARK.length).split("/").map(Number);
      return { src: previewSrc(urls[url] ?? "", o.ownHost, o.v), spot, written: urls[url] ?? "" };
    }
    if (relative(src)) return { src: `https://raw.githubusercontent.com/${o.login}/${o.login}/HEAD/${src.replace(/^\.?\//, "")}`, spot: -1, written: src };
    return { src, spot: -1, written: src };
  };

  // a picture shows the source that matches the reader's theme, here the preview's switch
  for (const pic of root.querySelectorAll("picture")) {
    const img = pic.querySelector("img");
    const match = [...pic.querySelectorAll("source")].find((s) =>
      (s.getAttribute("media") ?? "").replace(/\s+/g, "").includes(`prefers-color-scheme:${o.theme}`),
    );
    const chosen = match?.getAttribute("srcset")?.trim().split(/\s+/)[0];
    if (img && chosen) img.setAttribute("src", chosen);
    pic.querySelectorAll("source").forEach((s) => s.remove());
  }

  for (const img of root.querySelectorAll("img")) {
    const { src, spot, written } = resolve(img.getAttribute("src") ?? "");
    img.setAttribute("src", src);
    if ((written.endsWith("#gh-dark-mode-only") && o.theme === "light") || (written.endsWith("#gh-light-mode-only") && o.theme === "dark")) {
      img.hidden = true;
    }
    if (spot >= 0) {
      img.setAttribute("data-spot", String(spot));
      img.setAttribute("tabindex", "0");
      img.setAttribute("role", "button");
      img.setAttribute("aria-label", `Change this card: ${img.getAttribute("alt") || "questlog card"}`);
    }
  }
  for (const a of root.querySelectorAll("a")) {
    const href = a.getAttribute("href") ?? "";
    if (relative(href)) a.setAttribute("href", `https://github.com/${o.login}/${o.login}/blob/HEAD/${href.replace(/^\.?\//, "")}`);
    if (!href.startsWith("#")) {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    }
  }
  // task list boxes are the only inputs GitHub keeps
  for (const input of root.querySelectorAll("input")) {
    if (input.type !== "checkbox") input.remove();
    else input.disabled = true;
  }
  return document.importNode(root, true);
}

/** Brings `to`'s content into `from`, keeping every node that did not change, so cards that are already drawn stay
 * on screen instead of loading again. */
export function morph(from: Element, to: Element) {
  const next = [...to.childNodes];
  const now = [...from.childNodes];
  next.forEach((n, i) => {
    const o = now[i];
    if (!o) {
      from.appendChild(n);
    } else if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName) {
      from.replaceChild(n, o);
    } else if (o.nodeType === Node.TEXT_NODE || o.nodeType === Node.COMMENT_NODE) {
      if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue;
    } else {
      const oe = o as Element;
      const ne = n as Element;
      for (const { name } of [...oe.attributes]) if (!ne.hasAttribute(name)) oe.removeAttribute(name);
      for (const { name, value } of [...ne.attributes]) if (oe.getAttribute(name) !== value) oe.setAttribute(name, value);
      morph(oe, ne);
    }
  });
  now.slice(next.length).forEach((o) => o.remove());
}
