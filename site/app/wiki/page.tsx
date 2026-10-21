import type { Metadata } from "next";
import type { ReactNode } from "react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Rune from "@/components/Rune";
import { PreviewHint, PreviewLinks } from "@/components/Preview";
import { RUNES, THEMES, REPO, HOST, card, cardName, DECORATIONS, sceneName, snap, type Widget } from "@/components/data";
import { m, rich, type Tags } from "@/i18n";
import w from "./wiki.module.css";

export const metadata: Metadata = {
  title: m.wiki.meta.title,
  description: m.wiki.meta.description,
  alternates: { canonical: "/wiki" },
  openGraph: { url: "/wiki", title: m.wiki.meta.ogTitle, description: m.wiki.meta.ogDescription },
};

const TOC = [
  ["getting-started", m.wiki.toc.gettingStarted],
  ["cards", m.wiki.toc.cards],
  ["fire", m.wiki.toc.fire],
  ["runes", m.wiki.toc.runes],
  ["scenes", m.wiki.toc.scenes],
  ["decorations", m.wiki.toc.decorations],
  ["options", m.wiki.toc.options],
  ["messages", m.wiki.toc.messages],
  ["limits", m.wiki.toc.limits],
  ["self-hosting", m.wiki.toc.selfHosting],
  ["faq", m.wiki.toc.faq],
];

const WIDGETS: Widget[] = ["stats", "languages", "streak"];


/** A live card that links to its full size; with `dark`, readers in dark mode see that address instead. */
function Shot({ src, alt, scale = 2, h = 128, dark }: { src: string; alt: string; scale?: number; h?: number; dark?: string }) {
  const img = <img className="pix" src={snap(`${src}&scale=${scale}`)} width={320 * scale} height={h * scale} alt={alt} loading="lazy" />;
  return (
    <a className={w.shot} href={src} data-preview="" data-name={alt} data-h={h}>
      {dark ? (
        <picture>
          <source media="(prefers-color-scheme: dark)" srcSet={snap(`${dark}&scale=${scale}`)} />
          {img}
        </picture>
      ) : (
        img
      )}
      <PreviewHint />
    </a>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className={w.code}>
      <code>{children}</code>
    </pre>
  );
}

const SNIPPET = `![My Character Sheet](${HOST}/you/stats/forest)`;
const PICTURE = `<picture>
  <source media="(prefers-color-scheme: dark)" srcset="${HOST}/you/stats/forest/night">
  <img alt="My Character Sheet" src="${HOST}/you/stats/forest">
</picture>`;
const DECO_PICTURE = `<picture>
  <source media="(prefers-color-scheme: dark)" srcset="${HOST}/decorations/raven-moon?title=Connect&time=night">
  <img alt="Connect" src="${HOST}/decorations/raven-moon?title=Connect">
</picture>`;

const STATS_KEYS = ["level", "commits", "prs", "repos", "stars", "issues", "reviews", "followers", "contributions"] as const;
const STATS_ROWS = STATS_KEYS.map((key) => [m.wiki.cards.statsRows[key].row, key, m.wiki.cards.statsRows[key].text]);

const CLASSES = m.wiki.cards.classRows.map(({ lang, cls }) => [lang, cls]);

const LEVELS = [2, 3, 4, 5, 10, 15, 20, 30, 50];

const FIRES = [
  [0, m.wiki.fire.ashes.name, m.wiki.fire.ashes.range],
  [4, m.wiki.fire.small.name, m.wiki.fire.small.range],
  [12, m.wiki.fire.steady.name, m.wiki.fire.steady.range],
  [45, m.wiki.fire.bonfire.name, m.wiki.fire.bonfire.range],
] as const;

const OPTIONS = [
  ["user", m.wiki.options.rows.user.values, m.wiki.options.rows.user.default],
  ["scene", m.wiki.options.rows.scene.values, "forest"],
  ["time", "day, night", "day"],
  ["pixels", m.wiki.options.rows.pixels.values, "fine"],
  ["title", m.wiki.options.rows.title.values, m.wiki.options.rows.title.default],
  ["subtitle", m.wiki.options.rows.subtitle.values, m.wiki.options.rows.subtitle.default],
  ["labels", m.wiki.options.rows.labels.values, m.wiki.options.rows.labels.default],
  ["values", m.wiki.options.rows.valuesKey.values, m.wiki.options.rows.valuesKey.default],
  ["note", m.wiki.options.rows.note.values, m.wiki.options.rows.note.default],
  ["title_color", m.wiki.options.rows.titleColor.values, m.wiki.options.rows.titleColor.default],
  ["text_color", m.wiki.options.rows.textColor.values, m.wiki.options.rows.textColor.default],
  ["outline_color", m.wiki.options.rows.outlineColor.values, m.wiki.options.rows.outlineColor.default],
  ["fire", m.wiki.options.rows.fire.values, "classic"],
  ["langs", m.wiki.options.rows.langs.values, "5"],
  ["hide", m.wiki.options.rows.hide.values, m.wiki.options.rows.hide.default],
  ["truncate", m.wiki.options.rows.truncate.values, "true"],
  ["animate", "true, false", "true"],
  ["scale", m.wiki.options.rows.scale.values, "5"],
];

