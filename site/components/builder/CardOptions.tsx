"use client";

import { m } from "@/i18n";
import { Check, ChevronLeft, ChevronRight, Moon, Sun, SunMoon, Trash2 } from "lucide-react";
import { DECORATIONS, THEMES, cardName, decorationLabel, type Widget } from "../data";
import { WIDGETS, decorationThumb, getParam, readPairs, sceneLabel, setParam, themeOf, thumb, writePairs, type Card, type Spot } from "./cards";
import { CloseButton, ColorField, Field, Segmented, SelectField, Toggle } from "./ui";
import s from "./builder.module.css";

export type Mode = "single" | "auto";
type Time = "day" | "night" | "auto";

const tx = m.builderParts.cardOptions;
const STATS_ROWS = (["level", "commits", "prs", "repos", "stars", "issues", "reviews", "followers", "contributions"] as const).map(
  (k) => [k, tx.statsRows[k]],
);
const STREAK_ROWS = (["current", "best", "total", "days"] as const).map((k) => [k, tx.streakRows[k]]);
const VALUES_EXAMPLE: Record<Widget, string> = tx.valuesExample;
/** Options that only mean something on one card, dropped when the card type changes. */
const OWN: Record<string, Widget | "none"> = { fire: "streak", langs: "languages", labels: "none", values: "none", hide: "none" };

export const describe = (w: Widget) => tx.describe[w];

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
              <button type="button" className={s.navBtn} onClick={() => onStep(-1)} aria-label={tx.previousCard}>
                <ChevronLeft aria-hidden="true" />
              </button>
              <span className={s.label}>
                {tx.cardOf(index + 1, count)}
              </span>
              <button type="button" className={s.navBtn} onClick={() => onStep(1)} aria-label={tx.nextCard}>
                <ChevronRight aria-hidden="true" />
              </button>
            </>
          )}
          <CloseButton onClick={onClose} label={tx.closeOptions} />
        </div>
      </div>
      <p className={s.optsHint}>{tx.liveHint}</p>
    </>
  );
}

