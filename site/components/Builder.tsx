"use client";

import { useEffect, useState } from "react";
import { THEMES, SCENES, cardName, type Widget } from "./data";
import s from "./Builder.module.css";

type Picks = {
  user: string;
  scene: string;
  cards: Widget[];
  title: string;
  subtitle: string;
  hide: string;
  animate: boolean;
};

const DEFAULTS: Picks = {
  user: "BaranDev",
  scene: "forest",
  cards: ["stats", "languages", "streak"],
  title: "",
  subtitle: "",
  hide: "",
  animate: true,
};
const WIDGETS: Widget[] = ["stats", "languages", "streak"];
const KEY = "questlog-builder";
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/** Encoded like encodeURIComponent, but keeps the commas and colons of lists readable. */
function enc(v: string) {
  return encodeURIComponent(v).replace(/%2C/g, ",").replace(/%3A/g, ":");
}

function query(p: Picks) {
  const parts = [`user=${enc(p.user.trim())}`, `scene=${enc(p.scene)}`];
  const hide = p.hide
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean)
    .join(",");
  if (p.title.trim()) parts.push(`title=${enc(p.title.trim())}`);
  if (p.subtitle.trim()) parts.push(`subtitle=${enc(p.subtitle.trim())}`);
  if (hide) parts.push(`hide=${enc(hide)}`);
  if (!p.animate) parts.push("animate=false");
  return parts.join("&");
}

function snippet(origin: string, p: Picks, w: Widget) {
  const url = `${origin}/${w}?${query(p)}`;
  return [
    "<picture>",
    `  <source media="(prefers-color-scheme: dark)" srcset="${url}&time=night">`,
    `  <img alt="${p.user.trim()}'s ${cardName(w, p.scene)}" src="${url}">`,
    "</picture>",
  ].join("\n");
}