const EXAMPLES: [string, Widget, string, string][] = [
  ["title=My Journey", "stats", "&title=My%20Journey", m.wiki.options.examples.title],
  ["subtitle=Full Stack Developer", "stats", "&subtitle=Full%20Stack%20Developer", m.wiki.options.examples.subtitle],
  ["labels=commits:Deeds,prs:Pacts", "stats", "&labels=commits:Deeds,prs:Pacts", m.wiki.options.examples.labels],
  ["hide=prs,stars", "stats", "&hide=prs,stars", m.wiki.options.examples.hide],
  ["hide=html,css", "languages", "&hide=html,css", m.wiki.options.examples.hideLangs],
  ["animate=false", "streak", "&animate=false", m.wiki.options.examples.animate],
  ["pixels=chunky", "stats", "&pixels=chunky", m.wiki.options.examples.pixels],
  ["labels=typescript:TS,python:Py", "languages", "&labels=typescript:TS,python:Py", m.wiki.options.examples.labelsLangs],
  ["values=level:Archmage,commits:Lots", "stats", "&values=level:Archmage,commits:Lots", m.wiki.options.examples.values],
  ["values=current:Forever", "streak", "&values=current:Forever", m.wiki.options.examples.valuesStreak],
  ["note=Open to work|DMs open", "stats", "&note=Open%20to%20work|DMs%20open", m.wiki.options.examples.note],
  ["title_color=FF6B35", "streak", "&title_color=FF6B35", m.wiki.options.examples.titleColor],
  ["text_color=7A1F1F", "stats", "&text_color=7A1F1F", m.wiki.options.examples.textColor],
  ["outline_color=3B1F5C", "streak", "&outline_color=3B1F5C", m.wiki.options.examples.outlineColor],
];

const MESSAGES = (["placeholder", "quota", "unknown", "busy", "failed", "error"] as const).map((kind) => [kind, m.wiki.messages[kind]]);

const FAQ = m.wiki.faq.items.map(({ q, a }) => [q, a]);

/** The tags the wiki texts use for inline markup. */
const TAGS: Tags = {
  code: (c?: ReactNode) => <code>{c}</code>,
  strong: (c?: ReactNode) => <strong>{c}</strong>,
  em: (c?: ReactNode) => <em>{c}</em>,
  builder: (c?: ReactNode) => <a href="/builder">{c}</a>,
};

