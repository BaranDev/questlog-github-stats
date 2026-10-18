"use client";

import { useEffect, useState } from "react";
import { THEMES, SCENES, HOST, cardName, isReady, type Widget } from "./data";
import Preview from "./Preview";
import s from "./Builder.module.css";

/** The per-card words: labels and values as key:Text lists, and a note. */
type Words = { labels: string; values: string; note: string };

type Picks = {
  user: string;
  scene: string;
  cards: Widget[];
  title: string;
  subtitle: string;
  hide: string;
  animate: boolean;
  words: Record<Widget, Words>;
  titleColor: string;
  textColor: string;
  fire: "themed" | "classic";
  time: "auto" | "day" | "night";
};

const NO_WORDS: Words = { labels: "", values: "", note: "" };
const DEFAULTS: Picks = {
  user: "BaranDev",
  scene: "forest",
  cards: ["stats", "languages", "streak"],
  title: "",
  subtitle: "",
  hide: "",
  animate: true,
  words: { stats: NO_WORDS, languages: NO_WORDS, streak: NO_WORDS },
  titleColor: "",
  textColor: "",
  fire: "themed",
  time: "day",
};
const WIDGETS: Widget[] = ["stats", "languages", "streak"];
const KEY = "questlog-builder";
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
/** Example keys for each card's labels and values fields. */
const KEYS: Record<Widget, [string, string]> = {
  stats: ["commits:Deeds,prs:Pacts", "level:Archmage"],
  languages: ["typescript:TS,python:Py", "typescript:Master"],
  streak: ["current:Now,days:suns", "current:Forever"],
};

/** Encoded like encodeURIComponent, but keeps the commas and colons of lists readable. */
function enc(v: string) {
  return encodeURIComponent(v).replace(/%2C/g, ",").replace(/%3A/g, ":");
}

/** A valid hex color without its "#", or nothing. */
function hex(v: string) {
  return HEX.test(v.trim()) ? v.trim().replace("#", "").toUpperCase() : "";
}

function query(p: Picks, w: Widget) {
  const parts = [`user=${enc(p.user.trim())}`, `scene=${enc(p.scene)}`];
  const hide = p.hide
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean)
    .join(",");
  const words = p.words[w];
  if (p.title.trim()) parts.push(`title=${enc(p.title.trim())}`);
  if (p.subtitle.trim()) parts.push(`subtitle=${enc(p.subtitle.trim())}`);
  if (words.labels.trim()) parts.push(`labels=${enc(words.labels.trim())}`);
  if (words.values.trim()) parts.push(`values=${enc(words.values.trim())}`);
  if (words.note.trim()) parts.push(`note=${enc(words.note.trim())}`);
  if (hex(p.titleColor)) parts.push(`title_color=${hex(p.titleColor)}`);
  if (hex(p.textColor)) parts.push(`text_color=${hex(p.textColor)}`);
  if (hide) parts.push(`hide=${enc(hide)}`);
  if (w === "streak" && isReady(p.scene) && p.fire === "themed") parts.push("fire=themed");
  if (!p.animate) parts.push("animate=false");
  return parts.join("&");
}

/** The short card URL: /user/card, then the scene and night as path parts when they differ from the defaults,
 * then every other option as a query. */
function cardUrl(origin: string, p: Picks, w: Widget, night: boolean) {
  const path = night ? `/${p.scene}/night` : p.scene !== "forest" ? `/${p.scene}` : "";
  const extra = query(p, w)
    .split("&")
    .filter((x) => !x.startsWith("user=") && !x.startsWith("scene="))
    .join("&");
  return `${origin}/${enc(p.user.trim())}/${w}${path}${extra ? `?${extra}` : ""}`;
}

