"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Maximize2, X } from "lucide-react";
import { m, rich } from "@/i18n";
import { HOST } from "./data";
import { LOOKS } from "./combos";
import s from "./Preview.module.css";

const A = m.allCards;

/** One card the preview can show: its address, what it is, where it comes from, and its painting's height. */
export type PreviewItem = { address: string; name: string; place: string; look: string; h: number; day: string; night: string };

/** The same address at another time of day. */
const at = (address: string, time: "day" | "night") => {
  const [path, query = ""] = address.split("?");
  const q = new URLSearchParams(query);
  q.set("time", time);
  return `${path}?${q.toString().replace(/%3A/gi, ":").replace(/%2C/gi, ",").replace(/%7C/gi, "|")}`;
};

/** A preview item for a card address, with its look (day or night, fine or chunky) read from the address. */
export function itemOf(address: string, name: string, place: string, h = 128): PreviewItem {
  const q = new URLSearchParams(address.split("?")[1] ?? "");
  const night = q.get("time") === "night";
  const chunky = q.get("pixels") === "chunky";
  const look = LOOKS.find((l) => (l.time === "night") === night && l.chunky === chunky)?.label ?? LOOKS[0].label;
  return { address, name, place, look, h, day: at(address, "day"), night: at(address, "night") };
}

/** The small sign in a picture's corner that says it opens bigger. Its parent needs position: relative. */
export function PreviewHint() {
  return (
    <span className={s.hint} aria-hidden="true">
      <Maximize2 />
    </span>
  );
}

/** Copies text and says so only once the browser confirms it. */
function useCopy(): [string, (key: string, text: string) => void] {
  const [done, setDone] = useState("");
  const timer = useRef(0);
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(key);
    } catch {
      setDone(`fail:${key}`);
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(""), 2200);
  };
  return [done, copy];
}

/** The card big and live (animated), with what you can do with it, and Previous and Next through the page's cards.
 * `demo`: the cards show the built-in adventurer, so the help says how to put your own login in. */
export default function Preview({ items, index, onMove, onClose, demo = false }: {
  items: PreviewItem[];
  index: number;
  onMove: (i: number) => void;
  onClose: () => void;
  demo?: boolean;
}) {
  const item = items[index];
  const count = items.length;
  const dialog = useRef<HTMLDialogElement>(null);
  const [done, copy] = useCopy();
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && index < count - 1) onMove(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onMove(index - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index, count, onMove]);

  const url = HOST + item.address;
  const md = `![${item.name}](${url})`;
  const picture = [
    "<picture>",
    `  <source media="(prefers-color-scheme: dark)" srcset="${HOST + item.night}">`,
    `  <img alt="${item.name.replace(/"/g, "&quot;")}" src="${HOST + item.day}">`,
    "</picture>",
  ].join("\n");
  const label = (key: string, text: string) => (done === key ? A.copied : done === `fail:${key}` ? A.copyFailed : text);
  const icon = (key: string) => (done === key ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />);
  const live = `${item.address}${item.address.includes("?") ? "&" : "?"}scale=4`;

  return (
    <dialog
      ref={dialog}
      className={s.preview}
      aria-labelledby="preview-title"
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      <div className={s.previewBox}>
        <div className={s.previewHead}>
          <div>
            <h2 id="preview-title" className={s.previewTitle}>
              {item.name}
            </h2>
            <p className={s.previewSub}>{A.previewSub(item.place, item.look, index + 1, count)}</p>
          </div>
          <button type="button" className={s.previewClose} onClick={onClose} aria-label={A.close}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className={s.previewStage}>
          <button type="button" className={s.previewArrow} onClick={() => onMove(index - 1)} disabled={index === 0} aria-label={A.previous}>
            <ChevronLeft aria-hidden="true" />
          </button>
          <img key={item.address} className="pix" src={live} width={1280} height={item.h * 4} alt={A.liveAlt(item.name, item.look)} />
          <button
            type="button"
            className={s.previewArrow}
            onClick={() => onMove(index + 1)}
            disabled={index === count - 1}
            aria-label={A.next}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
        <code className={s.previewUrl}>{url}</code>
        <div className={s.previewActions}>
          <button type="button" className="btn btn-primary" onClick={() => copy("url", url)}>
            {icon("url")}
            {label("url", A.copyAddress)}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => copy("md", md)}>
            {icon("md")}
            {label("md", A.copyMarkdown)}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => copy("pic", picture)}>
            {icon("pic")}
            {label("pic", A.copyDark)}
          </button>
          <a className="btn btn-ghost" href={item.address} target="_blank" rel="noopener">
            <ExternalLink aria-hidden="true" />
            {A.openLive}
          </a>
        </div>
        <p className={s.previewHelp}>
          {rich(demo ? A.help : A.helpOwn, { code: (c) => <code>{c}</code>, a: (c) => <a href="/builder">{c}</a> })}
        </p>
      </div>
    </dialog>
  );
}

/** For a page of plain card links (the wiki): a link marked data-preview opens the preview instead of the card,
 * with Previous and Next through every such link on the page. Without script the links still open the card. */
export function PreviewLinks({ place }: { place: string }) {
  const [state, setState] = useState<{ items: PreviewItem[]; index: number } | null>(null);
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[data-preview]");
      if (!a) return;
      e.preventDefault();
      const links = [...document.querySelectorAll<HTMLAnchorElement>("a[data-preview]")];
      const items = links.map((l) => itemOf(l.getAttribute("href") ?? "", l.dataset.name ?? "", place, Number(l.dataset.h) || 128));
      setState({ items, index: links.indexOf(a) });
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [place]);
  if (!state) return null;
  return (
    <Preview
      items={state.items}
      index={state.index}
      onMove={(index) => setState({ ...state, index })}
      onClose={() => setState(null)}
    />
  );
}