export default function Wiki() {
  return (
    <>
      <a className="skip" href="#doc">
        {m.wiki.skip}
      </a>
      <Nav />
      <main style={{ overflowX: "clip" }}>
        <header className={w.header}>
          <h1 className={w.h1}>{m.wiki.title}</h1>
          <p className="lede">{m.wiki.lede}</p>
        </header>

        <div className={w.layout}>
          <nav className={w.toc} aria-label={m.wiki.onThisPage}>
            <p className={w.tocTitle}>{m.wiki.onThisPage}</p>
            <ol>
              {TOC.map(([id, name]) => (
                <li key={id}>
                  <a href={`#${id}`}>{name}</a>
                </li>
              ))}
            </ol>
          </nav>

          <div className={w.doc} id="doc">
            <section id="getting-started" className={w.section}>
              <h2>{m.wiki.gettingStarted.title}</h2>
              <p>{rich(m.wiki.gettingStarted.paste, TAGS)}</p>
              <Code>{SNIPPET}</Code>
              <p>{rich(m.wiki.gettingStarted.address, TAGS)}</p>
              <h3>{m.wiki.gettingStarted.nightTitle}</h3>
              <p>{rich(m.wiki.gettingStarted.night, TAGS)}</p>
              <Code>{PICTURE}</Code>
              <div className={w.pair}>
                <figure>
                  <Shot src={card("stats", "forest", "&time=day")} alt={m.wiki.gettingStarted.dayAlt} />
                  <figcaption>{m.wiki.lightTheme}</figcaption>
                </figure>
                <figure>
                  <Shot src={card("stats", "forest", "&time=night")} alt={m.wiki.gettingStarted.nightAlt} />
                  <figcaption>{m.wiki.darkTheme}</figcaption>
                </figure>
              </div>
              <p className={w.note}>
                {rich(m.wiki.gettingStarted.note, {
                  ...TAGS,
                  md: () => <code>![My stats]({HOST}/stats?user=you)</code>,
                  decorations: (c) => <a href="#decorations">{c}</a>,
                })}
              </p>
            </section>

            <section id="cards" className={w.section}>
              <h2>{m.wiki.cards.title}</h2>
              <h3>{m.wiki.cards.sheetTitle}</h3>
              <Shot src={card("stats", "castle")} alt={m.wiki.cards.sheetAlt} />
              <table className={w.table}>
                <thead>
                  <tr>
                    <th>{m.wiki.cards.rowAndKey}</th>
                    <th>{m.wiki.cards.whatItCounts}</th>
                  </tr>
                </thead>
                <tbody>
                  {STATS_ROWS.map(([row, key, text]) => (
                    <tr key={key}>
                      <td className={w.rowKey}>
                        {row}
                        <code>{key}</code>
                      </td>
                      <td>{text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3>{m.wiki.cards.levelsTitle}</h3>
              <p>{rich(m.wiki.cards.levels, TAGS)}</p>
              <div className={w.levels}>
                {LEVELS.map((l) => (
                  <div key={l}>
                    <span>{m.wiki.cards.levelLabel(l)}</span>
                    <strong>{(25 * (l - 1) * l).toLocaleString("en-US")}</strong>
                  </div>
                ))}
              </div>

              <h3>{m.wiki.cards.classesTitle}</h3>
              <p>{m.wiki.cards.classes}</p>
              <table className={`${w.table} ${w.compact}`}>
                <thead>
                  <tr>
                    <th>{m.wiki.cards.topLanguage}</th>
                    <th>{m.wiki.cards.classHeader}</th>
                  </tr>
                </thead>
                <tbody>
                  {CLASSES.map(([lang, cls]) => (
                    <tr key={cls}>
                      <td>{lang}</td>
                      <td className={w.gold}>{cls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3>{m.wiki.cards.spellbookTitle}</h3>
              <Shot src={card("languages", "fairy-garden")} alt={m.wiki.cards.spellbookAlt} />
              <p>{m.wiki.cards.spellbook}</p>

              <h3>{m.wiki.cards.fireTitle}</h3>
              <Shot src={card("streak", "forest")} alt={m.wiki.cards.fireAlt} />
              <ul className={w.list}>
                <li>{rich(m.wiki.cards.fireCurrent, TAGS)}</li>
                <li>{rich(m.wiki.cards.fireBest, TAGS)}</li>
                <li>{rich(m.wiki.cards.fireTotal, TAGS)}</li>
                <li>{m.wiki.cards.fireNames}</li>
              </ul>
            </section>

            <section id="fire" className={w.section}>
              <h2>{m.wiki.fire.title}</h2>
              <p>{m.wiki.fire.intro}</p>
              <div className={w.grid2}>
                {FIRES.map(([n, name, range]) => (
                  <figure key={n}>
                    <Shot src={`/demo/streak?streak=${n}&scene=castle`} alt={m.wiki.fire.alt(name, n)} />
                    <figcaption>
                      <strong>{name}</strong> {range}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>

            <section id="runes" className={w.section}>
              <h2>{m.wiki.runes.title}</h2>
              <p>{m.wiki.runes.intro}</p>
              <ul className={w.runes}>
                {RUNES.map((r) => (
                  <li key={r.lang}>
                    <Rune rune={r} size={5} />
                    <span>{r.lang}</span>
                    <small>{r.rune}</small>
                  </li>
                ))}
              </ul>
            </section>

            <section id="scenes" className={w.section}>
              <h2>{m.wiki.scenes.title}</h2>
              <p>{m.wiki.scenes.intro}</p>
              {THEMES.map((t) => (
                <div key={t.name} className={w.theme}>
                  <h3>{t.name}</h3>
                  {t.scenes.map((scene) => (
                    <div key={scene} id={`scene-${scene}`} className={w.scene}>
                      <h4>
                        <code>scene={scene}</code>
                        <span>{m.wiki.scenes.cardsLabel(cardName("streak", scene))}</span>
                      </h4>
                      <div className={w.variations}>
                        {WIDGETS.map((wd) =>
                          (["day", "night"] as const).map((time) => (
                            <Shot
                              key={wd + time}
                              src={card(wd, scene, `&time=${time}${wd === "streak" ? "&fire=themed" : ""}`)}
                              alt={m.wiki.scenes.alt(cardName(wd, scene), sceneName(scene), time)}
                            />
                          )),
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </section>

            <section id="decorations" className={w.section}>
              <h2>{m.wiki.decorations.title}</h2>
              <p>{rich(m.wiki.decorations.intro, TAGS)}</p>
              <Code>{`![About Me](${HOST}/decorations/reading-nook?title=About%20Me)`}</Code>
              <p>{rich(m.wiki.decorations.options, TAGS)}</p>
              <Code>{DECO_PICTURE}</Code>
              <div className={w.pair}>
                <figure>
                  <Shot src="/decorations/raven-moon?title=Connect" alt={m.wiki.decorations.ravenDayAlt} />
                  <figcaption>{m.wiki.lightTheme}</figcaption>
                </figure>
                <figure>
                  <Shot src="/decorations/raven-moon?title=Connect&time=night" alt={m.wiki.decorations.ravenNightAlt} />
                  <figcaption>{m.wiki.darkTheme}</figcaption>
                </figure>
              </div>
              <div className={w.grid2}>
                {DECORATIONS.map(({ name, label, title, h }) => (
                  <figure key={name}>
                    <Shot
                      src={`/decorations/${name}?title=${encodeURIComponent(title)}`}
                      dark={`/decorations/${name}?title=${encodeURIComponent(title)}&time=night`}
                      alt={m.wiki.decorations.alt(label, title)}
                      h={h}
                    />
                    <figcaption>
                      <code>/decorations/{name}</code> {m.wiki.decorations.caption(title)}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>

            <section id="options" className={w.section}>
              <h2>{m.wiki.options.title}</h2>
              <p>{rich(m.wiki.options.intro, TAGS)}</p>
              <table className={w.table}>
                <thead>
                  <tr>
                    <th>{m.wiki.options.parameter}</th>
                    <th>{m.wiki.options.values}</th>
                    <th>{m.wiki.options.default}</th>
                  </tr>
                </thead>
                <tbody>
                  {OPTIONS.map(([k, v, d]) => (
                    <tr key={k}>
                      <td>
                        <code>{k}</code>
                      </td>
                      <td>{v}</td>
                      <td>{d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={w.note}>{rich(m.wiki.options.note, TAGS)}</p>
              <div className={w.examples}>
                {EXAMPLES.map(([label, wd, extra, text]) => (
                  <figure key={label} className={w.example}>
                    <figcaption>
                      <code>{label}</code>
                      <span>{text}</span>
                      <small>{`/${wd}?user=BaranDev${extra}`.replace(/%20/g, " ")}</small>
                    </figcaption>
                    <Shot src={`/${wd}?user=BaranDev${extra}`} alt={m.wiki.options.exampleAlt(cardName(wd, "forest"), label)} />
                  </figure>
                ))}
                <figure className={w.example}>
                  <figcaption>
                    <code>scale=1</code>
                    <span>{m.wiki.options.examples.scale}</span>
                    <small>/stats?user=BaranDev&amp;scale=1</small>
                  </figcaption>
                  <Shot src="/stats?user=BaranDev" alt={m.wiki.options.scaleAlt} scale={1} />
                </figure>
              </div>
            </section>

            <section id="messages" className={w.section}>
              <h2>{m.wiki.messages.title}</h2>
              <p>{m.wiki.messages.intro}</p>
              <div className={w.messages}>
                {MESSAGES.map(([kind, text]) => (
                  <figure key={kind}>
                    <Shot src={`/demo/message?kind=${kind}`} alt={m.wiki.messages.alt(kind)} />
                    <figcaption>
                      <code>{kind}</code>
                      <span>{text}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>

            <section id="limits" className={w.section}>
              <h2>{m.wiki.limits.title}</h2>
              <ul className={w.list}>
                <li>{rich(m.wiki.limits.every12, TAGS)}</li>
                <li>{rich(m.wiki.limits.scribe, TAGS)}</li>
                <li>{rich(m.wiki.limits.hourly, TAGS)}</li>
                <li>{rich(m.wiki.limits.private, TAGS)}</li>
              </ul>
            </section>

            <section id="self-hosting" className={w.section}>
              <h2>{m.wiki.selfHosting.title}</h2>
              <p>{m.wiki.selfHosting.intro}</p>
              <Code>{`git clone ${REPO}
cd questlog-github-stats
docker build -t questlog .
docker run -d -p 8080:8080 --env-file .env -v questlog-data:/data questlog`}</Code>
              <p>{rich(m.wiki.selfHosting.env, TAGS)}</p>
              <Code>{`GITHUB_TOKEN=github_pat_...`}</Code>
              <p className={w.note}>{rich(m.wiki.selfHosting.note, TAGS)}</p>
            </section>

            <section id="faq" className={w.section}>
              <h2>{m.wiki.faq.title}</h2>
              <div className={w.faq}>
                {FAQ.map(([q, a]) => (
                  <details key={q}>
                    <summary>{q}</summary>
                    <p>{a}</p>
                  </details>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
      <PreviewLinks place={m.allCards.wikiPlace} />
      <Footer />
    </>
  );
}
