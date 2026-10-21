"use client";

import { Check, ChevronLeft, ChevronRight, Moon, Sun, SunMoon, Trash2 } from "lucide-react";
import { DECORATIONS, THEMES, cardName, decorationLabel, type Widget } from "../data";
import { WIDGETS, decorationThumb, getParam, readPairs, sceneLabel, setParam, themeOf, thumb, writePairs, type Card, type Spot } from "./cards";
import { CloseButton, ColorField, Field, Segmented, SelectField, Toggle } from "./ui";
import s from "./builder.module.css";

export type Mode = "single" | "auto";
type Time = "day" | "night" | "auto";

const STATS_ROWS = [
  ["level", "Level"],
  ["commits", "Commits"],
  ["prs", "PRs"],
  ["repos", "Repos"],
  ["stars", "Stars"],
  ["issues", "Issues"],
  ["reviews", "Reviews"],
  ["followers", "Followers"],
  ["contributions", "Contributions"],
];
const STREAK_ROWS = [
  ["current", "Current"],
  ["best", "Best"],
  ["total", "Total"],
  ["days", "Unit after the numbers (days)"],
];
const VALUES_EXAMPLE: Record<Widget, string> = {
  stats: "level:Archmage",
  languages: "typescript:Master",
  streak: "current:Forever",
};
/** Options that only mean something on one card, dropped when the card type changes. */
const OWN: Record<string, Widget | "none"> = { fire: "streak", langs: "languages", labels: "none", values: "none", hide: "none" };

const DESCRIBE: Record<Widget, string> = {
  stats: "Level, commits, pull requests, stars and more",
  languages: "Your top languages, each with its rune",
  streak: "Your contribution streak as a fire",
};
export const describe = (w: Widget) => DESCRIBE[w];

export const sceneGroups = THEMES.map((t) => ({ label: t.name, options: t.scenes.map((sc) => ({ value: sc, label: sceneLabel(sc) })) }));

type Props = {
  spot: Spot;
  index: number;
  count: number;
  onChange: (card: Card, mode: Mode, typing?: boolean) => void;
  onRemove: () => void;
  onClose: () => void;
  onStep: (d: -1 | 1) => void;
};

export default function CardOptions(props: Props) {
  return props.spot.card.widget === "decorations" ? <DecorationOptions {...props} /> : <WidgetOptions {...props} />;
}

/** The panel's top: what is being changed, and stepping through the cards of the README. */
function Head({ name, sub, index, count, onStep, onClose }: { name: string; sub: string } & Pick<Props, "index" | "count" | "onStep" | "onClose">) {
  return (
    <>
      <div className={s.optsHead}>
        <div>
          <h3 className={`display ${s.optsName}`}>{name}</h3>
          <p className={s.optsSub}>{sub}</p>
        </div>
        <div className={s.optsNav}>
          {count > 1 && (
            <>
              <button type="button" className={s.navBtn} onClick={() => onStep(-1)} aria-label="Previous card">
                <ChevronLeft aria-hidden="true" />
              </button>
              <span className={s.label}>
                Card {index + 1} of {count}
              </span>
              <button type="button" className={s.navBtn} onClick={() => onStep(1)} aria-label="Next card">
                <ChevronRight aria-hidden="true" />
              </button>
            </>
          )}
          <CloseButton onClick={onClose} label="Close the card options" />
        </div>
      </div>
      <p className={s.optsHint}>Every change goes straight into your README.</p>
    </>
  );
}

function Foot({ onRemove, onClose }: Pick<Props, "onRemove" | "onClose">) {
  return (
    <div className={s.optsFoot}>
      <button type="button" className={`btn ${s.remove}`} onClick={onRemove}>
        <Trash2 aria-hidden="true" />
        Remove this card
      </button>
      <button type="button" className="btn btn-primary" onClick={onClose}>
        <Check aria-hidden="true" />
        Done
      </button>
    </div>
  );
}

