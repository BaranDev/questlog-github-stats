"use client";

import { useEffect, useRef, useState } from "react";
import { m } from "@/i18n";
import { Check, Copy } from "lucide-react";
import Preview, { PreviewHint, itemOf } from "./Preview";
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

/** A scene (or the decorations): a jump list, then one block per kind of card, one row per variant, one column per look. */
function Combos({ title, list }: { title: string; list: Group[] }) {
  const count = list.reduce((n, g) => n + g.rows.length, 0) * LOOKS.length;
  const items = list.flatMap((g) => g.rows.flatMap((r) => LOOKS.map((l) => itemOf(address(r, l), r.name, title, r.h))));
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
        <Preview items={items} index={open} onMove={setOpen} onClose={() => setOpen(null)} demo />
      )}
    </section>
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
        <PreviewHint />
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
