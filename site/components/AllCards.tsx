"use client";

import { useEffect, useRef, useState } from "react";
import { m, rich } from "@/i18n";
import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, X } from "lucide-react";
import { DECORATIONS, HOST, THEMES, card, sceneName, snap } from "./data";
import { DECORATION_GROUPS, LOOKS, address, groups, stillOf, type Group, type Look } from "./combos";
import s from "./AllCards.module.css";

const DECOS = "decorations";
const A = m.allCards;

export default function AllCards() {
  const [picked, setPicked] = useState<string | null>(null);

  // the choice lives in the address (?scene=castle), so a link opens the same scene
  useEffect(() => {
    const read = () => {
      const v = new URLSearchParams(location.search).get("scene");
      setPicked(v && (v === DECOS || THEMES.some((t) => t.scenes.includes(v))) ? v : null);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const pick = (v: string) => {
    setPicked(v);
    history.pushState(null, "", `?scene=${v}`);
    window.setTimeout(() => document.getElementById("combos")?.scrollIntoView({ block: "start" }));
  };

  return (
    <div className={s.page}>
      <header className={s.head}>
        <h1 className={s.h1}>{A.title}</h1>
        <p className="lede">{A.lede}</p>
      </header>

      <nav className={s.picker} aria-label={A.pickScene}>
        {THEMES.map((t) => (
          <fieldset key={t.name} className={s.theme}>
            <legend className={s.themeName}>{t.name}</legend>
            <div className={s.chips}>
              {t.scenes.map((sc) => (
                <button key={sc} type="button" className={s.chip} aria-pressed={picked === sc} onClick={() => pick(sc)}>
                  <img className="pix" src={snap(card("stats", sc, "&scale=1"))} width={160} height={64} alt="" loading="lazy" />
                  <span>{sceneName(sc)}</span>
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <fieldset className={s.theme}>
          <legend className={s.themeName}>{A.banners}</legend>
          <div className={s.chips}>
            <button type="button" className={s.chip} aria-pressed={picked === DECOS} onClick={() => pick(DECOS)}>
              <img
                className="pix"
                src={snap(`/decorations/${DECORATIONS[0].name}?scale=2&animate=false`)}
                width={160}
                height={64}
                alt=""
                loading="lazy"
              />
              <span>{A.decorations}</span>
            </button>
          </div>
        </fieldset>
      </nav>

      <div id="combos" className={s.combos} aria-live="polite">
        {!picked ? (
          <p className={s.empty}>{A.empty}</p>
        ) : picked === DECOS ? (
          <Combos title={A.decorations} list={DECORATION_GROUPS} />
        ) : (
          <Combos title={sceneName(picked)} list={groups(picked)} />
        )}
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className={s.cols} aria-hidden="true">
      {LOOKS.map((l) => (
        <span key={l.label}>{l.label}</span>
      ))}
    </div>
  );
}

/** One card on the page, as the preview needs it. */
type Item = { address: string; name: string; look: Look; h: number; night: string; day: string };

/** A scene (or the decorations): a jump list, then one block per kind of card, one row per variant, one column per look. */
function Combos({ title, list }: { title: string; list: Group[] }) {
  const count = list.reduce((n, g) => n + g.rows.length, 0) * LOOKS.length;
  const items: Item[] = list.flatMap((g) =>
    g.rows.flatMap((r) =>
      LOOKS.map((l) => ({
        address: address(r, l),
        name: r.name,
        look: l,
        h: r.h,
        day: address(r, { ...l, time: "day" } as Look),
        night: address(r, { ...l, time: "night" } as Look),
      })),
    ),
  );
  const [open, setOpen] = useState<number | null>(null);
  const id = (g: Group) => `group-${g.title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby="scene-title">
      <h2 id="scene-title" className={s.h2}>
        {title}
      </h2>
      <p className={s.count}>
        {A.count(count)}{" "}
        {list.length > 1 && (
          <>
            {A.jumpTo}{" "}
            {list.map((g, i) => (
              <span key={g.title}>
                <a href={`#${id(g)}`}>{g.title}</a>
                {i < list.length - 2 ? A.jumpSep : i === list.length - 2 ? A.jumpOr : A.jumpEnd}
              </span>
            ))}
          </>
        )}
      </p>
      {list.map((g) => (
        <div key={g.title} id={id(g)} className={s.group}>
          <h3 className={s.groupName}>{g.title}</h3>
          {g.note && <p className={s.note}>{g.note}</p>}
          <Header />
          {g.rows.map((r) => (
            <div key={r.name} className={s.row}>
              <h4 className={s.rowName}>{r.name}</h4>
              <div className={s.grid}>
                {LOOKS.map((l) => (
                  <Tile
                    key={l.label}
                    address={address(r, l)}
                    look={l}
                    alt={A.tileAlt(r.name, title, l.label)}
                    h={r.h}
                    onOpen={() => setOpen(items.findIndex((it) => it.address === address(r, l)))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
      {open !== null && items[open] && (
        <Preview item={items[open]} place={title} index={open} count={items.length} onMove={setOpen} onClose={() => setOpen(null)} />
      )}
    </section>
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

/** The card big and live (animated), with what you can do with it, and Previous and Next through the page's cards. */
function Preview({ item, place, index, count, onMove, onClose }: {
  item: Item;
  place: string;
  index: number;
  count: number;
  onMove: (i: number) => void;
  onClose: () => void;
}) {
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
            <p className={s.previewSub}>
              {A.previewSub(place, item.look.label, index + 1, count)}
            </p>
          </div>
          <button type="button" className={s.previewClose} onClick={onClose} aria-label={A.close}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className={s.previewStage}>
          <button
            type="button"
            className={s.previewArrow}
            onClick={() => onMove(index - 1)}
            disabled={index === 0}
            aria-label={A.previous}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <img key={item.address} className="pix" src={`${item.address}&scale=4`} width={1280} height={item.h * 4} alt={A.liveAlt(item.name, item.look.label)} />
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
          {rich(A.help, { code: (c) => <code>{c}</code>, a: (c) => <a href="/builder">{c}</a> })}
        </p>
      </div>
    </dialog>
  );
}

/** One card: its still, a link to the live card, and a button that copies its address. */
function Tile({ address, look, alt, h, onOpen }: { address: string; look: Look; alt: string; h: number; onOpen: () => void }) {
  const [copied, setCopied] = useState<"" | "yes" | "no">("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(HOST + address);
      setCopied("yes");
    } catch {
      setCopied("no");
    }
    window.setTimeout(() => setCopied(""), 2200);
  };
  return (
    <figure className={s.tile}>
      <button type="button" className={s.shot} onClick={onOpen} aria-label={A.previewLabel(alt)}>
        <img className="pix" src={snap(stillOf(address))} width={640} height={h * 2} alt="" loading="lazy" />
      </button>
      <figcaption className={s.cap}>
        <span className={s.look}>{look.label}</span>
        <button type="button" className={s.copy} onClick={copy} aria-live="polite">
          {copied === "yes" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied === "yes" ? A.copied : copied === "no" ? A.copyFailed : A.copyAddress}
        </button>
      </figcaption>
    </figure>
  );
}