/** A decoration has no stats: the painting, day or night, its title and the title's colors. */
function DecorationOptions({ spot, index, count, onChange, onRemove, onClose, onStep }: Props) {
  const c = spot.card;
  const mode: Mode = spot.kind === "picture" && spot.dark ? "auto" : "single";
  const time: Time = mode === "auto" ? "auto" : c.night ? "night" : "day";
  const set = (key: string, value: string, typing = true) => onChange(setParam(c, key, value), mode, typing);
  const setTime = (t: Time) => onChange({ ...c, night: t === "night" }, t === "auto" ? "auto" : "single");
  const title = getParam(c, "title");
  return (
    <div className={s.opts}>
      <Head
        name="Decoration"
        sub={`${decorationLabel(c.scene)}, ${time === "auto" ? "switches with dark mode" : time === "night" ? "by night" : "by day"}`}
        index={index}
        count={count}
        onStep={onStep}
        onClose={onClose}
      />
      <fieldset className={s.group}>
        <legend className={s.label}>Painting</legend>
        <div className={`${s.thumbs} ${s.c3}`}>
          {DECORATIONS.map((d) => (
            <label key={d.name} className={s.thumb}>
              <input type="radio" name={`deco-${index}`} checked={c.scene === d.name} onChange={() => onChange({ ...c, scene: d.name }, mode)} />
              <img className="pix" src={decorationThumb(d.name, time === "night")} width={640} height={d.h * 2} alt="" loading="lazy" />
              <span className={s.thumbScene}>{d.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Segmented<Time>
        label="Time of day"
        value={time}
        onChange={setTime}
        options={[
          { value: "day", label: "Day", icon: <Sun aria-hidden="true" /> },
          { value: "night", label: "Night", icon: <Moon aria-hidden="true" /> },
          { value: "auto", label: "Switch with dark mode", icon: <SunMoon aria-hidden="true" /> },
        ]}
        help={
          time === "auto"
            ? "Readers who use GitHub in dark mode see the night painting, everyone else the day one."
            : "Pick Switch with dark mode to show night to readers who use GitHub in dark mode."
        }
      />
      <Segmented<"fine" | "chunky">
        label="Pixels"
        value={getParam(c, "pixels") === "chunky" ? "chunky" : "fine"}
        onChange={(v) => set("pixels", v === "chunky" ? "chunky" : "", false)}
        options={[
          { value: "fine", label: "Fine" },
          { value: "chunky", label: "Chunky" },
        ]}
        help="Chunky draws the painting in pixels twice as big; the words stay sharp. The switch above the preview sets every card at once."
      />
      <Field label="Title" value={title} onChange={(v) => set("title", v)} help="Empty: the painting alone. Example: About Me" />
      <details className={s.more}>
        <summary>
          More options: colors, animation
          <ChevronRight className={s.moreChev} aria-hidden="true" />
        </summary>
        <div className={s.moreBody}>
          <fieldset className={s.group}>
            <legend className={s.label}>Colors</legend>
            <div className={s.colors}>
              <ColorField label="Title color" value={getParam(c, "title_color")} onChange={(v) => set("title_color", v)} />
              <ColorField label="Outline color" value={getParam(c, "outline_color")} onChange={(v) => set("outline_color", v)} />
            </div>
          </fieldset>
          <Toggle checked={getParam(c, "animate") !== "false"} onChange={(on) => set("animate", on ? "" : "false", false)}>
            Animate the candles and lights
          </Toggle>
          {title && (
            <Toggle checked={getParam(c, "truncate") === "false"} onChange={(on) => set("truncate", on ? "false" : "", false)}>
              Show a long title whole (it may run past its place)
            </Toggle>
          )}
        </div>
      </details>
      <Foot onRemove={onRemove} onClose={onClose} />
    </div>
  );
}

function WidgetOptions({ spot, index, count, onChange, onRemove, onClose, onStep }: Props) {
  const c = spot.card as Card & { widget: Widget };
  const mode: Mode = spot.kind === "picture" && spot.dark ? "auto" : "single";
  const time: Time = mode === "auto" ? "auto" : c.night ? "night" : "day";
  const night = time === "night";
  const fire = getParam(c, "fire") === "themed" ? "themed" : "classic";
  const theme = themeOf(c.scene);
  const name = cardName(c.widget, c.scene);

  const set = (key: string, value: string, typing = true) => onChange(setParam(c, key, value), mode, typing);
  const setWidget = (w: Widget) => {
    if (w === c.widget) return;
    let next: Card = { ...c, widget: w, params: c.params.filter(([k]) => !(k in OWN) || OWN[k] === w) };
    if (w === "streak" && !getParam(next, "fire")) next = setParam(next, "fire", "themed");
    onChange(next, mode);
  };
  const setTime = (t: Time) => onChange({ ...c, night: t === "night" }, t === "auto" ? "auto" : "single");

  const labels = readPairs(getParam(c, "labels"));
  const setLabel = (k: string, v: string) => {
    const m = new Map(labels);
    m.set(k, v);
    set("labels", writePairs(m));
  };
  const hidden = getParam(c, "hide")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const setShown = (k: string, show: boolean) =>
    set("hide", (show ? hidden.filter((h) => h !== k) : [...hidden, k]).join(","), false);

  return (
    <div className={s.opts}>
      <Head
        name={name}
        sub={`${sceneLabel(c.scene)}, ${time === "auto" ? "switches with dark mode" : night ? "by night" : "by day"}`}
        index={index}
        count={count}
        onStep={onStep}
        onClose={onClose}
      />

      <fieldset className={s.group}>
        <legend className={s.label}>Card</legend>
        <div className={`${s.thumbs} ${s.c3}`}>
          {WIDGETS.map((w) => (
            <label key={w} className={s.thumb}>
              <input type="radio" name={`card-${index}`} checked={c.widget === w} onChange={() => setWidget(w)} />
              <img className="pix" src={thumb(w, c.scene, night, fire)} width={640} height={256} alt="" loading="lazy" />
              <span className={s.thumbName}>{cardName(w, c.scene)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={s.group}>
        <legend className={s.label}>Scenes like this one</legend>
        <div className={`${s.thumbs} ${s.c4}`}>
          {theme.scenes.map((sc) => (
            <label key={sc} className={s.thumb}>
              <input type="radio" name={`scene-${index}`} checked={c.scene === sc} onChange={() => onChange({ ...c, scene: sc }, mode)} />
              <img className="pix" src={thumb(c.widget, sc, night, fire)} width={640} height={256} alt="" loading="lazy" />
              <span className={s.thumbScene}>{sceneLabel(sc)}</span>
            </label>
          ))}
        </div>
        <SelectField
          label="Or pick any of the 16 scenes"
          value={c.scene}
          onChange={(sc) => onChange({ ...c, scene: sc }, mode)}
          groups={sceneGroups}
        />
      </fieldset>

      <Segmented<Time>
        label="Time of day"
        value={time}
        onChange={setTime}
        options={[
          { value: "day", label: "Day", icon: <Sun aria-hidden="true" /> },
          { value: "night", label: "Night", icon: <Moon aria-hidden="true" /> },
          { value: "auto", label: "Switch with dark mode", icon: <SunMoon aria-hidden="true" /> },
        ]}
        help={
          time === "auto"
            ? "Readers who use GitHub in dark mode see the night painting, everyone else the day one."
            : "Pick Switch with dark mode to show night to readers who use GitHub in dark mode."
        }
      />

      <Segmented<"fine" | "chunky">
        label="Pixels"
        value={getParam(c, "pixels") === "chunky" ? "chunky" : "fine"}
        onChange={(v) => set("pixels", v === "chunky" ? "chunky" : "", false)}
        options={[
          { value: "fine", label: "Fine" },
          { value: "chunky", label: "Chunky" },
        ]}
        help="Chunky draws the painting in pixels twice as big; the words stay sharp. The switch above the preview sets every card at once."
      />
      {c.widget === "streak" && (
        <Segmented
          label="Fire"
          value={fire}
          onChange={(f) => set("fire", f === "themed" ? "themed" : "", false)}
          options={[
            { value: "themed", label: "Themed" },
            { value: "classic", label: "Classic" },
          ]}
          help="Themed takes the scene's colors. Classic is the original orange flame."
        />
      )}
      {c.widget === "languages" && (
        <Segmented
          label="How many languages"
          value={getParam(c, "langs") === "3" ? "3" : "5"}
          onChange={(n) => set("langs", n === "3" ? "3" : "", false)}
          options={[
            { value: "5", label: "Top 5" },
            { value: "3", label: "Top 3" },
          ]}
        />
      )}

      <div className={s.pair}>
        <Field label="Title" value={getParam(c, "title")} onChange={(v) => set("title", v)} help={`Empty: "${name}".`} />
        <Field
          label="Subtitle"
          value={getParam(c, "subtitle")}
          onChange={(v) => set("subtitle", v)}
          help={c.widget === "stats" ? "Empty: a class from your top language." : "Empty: no subtitle."}
        />
      </div>

      <details className={s.more}>
        <summary>
          More options: note, words, colors
          <ChevronRight className={s.moreChev} aria-hidden="true" />
        </summary>
        <div className={s.moreBody}>
          <Field
            label="Note"
            value={getParam(c, "note")}
            onChange={(v) => set("note", v)}
            maxLength={121}
            help="Up to two lines, split with |. Example: Open to work|DMs open"
          />

          {c.widget === "stats" && (
            <fieldset className={s.group}>
              <legend className={s.label}>Rows</legend>
              <p className={s.help}>Rename a row, or untick it to hide it. Empty names keep the scene&apos;s words.</p>
              <div className={s.rows}>
                {STATS_ROWS.map(([k, label]) => (
                  <div key={k} className={s.rowItem}>
                    <label className={s.check}>
                      <input type="checkbox" checked={!hidden.includes(k)} onChange={(e) => setShown(k, e.target.checked)} />
                      <span className="visually-hidden">Show {label}</span>
                    </label>
                    <Field label={label} value={labels.get(k) ?? ""} onChange={(v) => setLabel(k, v)} />
                  </div>
                ))}
              </div>
            </fieldset>
          )}
          {c.widget === "streak" && (
            <fieldset className={s.group}>
              <legend className={s.label}>Words</legend>
              <p className={s.help}>Rename the parts of the card. Empty keeps the scene&apos;s words.</p>
              <div className={s.rowsPlain}>
                {STREAK_ROWS.map(([k, label]) => (
                  <Field key={k} label={label} value={labels.get(k) ?? ""} onChange={(v) => setLabel(k, v)} />
                ))}
              </div>
            </fieldset>
          )}
          {c.widget === "languages" && (
            <>
              <Field
                label="Hide languages"
                value={getParam(c, "hide")}
                onChange={(v) => set("hide", v)}
                maxLength={120}
                help="Names split with commas. Example: html,css"
              />
              <Field
                label="Rename languages"
                value={getParam(c, "labels")}
                onChange={(v) => set("labels", v)}
                maxLength={240}
                help="language:New name, split with commas. Example: typescript:TS,python:Py"
              />
            </>
          )}
          <Field
            label="Replace values"
            value={getParam(c, "values")}
            onChange={(v) => set("values", v)}
            maxLength={240}
            help={`Shows your own words instead of a number; bars and fires still follow your real numbers. Example: ${VALUES_EXAMPLE[c.widget]}`}
          />

          <fieldset className={s.group}>
            <legend className={s.label}>Colors</legend>
            <div className={s.colors}>
              <ColorField label="Title color" value={getParam(c, "title_color")} onChange={(v) => set("title_color", v)} />
              <ColorField label="Text color" value={getParam(c, "text_color")} onChange={(v) => set("text_color", v)} />
              <ColorField label="Outline color" value={getParam(c, "outline_color")} onChange={(v) => set("outline_color", v)} />
            </div>
          </fieldset>

          <Toggle checked={getParam(c, "animate") !== "false"} onChange={(on) => set("animate", on ? "" : "false", false)}>
            Animate the flames and sparkles
          </Toggle>
          {getParam(c, "subtitle") && (
            <Toggle checked={getParam(c, "truncate") === "false"} onChange={(on) => set("truncate", on ? "false" : "", false)}>
              Show a long subtitle whole (it may run past the painting)
            </Toggle>
          )}
        </div>
      </details>

      <Foot onRemove={onRemove} onClose={onClose} />
    </div>
  );
}