/** Reads the stored picks, keeping only well-formed values. */
function restore(): Picks {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!v || typeof v !== "object") return DEFAULTS;
    const str = (x: unknown, d: string) => (typeof x === "string" ? x.slice(0, 120) : d);
    return {
      user: str(v.user, DEFAULTS.user),
      scene: SCENES.includes(v.scene) ? v.scene : DEFAULTS.scene,
      cards: Array.isArray(v.cards) ? WIDGETS.filter((w) => v.cards.includes(w)) : DEFAULTS.cards,
      title: str(v.title, ""),
      subtitle: str(v.subtitle, ""),
      hide: str(v.hide, ""),
      animate: typeof v.animate === "boolean" ? v.animate : true,
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * A card fetched as a blob. While the server answers with the "inking" placeholder (header x-questlog), it shows
 * that card and asks again every 5 s.
 */
function Live({ url, alt }: { url: string; alt: string }) {
  const [src, setSrc] = useState<string>();
  const [inking, setInking] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    let shown: string | undefined;
    let tries = 0;
    const load = async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        const blob = await res.blob();
        if (!alive) return;
        const next = URL.createObjectURL(blob);
        if (shown) URL.revokeObjectURL(shown);
        shown = next;
        setSrc(next);
        const wait = res.headers.get("x-questlog") === "placeholder";
        setInking(wait);
        if (wait && ++tries < 120) timer = window.setTimeout(load, 5000);
      } catch {
        if (alive) setInking(false);
      }
    };
    load();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      if (shown) URL.revokeObjectURL(shown);
    };
  }, [url]);

  return (
    <>
      <div className={s.shot}>{src && <img className="pix" src={src} width={640} height={256} alt={alt} />}</div>
      {inking && <p className={s.inking}>The scribe is inking this card. Trying again every 5 s.</p>}
    </>
  );
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.append(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    window.setTimeout(() => setDone(false), 1600);
  };
  return (
    <button type="button" className={`btn btn-primary ${s.copy}`} onClick={copy}>
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export default function Builder() {
  const [picks, setPicks] = useState<Picks>(DEFAULTS);
  const [applied, setApplied] = useState<Picks>(DEFAULTS);
  const [origin, setOrigin] = useState("https://questlog.cevdetbaran.com");
  const [ready, setReady] = useState(false);
  const valid = LOGIN.test(picks.user.trim());

  useEffect(() => {
    const p = restore();
    setPicks(p);
    setApplied(p);
    setOrigin(location.origin);
    setReady(true);
  }, []);

  // Typing settles for a moment before the previews reload; every pick is remembered.
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(picks));
    } catch {
      // storage can be unavailable (private mode); picks then last for this visit
    }
    if (!LOGIN.test(picks.user.trim())) return;
    const t = window.setTimeout(() => setApplied(picks), 700);
    return () => window.clearTimeout(t);
  }, [picks]);

  const set = (patch: Partial<Picks>) => setPicks((p) => ({ ...p, ...patch }));
  const toggle = (w: Widget) =>
    set({ cards: picks.cards.includes(w) ? picks.cards.filter((c) => c !== w) : WIDGETS.filter((c) => c === w || picks.cards.includes(c)) });

  return (
    <section className="section" id="demo" aria-labelledby="demo-title">
      <div className="section-head">
        <h2 className="h2" id="demo-title">
          Make your cards.
        </h2>
        <p className="lede">Type your GitHub login, choose a scene, then copy a snippet into your profile README.</p>
      </div>

      <div className={s.builder}>
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) setApplied(picks);
          }}
        >
          <label className={s.field}>
            <span className={s.label}>GitHub login</span>
            <span className={s.login}>
              <span aria-hidden="true">github.com/</span>
              <input
                value={picks.user}
                onChange={(e) => set({ user: e.target.value })}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={39}
                required
                aria-invalid={!valid}
                aria-describedby="login-help"
              />
            </span>
            <span id="login-help" className={valid ? s.help : s.error}>
              {valid ? "Any public GitHub account." : "Letters, digits and hyphens only, up to 39."}
            </span>
          </label>

          <fieldset className={s.group}>
            <legend className={s.label}>Scene</legend>
            {THEMES.map((t) => (
              <div key={t.name} className={s.theme}>
                <p className={s.themeName}>{t.name}</p>
                <div className={s.swatches}>
                  {t.scenes.map((scene) => (
                    <label key={scene} className={s.swatch} title={scene}>
                      <input
                        type="radio"
                        name="scene"
                        value={scene}
                        checked={picks.scene === scene}
                        onChange={() => set({ scene })}
                      />
                      <span className={`${s.paint} pix`} style={{ backgroundImage: `url(/art/${scene}/stats.png)` }} />
                      <span className={s.sceneName}>{scene}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>

          <fieldset className={s.group}>
            <legend className={s.label}>Cards</legend>
            <div className={s.chips}>
              {WIDGETS.map((w) => (
                <label key={w} className={s.chip}>
                  <input type="checkbox" checked={picks.cards.includes(w)} onChange={() => toggle(w)} />
                  <span>{cardName(w, picks.scene)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className={s.row}>
            <label className={s.field}>
              <span className={s.label}>Title</span>
              <input value={picks.title} onChange={(e) => set({ title: e.target.value })} placeholder="The scene's own" maxLength={60} />
            </label>
            <label className={s.field}>
              <span className={s.label}>Subtitle</span>
              <input value={picks.subtitle} onChange={(e) => set({ subtitle: e.target.value })} placeholder="Your class" maxLength={60} />
            </label>
          </div>

          <label className={s.field}>
            <span className={s.label}>Hide</span>
            <input value={picks.hide} onChange={(e) => set({ hide: e.target.value })} placeholder="prs,stars or html,css" maxLength={120} />
          </label>

          <label className={s.toggle}>
            <input type="checkbox" checked={picks.animate} onChange={(e) => set({ animate: e.target.checked })} />
            <span className={s.switch} aria-hidden="true" />
            <span>Animate the flames and sparkles</span>
          </label>

          <button type="submit" className="btn btn-primary" disabled={!valid}>
            Paint my cards
          </button>
        </form>

        <div className={s.results}>
          {ready && applied.cards.length === 0 && <p className={s.empty}>Choose at least one card.</p>}
          {ready && applied.cards.map((w) => {
            const q = `/${w}?${query(applied)}&scale=2`;
            const name = cardName(w, applied.scene);
            return (
              <article key={w} className={s.result}>
                <header className={s.resultHead}>
                  <h3 className="display">{name}</h3>
                  <code>/{w}</code>
                </header>
                <div className={s.pair}>
                  <figure>
                    <Live url={q} alt={`${applied.user}'s ${name} by day`} />
                    <figcaption>Day</figcaption>
                  </figure>
                  <figure>
                    <Live url={`${q}&time=night`} alt={`${applied.user}'s ${name} by night`} />
                    <figcaption>Night</figcaption>
                  </figure>
                </div>
                <div className={s.snippet}>
                  <pre>
                    <code>{snippet(origin, applied, w)}</code>
                  </pre>
                  <Copy text={snippet(origin, applied, w)} />
                </div>
              </article>
            );
          })}
        </div>
      </div>
      <noscript>
        <p className={s.empty}>
          The builder needs JavaScript. The <a href="/wiki#getting-started">wiki</a> shows how to write the snippet by hand.
        </p>
      </noscript>
    </section>
  );
}