/** One Markdown line by default; following the reader's theme needs GitHub's picture tag. */
function snippet(origin: string, p: Picks, w: Widget) {
  const alt = `${p.user.trim()}'s ${cardName(w, p.scene)}`;
  if (p.time !== "auto") return `![${alt}](${cardUrl(origin, p, w, p.time === "night")})`;
  return [
    "<picture>",
    `  <source media="(prefers-color-scheme: dark)" srcset="${cardUrl(origin, p, w, true)}">`,
    `  <img alt="${alt}" src="${cardUrl(origin, p, w, false)}">`,
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
      words: Object.fromEntries(
        WIDGETS.map((w) => {
          const x = v.words?.[w] ?? {};
          return [w, { labels: str(x.labels, ""), values: str(x.values, ""), note: str(x.note, "") }];
        }),
      ) as Record<Widget, Words>,
      titleColor: str(v.titleColor, ""),
      textColor: str(v.textColor, ""),
      fire: v.fire === "classic" ? "classic" : "themed",
      time: ["auto", "day", "night"].includes(v.time) ? v.time : "day",
    };
  } catch {
    return DEFAULTS;
  }
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
  const [origin, setOrigin] = useState(HOST);
  const [ready, setReady] = useState(false);
  const valid = LOGIN.test(picks.user.trim());

  useEffect(() => {
    const p = restore();
    setPicks(p);
    setApplied(p);
    // the snippet names this host, except on the old domain, which now points people to the new one
    setOrigin(location.hostname.endsWith("cevdetbaran.com") ? HOST : location.origin);
    setReady(true);
  }, []);

  // Typing settles for a moment before the previews redraw; every pick is remembered.
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(picks));
    } catch {
      // storage can be unavailable (private mode); picks then last for this visit
    }
    const t = window.setTimeout(() => setApplied(picks), 250);
    return () => window.clearTimeout(t);
  }, [picks]);

  const set = (patch: Partial<Picks>) => setPicks((p) => ({ ...p, ...patch }));
  const toggle = (w: Widget) =>
    set({ cards: picks.cards.includes(w) ? picks.cards.filter((c) => c !== w) : WIDGETS.filter((c) => c === w || picks.cards.includes(c)) });

  return (
    <section className="section" id="demo" aria-labelledby="demo-title">
      <div className="section-head">
        <h2 className="h2" id="demo-title">
          Make your cards
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
                      {!isReady(scene) && (
                        <span className={s.wip} title="Fire being reworked">
                          WIP
                        </span>
                      )}
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

          <details className={s.custom}>
            <summary className={s.label}>Customize</summary>
            <div className={s.customBody}>
              <p className={s.help}>
                Lists are <code>key:Text,key:Text</code>; the <a href="/wiki#options">wiki</a> lists every key. A note
                has up to two lines split by <code>|</code>.
              </p>
              {WIDGETS.map((w) => {
                const words = picks.words[w];
                const setWords = (patch: Partial<Words>) => set({ words: { ...picks.words, [w]: { ...words, ...patch } } });
                return (
                  <fieldset key={w} className={s.group}>
                    <legend className={s.label}>{cardName(w, picks.scene)}</legend>
                    <div className={s.row}>
                      <label className={s.field}>
                        <span className={s.help}>Labels</span>
                        <input value={words.labels} onChange={(e) => setWords({ labels: e.target.value })} placeholder={KEYS[w][0]} maxLength={120} />
                      </label>
                      <label className={s.field}>
                        <span className={s.help}>Values</span>
                        <input value={words.values} onChange={(e) => setWords({ values: e.target.value })} placeholder={KEYS[w][1]} maxLength={120} />
                      </label>
                    </div>
                    <label className={s.field}>
                      <span className={s.help}>Note</span>
                      <input value={words.note} onChange={(e) => setWords({ note: e.target.value })} placeholder="Open to work|DMs open" maxLength={120} />
                    </label>
                  </fieldset>
                );
              })}
              <div className={s.row}>
                {(["titleColor", "textColor"] as const).map((k) => (
                  <label key={k} className={s.field}>
                    <span className={s.label}>{k === "titleColor" ? "Title color" : "Text color"}</span>
                    <span className={s.color}>
                      <input
                        type="color"
                        value={hex(picks[k]) ? `#${hex(picks[k]).replace(/^(.)(.)(.)$/, "$1$1$2$2$3$3")}`.toLowerCase() : "#000000"}
                        onChange={(e) => set({ [k]: e.target.value.toUpperCase() })}
                        aria-label={k === "titleColor" ? "Pick the title color" : "Pick the text color"}
                      />
                      <input value={picks[k]} onChange={(e) => set({ [k]: e.target.value })} placeholder="The scene's own" maxLength={7} />
                    </span>
                    {picks[k].trim() && !hex(picks[k]) && <span className={s.error}>Use hex: RRGGBB or RGB.</span>}
                  </label>
                ))}
              </div>
            </div>
          </details>

          <div className={s.row}>
            <fieldset className={s.group}>
              <legend className={s.label}>Time</legend>
              <div className={s.chips}>
                {(["day", "night", "auto"] as const).map((t) => (
                  <label key={t} className={s.chip}>
                    <input type="radio" name="time" checked={picks.time === t} onChange={() => set({ time: t })} />
                    <span>{t === "auto" ? "Switch with dark mode" : t === "day" ? "Day" : "Night"}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className={s.group}>
              <legend className={s.label}>Fire</legend>
              <div className={s.chips}>
                {(["themed", "classic"] as const).map((f) => (
                  <label key={f} className={s.chip}>
                    <input
                      type="radio"
                      name="fire"
                      checked={(isReady(picks.scene) ? picks.fire : "classic") === f}
                      disabled={!isReady(picks.scene)}
                      onChange={() => set({ fire: f })}
                    />
                    <span>{f === "themed" ? "Themed" : "Classic"}</span>
                  </label>
                ))}
              </div>
              <span className={s.help}>
                {isReady(picks.scene) ? "Themed fits the scene; classic is the original flame." : "WIP: this scene's fire is being reworked."}
              </span>
            </fieldset>
          </div>

          <label className={s.toggle}>
            <input type="checkbox" checked={picks.animate} onChange={(e) => set({ animate: e.target.checked })} />
            <span className={s.switch} aria-hidden="true" />
            <span>Animate the flames and sparkles</span>
          </label>

          <button type="submit" className="btn btn-primary" disabled={!valid}>
            Update the snippets
          </button>
        </form>

        <div className={s.results}>
          {ready && applied.cards.length === 0 && <p className={s.empty}>Choose at least one card.</p>}
          {ready && applied.cards.map((w) => {
            const name = cardName(w, applied.scene);
            const fire = isReady(applied.scene) ? applied.fire : "classic";
            const options = { ...applied.words[w], ...applied, fire };
            const times = applied.time === "auto" ? [false, true] : [applied.time === "night"];
            return (
              <article key={w} className={s.result}>
                <header className={s.resultHead}>
                  <h3 className="display">{name}</h3>
                  <code>/{w}</code>
                </header>
                <div className={times.length > 1 ? s.pair : undefined}>
                  {times.map((night) => (
                    <figure key={`${night}`}>
                      <div className={s.shot}>
                        <Preview scene={applied.scene} widget={w} night={night} options={options} alt={`${name} preview by ${night ? "night" : "day"}`} />
                      </div>
                      <figcaption>Preview (sample data), {night ? "night" : "day"}</figcaption>
                    </figure>
                  ))}
                </div>
                <div className={s.snippet}>
                  <pre>
                    <code>{valid ? snippet(origin, applied, w) : "Type a valid GitHub login to get the snippet."}</code>
                  </pre>
                  {valid && <Copy text={snippet(origin, applied, w)} />}
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
