import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Rune from "@/components/Rune";
import { RUNES, THEMES, REPO, HOST, card, cardName, isReady, type Widget } from "@/components/data";
import w from "./wiki.module.css";

export const metadata: Metadata = {
  title: "questlog wiki: every card, option and scene",
  description: "How questlog works: the snippet, what every number means, fire tiers, runes, all sixteen scenes, every option and the messages.",
  alternates: { canonical: "/wiki" },
  openGraph: { url: "/wiki", title: "questlog wiki", description: "Every card, option and scene of questlog." },
};

const TOC = [
  ["getting-started", "Getting started"],
  ["cards", "The three cards"],
  ["fire", "Fire tiers"],
  ["runes", "Runes"],
  ["scenes", "Every scene"],
  ["options", "Options"],
  ["messages", "What the messages mean"],
  ["limits", "Caching and limits"],
  ["self-hosting", "Self-hosting"],
  ["faq", "FAQ"],
];

const WIDGETS: Widget[] = ["stats", "languages", "streak"];

function Shot({ src, alt, scale = 2 }: { src: string; alt: string; scale?: number }) {
  return (
    <a className={w.shot} href={src}>
      <img className="pix" src={`${src}&scale=${scale}`} width={320 * scale} height={128 * scale} alt={alt} loading="lazy" />
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

const STATS_ROWS = [
  ["Level", "level", "From your lifetime contributions. The bar under it fills toward the next level."],
  ["Commits", "commits", "Commit contributions over every year of your calendar."],
  ["PRs", "prs", "Pull requests you have opened."],
  ["Repos", "repos", "Public repositories you own, forks left out."],
  ["Stars", "stars", "Stars on those repositories, added up."],
  ["Issues", "issues", "Issues you have opened."],
  ["Reviews", "reviews", "Pull request reviews over every year."],
  ["Followers", "followers", "People following you on GitHub."],
  ["Contributions", "contributions", "Every contribution in your calendar, all years together."],
];

const CLASSES = [
  ["TypeScript, JavaScript", "Artificer"],
  ["Python", "Alchemist"],
  ["Rust", "Blacksmith"],
  ["Go", "Ranger"],
  ["C#", "Paladin"],
  ["Java, Kotlin", "Knight"],
  ["C, C++", "Warlock"],
  ["HTML, CSS", "Bard"],
  ["Shell, PowerShell", "Rogue"],
  ["Anything else", "Adventurer"],
];

const LEVELS = [2, 3, 4, 5, 10, 15, 20, 30, 50];

const FIRES = [
  [0, "Ashes", "0 days: smoking ashes"],
  [4, "Small", "1 to 6 days"],
  [12, "Steady", "7 to 29 days"],
  [45, "Bonfire", "30 days and more"],
] as const;

const OPTIONS = [
  ["user", "your GitHub login", "required"],
  ["scene", "any of the sixteen scenes", "forest"],
  ["time", "day, night", "day"],
  ["title", "any text, up to 60 characters", "the scene's title"],
  ["subtitle", "any text, up to 60 characters", "on /stats, your class; none on the others"],
  ["labels", "key:Text,key:Text, keys below", "the scene's labels"],
  ["values", "key:Text,key:Text, keys below: drawn in place of the number", "your numbers"],
  ["note", "up to two lines split by |", "none"],
  ["title_color", "hex RRGGBB or RGB, # optional (as %23)", "the scene's ink"],
  ["text_color", "hex, as above: every other text", "the scene's ink"],
  ["outline_color", "hex, as above: the dark edge around outlined text", "the scene's ink"],
  ["fire", "classic, themed: on /streak, themed draws the scene's own fire colors", "classic"],
  ["langs", "3, 5: how many languages /languages lists", "5"],
  ["hide", "a comma list of keys, or of languages on /languages", "nothing hidden"],
  ["truncate", "true, false: false draws a long subtitle whole instead of trimming it (it may run past the page)", "true"],
  ["animate", "true, false", "true"],
  ["scale", "1 to 5: the image is 320 x 128 times this", "5"],
];

const EXAMPLES: [string, Widget, string, string][] = [
  ["title=My Journey", "stats", "&title=My%20Journey", "Replaces the card's title."],
  ["subtitle=Full Stack Developer", "stats", "&subtitle=Full%20Stack%20Developer", "Replaces the class beside the title."],
  ["labels=commits:Deeds,prs:Pacts", "stats", "&labels=commits:Deeds,prs:Pacts", "Renames rows. Keys are listed above."],
  ["hide=prs,stars", "stats", "&hide=prs,stars", "Leaves rows out; the others move up."],
  ["hide=html,css", "languages", "&hide=html,css", "On the Spellbook, hide takes language names; the next language takes the place."],
  ["animate=false", "streak", "&animate=false", "A still image: no flicker and no sparkles, and a smaller file."],
  ["labels=typescript:TS,python:Py", "languages", "&labels=typescript:TS,python:Py", "On the Spellbook, labels take language names too, plus percent."],
  ["values=level:Archmage,commits:Lots", "stats", "&values=level:Archmage,commits:Lots", "Draws your text in place of a number. The XP bar still follows your real level."],
  ["values=current:Forever", "streak", "&values=current:Forever", "The fire and the notches still follow your real streak."],
  ["note=Open to work|DMs open", "stats", "&note=Open%20to%20work|DMs%20open", "Up to two free lines where the card has room. Hiding rows makes more."],
  ["title_color=FF6B35", "streak", "&title_color=FF6B35", "The title and subtitle color, the same by day and by night."],
  ["text_color=7A1F1F", "stats", "&text_color=7A1F1F", "The color of every other text: rows, values and the note."],
  ["outline_color=3B1F5C", "streak", "&outline_color=3B1F5C", "The dark edge around the title and around text drawn on the painting."],
];

const MESSAGES = [
  ["placeholder", "The first time anyone asks for your login, questlog fetches your stats from GitHub. It takes a few seconds: refresh and your card is there."],
  ["quota", "GitHub's hourly limit is used up. Your login waits in a priority queue and the card says how many minutes are left."],
  ["unknown", "No GitHub account has this login. Check the spelling; questlog remembers a missing login for an hour."],
  ["busy", "Too many new logins are waiting, or too many came from one network this hour. Try again in a while."],
  ["failed", "GitHub didn't answer when your stats were fetched. questlog waits a little before it tries again."],
  ["error", "A parameter is wrong, here scene=castel. The card names the parameter and what it takes."],
];

const FAQ = [
  ["Does questlog need my token or access to my account?", "No. It reads public profile data with its own token. You only paste an image link."],
  ["Why do my numbers differ from my profile page?", "Cards show public data, refreshed every 12 hours. Private work counts only when your profile shares private contributions."],
  ["My language has no rune.", "The thirty most common languages each have a rune. Every other language gets othala, in gold."],
  ["Can I use the cards outside GitHub?", "Yes. They are plain PNG images, so any page or README that shows images can show them."],
  ["Can I use a different scene on each card?", "Yes, every card takes its own parameters. One scene for all three makes the profile read like one place."],
  ["Is it free?", "Yes, for non-commercial use such as your own profile. The code is MIT. The paintings are © Cevdet Baran Oral under CC BY-NC 4.0, so commercial use needs written permission: contact@cevdetbaran.com."],
];

export default function Wiki() {
  return (
    <>
      <a className="skip" href="#doc">
        Skip to content
      </a>
      <Nav />
      <main style={{ overflowX: "clip" }}>
        <header className={w.header}>
          <h1 className={w.h1}>The questlog wiki</h1>
          <p className="lede">How the cards work, what every number means, every option and every scene, with live examples.</p>
        </header>

        <div className={w.layout}>
          <nav className={w.toc} aria-label="On this page">
            <p className={w.tocTitle}>On this page</p>
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
              <h2>Getting started</h2>
              <p>
                Paste this line into your profile README, the repository named after your login (<code>you/you</code>).
                Change <code>you</code> to your login and <code>forest</code> to any scene. The{" "}
                <a href="/builder">profile builder</a> writes it for you.
              </p>
              <Code>{SNIPPET}</Code>
              <p>
                The address reads <code>/login/card/scene/time</code>: <code>/you/streak/castle/night</code> is your
                Campfire in the castle at night. Scene and time are optional. Every other option goes after a{" "}
                <code>?</code>, like <code>/you/languages/forest?langs=3</code>.
              </p>
              <h3>Night for dark mode readers</h3>
              <p>
                GitHub tells the browser whether the reader uses a light or a dark theme. Use the{" "}
                <code>&lt;picture&gt;</code> tag below and readers in dark mode get the night painting; everyone else gets
                the day. No script, no setting.
              </p>
              <Code>{PICTURE}</Code>
              <div className={w.pair}>
                <figure>
                  <Shot src={card("stats", "forest", "&time=day")} alt="Character Sheet, forest, by day" />
                  <figcaption>Light theme</figcaption>
                </figure>
                <figure>
                  <Shot src={card("stats", "forest", "&time=night")} alt="Character Sheet, forest, by night" />
                  <figcaption>Dark theme</figcaption>
                </figure>
              </div>
              <p className={w.note}>
                Anywhere that renders HTML works the same way: a repository README, a wiki or your own site. Where only
                Markdown images are allowed, use <code>![My stats]({HOST}/stats?user=you)</code> and pick one time.
              </p>
            </section>

            <section id="cards" className={w.section}>
              <h2>The three cards</h2>
              <h3>Character Sheet, /stats</h3>
              <Shot src={card("stats", "castle")} alt="BaranDev's Character Sheet in the castle scene" />
              <table className={w.table}>
                <thead>
                  <tr>
                    <th>Row and key</th>
                    <th>What it counts</th>
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

              <h3>Levels</h3>
              <p>
                Reaching level L+1 takes <strong>25 &middot; L &middot; (L+1)</strong> lifetime contributions, so each
                level costs 50 more than the one before. Everyone starts at level 1.
              </p>
              <div className={w.levels}>
                {LEVELS.map((l) => (
                  <div key={l}>
                    <span>Level {l}</span>
                    <strong>{(25 * (l - 1) * l).toLocaleString("en-US")}</strong>
                  </div>
                ))}
              </div>

              <h3>Classes</h3>
              <p>The subtitle beside the title is a class, chosen by your top language.</p>
              <table className={`${w.table} ${w.compact}`}>
                <thead>
                  <tr>
                    <th>Top language</th>
                    <th>Class</th>
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

              <h3>Spellbook, /languages</h3>
              <Shot src={card("languages", "fairy-garden")} alt="BaranDev's Spellbook in the fairy-garden scene" />
              <p>
                Your top five languages by amount of code across the public repositories you own (forks left out). Each row
                shows the language&apos;s rune, its share of all your code and a bar measured against your top language.
              </p>

              <h3>The fire, /streak</h3>
              <Shot src={card("streak", "forest")} alt="BaranDev's Campfire in the forest scene" />
              <ul className={w.list}>
                <li>
                  <strong>Current</strong>: days in a row with at least one contribution, up to today. A day without a
                  contribution <em>yet</em> today does not break it.
                </li>
                <li>
                  <strong>Best</strong>: your longest run ever. A notch is cut for every five days of it.
                </li>
                <li>
                  <strong>Total</strong>: all your contributions.
                </li>
                <li>
                  The fire grows with the current streak, and its name follows the scene: Campfire in the forests and the
                  fairy garden, Brazier on the castles and in the war room, Hearth in the witch cottage, royal library and
                  guild hall, Lantern in the cloud kingdom and observatory, and Fire Bowl in the rose garden.
                </li>
              </ul>
            </section>

            <section id="fire" className={w.section}>
              <h2>Fire tiers</h2>
              <p>
                The fire is drawn from your current streak. These four use a sample adventurer in the castle, where the
                brazier starts out cold. The notches under the numbers count the best streak.
              </p>
              <div className={w.grid2}>
                {FIRES.map(([n, name, range]) => (
                  <figure key={n}>
                    <Shot src={`/demo/streak?streak=${n}&scene=castle`} alt={`${name} fire at a ${n} day streak`} />
                    <figcaption>
                      <strong>{name}</strong> {range}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>

            <section id="runes" className={w.section}>
              <h2>Runes</h2>
              <p>
                Each language in the Spellbook gets a rune from the Elder Futhark and the Anglo-Saxon futhorc, in its own
                color. Any language not listed gets othala.
              </p>
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
              <h2>Every scene, every variation</h2>
              <p>
                Sixteen scenes in four themes, each with all three cards by day and by night. Every image links to its
                full size.
              </p>
              {THEMES.map((t) => (
                <div key={t.name} className={w.theme}>
                  <h3>{t.name}</h3>
                  {t.scenes.map((scene) => (
                    <div key={scene} id={`scene-${scene}`} className={w.scene}>
                      <h4>
                        <code>scene={scene}</code>
                        <span>
                          Character Sheet, Spellbook, {cardName("streak", scene)}
                          {isReady(scene) ? ": themed or classic fire" : ""}
                        </span>
                        {!isReady(scene) && <small className={w.wip}>WIP: fire being reworked</small>}
                      </h4>
                      <div className={w.variations}>
                        {WIDGETS.map((wd) =>
                          (["day", "night"] as const).map((time) => (
                            <Shot
                              key={wd + time}
                              src={card(wd, scene, `&time=${time}${wd === "streak" && isReady(scene) ? "&fire=themed" : ""}`)}
                              alt={`${cardName(wd, scene)}, ${scene}, ${time}`}
                            />
                          )),
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </section>

            <section id="options" className={w.section}>
              <h2>Options</h2>
              <p>Every card takes the same query parameters.</p>
              <table className={w.table}>
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Values</th>
                    <th>Default</th>
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
              <p className={w.note}>
                Keys are case-insensitive. On /stats, <code>labels</code> and <code>values</code> both take{" "}
                <code>level</code>, <code>commits</code>, <code>prs</code>, <code>repos</code>, <code>stars</code>,{" "}
                <code>issues</code>, <code>reviews</code>, <code>followers</code>, <code>contributions</code>. On
                /languages, both take any language name, such as <code>typescript</code>, <code>c%23</code> for C# or{" "}
                <code>c%2B%2B</code> for C++, and a value replaces that row&apos;s percent; <code>labels</code> also
                takes <code>percent</code> (the % sign) and <code>empty</code> (the text for an account with no
                languages). On /streak, both take <code>current</code>, <code>best</code>, <code>total</code>, and{" "}
                <code>labels</code> also takes <code>days</code>; a value replaces the whole value, days included. The
                stats and streak keys work for <code>hide</code> too. Up to 20 pairs per list; text that does not fit
                its place is trimmed. A note goes under the rows on /stats and /languages, where each line takes the
                place of the last language, and beside the fire on /streak.
              </p>
              <div className={w.examples}>
                {EXAMPLES.map(([label, wd, extra, text]) => (
                  <figure key={label} className={w.example}>
                    <figcaption>
                      <code>{label}</code>
                      <span>{text}</span>
                      <small>{`/${wd}?user=BaranDev${extra}`.replace(/%20/g, " ")}</small>
                    </figcaption>
                    <Shot src={`/${wd}?user=BaranDev${extra}`} alt={`${cardName(wd, "forest")} with ${label}`} />
                  </figure>
                ))}
                <figure className={w.example}>
                  <figcaption>
                    <code>scale=1</code>
                    <span>
                      The output size: 320 x 128 times the scale. The default, 5, is sharp on any screen; 1 is the
                      painting at its true size.
                    </span>
                    <small>/stats?user=BaranDev&amp;scale=1</small>
                  </figcaption>
                  <Shot src="/stats?user=BaranDev" alt="Character Sheet at scale 1, 320 by 128" scale={1} />
                </figure>
              </div>
            </section>

            <section id="messages" className={w.section}>
              <h2>What the messages mean</h2>
              <p>When a card can&apos;t be drawn yet, questlog still answers with an image that says why.</p>
              <div className={w.messages}>
                {MESSAGES.map(([kind, text]) => (
                  <figure key={kind}>
                    <Shot src={`/demo/message?kind=${kind}`} alt={`The ${kind} message card`} />
                    <figcaption>
                      <code>{kind}</code>
                      <span>{text}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>

            <section id="limits" className={w.section}>
              <h2>Caching and limits</h2>
              <ul className={w.list}>
                <li>
                  <strong>Every 12 hours.</strong> Your numbers are kept for 12 hours. After that the next view still gets
                  a card at once, and a fresh one is fetched behind it.
                </li>
                <li>
                  <strong>The scribe.</strong> The very first view of a login has nothing to show yet, so it shows the
                  &ldquo;scribe is inking your sheet&rdquo; card for the few seconds the fetch takes.
                </li>
                <li>
                  <strong>GitHub&apos;s hourly limit.</strong> questlog asks GitHub with one token, which has an hourly
                  budget. When it runs out, new logins wait in a queue and the card says how many minutes are left.
                </li>
                <li>
                  <strong>Private contributions.</strong> Only public data is shown, unless &ldquo;Include private
                  contributions on my profile&rdquo; is on in your GitHub profile settings.
                </li>
              </ul>
            </section>

            <section id="self-hosting" className={w.section}>
              <h2>Self-hosting</h2>
              <p>
                questlog is one Docker image. With your own token, your instance can count your private contributions too.
              </p>
              <Code>{`git clone ${REPO}
cd questlog-github-stats
docker build -t questlog .
docker run -d -p 8080:8080 --env-file .env -v questlog-data:/data questlog`}</Code>
              <p>
                <code>.env</code> holds a fine-grained GitHub token that can read public repositories:
              </p>
              <Code>{`GITHUB_TOKEN=github_pat_...`}</Code>
              <p className={w.note}>
                The server listens on <code>PORT</code> (8080) and keeps its cache in <code>DATA_DIR</code> (
                <code>/data</code>). Then use your own host in the snippet.
              </p>
            </section>

            <section id="faq" className={w.section}>
              <h2>FAQ</h2>
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
      <Footer />
    </>
  );
}