function Foot({ onRemove, onClose }: Pick<Props, "onRemove" | "onClose">) {
  return (
    <div className={s.optsFoot}>
      <button type="button" className={`btn ${s.remove}`} onClick={onRemove}>
        <Trash2 aria-hidden="true" />
        {tx.remove}
      </button>
      <button type="button" className="btn btn-primary" onClick={onClose}>
        <Check aria-hidden="true" />
        {tx.done}
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
        name={tx.decoration}
        sub={tx.sub(decorationLabel(c.scene), time)}
        index={index}
        count={count}
        onStep={onStep}
        onClose={onClose}
      />
      <fieldset className={s.group}>
        <legend className={s.label}>{tx.painting}</legend>
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
        label={tx.timeOfDay}
        value={time}
        onChange={setTime}
        options={[
          { value: "day", label: tx.times.day, icon: <Sun aria-hidden="true" /> },
          { value: "night", label: tx.times.night, icon: <Moon aria-hidden="true" /> },
          { value: "auto", label: tx.times.auto, icon: <SunMoon aria-hidden="true" /> },
        ]}
        help={
          time === "auto"
            ? tx.timeHelpAuto
            : tx.timeHelpOther
        }
      />
      <Segmented<"fine" | "chunky">
        label={tx.pixels}
        value={getParam(c, "pixels") === "chunky" ? "chunky" : "fine"}
        onChange={(v) => set("pixels", v === "chunky" ? "chunky" : "", false)}
        options={[
          { value: "fine", label: tx.pixelOptions.fine },
          { value: "chunky", label: tx.pixelOptions.chunky },
        ]}
        help={tx.pixelsHelp}
      />
      <Field label={tx.title} value={title} onChange={(v) => set("title", v)} help={tx.decorationTitleHelp} />
      <details className={s.more}>
        <summary>
          {tx.moreDecoration}
          <ChevronRight className={s.moreChev} aria-hidden="true" />
        </summary>
        <div className={s.moreBody}>
          <fieldset className={s.group}>
            <legend className={s.label}>{tx.colors}</legend>
            <div className={s.colors}>
              <ColorField label={tx.titleColor} value={getParam(c, "title_color")} onChange={(v) => set("title_color", v)} />
              <ColorField label={tx.outlineColor} value={getParam(c, "outline_color")} onChange={(v) => set("outline_color", v)} />
            </div>
          </fieldset>
          <Toggle checked={getParam(c, "animate") !== "false"} onChange={(on) => set("animate", on ? "" : "false", false)}>
            {tx.animateDecoration}
          </Toggle>
          {title && (
            <Toggle checked={getParam(c, "truncate") === "false"} onChange={(on) => set("truncate", on ? "false" : "", false)}>
              {tx.showTitleWhole}
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
        sub={tx.sub(sceneLabel(c.scene), time)}
        index={index}
        count={count}
        onStep={onStep}
        onClose={onClose}
      />

      <fieldset className={s.group}>
        <legend className={s.label}>{tx.card}</legend>
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
        <legend className={s.label}>{tx.scenesLikeThis}</legend>
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
          label={tx.pickAnyScene}
          value={c.scene}
          onChange={(sc) => onChange({ ...c, scene: sc }, mode)}
          groups={sceneGroups}
        />
      </fieldset>

      <Segmented<Time>
        label={tx.timeOfDay}
        value={time}
        onChange={setTime}
        options={[
          { value: "day", label: tx.times.day, icon: <Sun aria-hidden="true" /> },
          { value: "night", label: tx.times.night, icon: <Moon aria-hidden="true" /> },
          { value: "auto", label: tx.times.auto, icon: <SunMoon aria-hidden="true" /> },
        ]}
        help={
          time === "auto"
            ? tx.timeHelpAuto
            : tx.timeHelpOther
        }
      />

      <Segmented<"fine" | "chunky">
        label={tx.pixels}
        value={getParam(c, "pixels") === "chunky" ? "chunky" : "fine"}
        onChange={(v) => set("pixels", v === "chunky" ? "chunky" : "", false)}
        options={[
          { value: "fine", label: tx.pixelOptions.fine },
          { value: "chunky", label: tx.pixelOptions.chunky },
        ]}
        help={tx.pixelsHelp}
      />
      {c.widget === "streak" && (
        <Segmented
          label={tx.fire}
          value={fire}
          onChange={(f) => set("fire", f === "themed" ? "themed" : "", false)}
          options={[
            { value: "themed", label: tx.fireOptions.themed },
            { value: "classic", label: tx.fireOptions.classic },
          ]}
          help={tx.fireHelp}
        />
      )}
      {c.widget === "languages" && (
        <Segmented
          label={tx.howManyLanguages}
          value={getParam(c, "langs") === "3" ? "3" : "5"}
          onChange={(n) => set("langs", n === "3" ? "3" : "", false)}
          options={[
            { value: "5", label: tx.languageCounts.top5 },
            { value: "3", label: tx.languageCounts.top3 },
          ]}
        />
      )}

      <div className={s.pair}>
        <Field label={tx.title} value={getParam(c, "title")} onChange={(v) => set("title", v)} help={tx.titleHelp(name)} />
        <Field
          label={tx.subtitle}
          value={getParam(c, "subtitle")}
          onChange={(v) => set("subtitle", v)}
          help={c.widget === "stats" ? tx.subtitleHelpStats : tx.subtitleHelpNone}
        />
      </div>

      <details className={s.more}>
        <summary>
          {tx.moreWidget}
          <ChevronRight className={s.moreChev} aria-hidden="true" />
        </summary>
        <div className={s.moreBody}>
          <Field
            label={tx.note}
            value={getParam(c, "note")}
            onChange={(v) => set("note", v)}
            maxLength={121}
            help={tx.noteHelp}
          />

          {c.widget === "stats" && (
            <fieldset className={s.group}>
              <legend className={s.label}>{tx.rows}</legend>
              <p className={s.help}>{tx.rowsHelp}</p>
              <div className={s.rows}>
                {STATS_ROWS.map(([k, label]) => (
                  <div key={k} className={s.rowItem}>
                    <label className={s.check}>
                      <input type="checkbox" checked={!hidden.includes(k)} onChange={(e) => setShown(k, e.target.checked)} />
                      <span className="visually-hidden">{tx.showRow(label)}</span>
                    </label>
                    <Field label={label} value={labels.get(k) ?? ""} onChange={(v) => setLabel(k, v)} />
                  </div>
                ))}
              </div>
            </fieldset>
          )}
          {c.widget === "streak" && (
            <fieldset className={s.group}>
              <legend className={s.label}>{tx.words}</legend>
              <p className={s.help}>{tx.wordsHelp}</p>
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
                label={tx.hideLanguages}
                value={getParam(c, "hide")}
                onChange={(v) => set("hide", v)}
                maxLength={120}
                help={tx.hideLanguagesHelp}
              />
              <Field
                label={tx.renameLanguages}
                value={getParam(c, "labels")}
                onChange={(v) => set("labels", v)}
                maxLength={240}
                help={tx.renameLanguagesHelp}
              />
            </>
          )}
          <Field
            label={tx.replaceValues}
            value={getParam(c, "values")}
            onChange={(v) => set("values", v)}
            maxLength={240}
            help={tx.replaceValuesHelp(VALUES_EXAMPLE[c.widget])}
          />

          <fieldset className={s.group}>
            <legend className={s.label}>{tx.colors}</legend>
            <div className={s.colors}>
              <ColorField label={tx.titleColor} value={getParam(c, "title_color")} onChange={(v) => set("title_color", v)} />
              <ColorField label={tx.textColor} value={getParam(c, "text_color")} onChange={(v) => set("text_color", v)} />
              <ColorField label={tx.outlineColor} value={getParam(c, "outline_color")} onChange={(v) => set("outline_color", v)} />
            </div>
          </fieldset>

          <Toggle checked={getParam(c, "animate") !== "false"} onChange={(on) => set("animate", on ? "" : "false", false)}>
            {tx.animateWidget}
          </Toggle>
          {getParam(c, "subtitle") && (
            <Toggle checked={getParam(c, "truncate") === "false"} onChange={(on) => set("truncate", on ? "false" : "", false)}>
              {tx.showSubtitleWhole}
            </Toggle>
          )}
        </div>
      </details>

      <Foot onRemove={onRemove} onClose={onClose} />
    </div>
  );
}
