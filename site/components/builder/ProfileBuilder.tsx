"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  CircleHelp,
  Copy,
  Eye,
  Hourglass,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Sun,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { HOST, cardName, type Widget } from "../data";
import { autoAlt, findSpots, insertAt, removeSpot, renameUser, replaceSpot, writeSpot, type Card } from "./cards";
import CardOptions, { type Mode } from "./CardOptions";
import AddCard from "./AddCard";
import CopyHelp from "./CopyHelp";
import Editor from "./Editor";
import LoginStep, { TourSteps, type Profile, type Start } from "./LoginStep";
import ProfilePreview from "./ProfilePreview";
import { CloseButton, Sheet } from "./ui";
import type { Theme } from "./render";
import s from "./builder.module.css";

const KEY = "questlog-profile";
/** The old card maker's saved picks: only its login is reused. */
const OLD_KEY = "questlog-builder";

/** What the server says about the login, from its X-Questlog header. */
type Status = "card" | "placeholder" | "unknown" | "busy" | "failed" | "error" | "offline" | "checking";

type Saved = { profile: Profile | null; text: string; theme: Theme; tour: boolean; changed: boolean; copied: boolean };

function restore(): Partial<Saved> & { oldLogin?: string } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (v && typeof v === "object") {
      const p = v.profile;
      const profile =
        p && typeof p.login === "string" && typeof p.name === "string"
          ? { login: p.login.slice(0, 39), name: p.name.slice(0, 120), avatar: typeof p.avatar === "string" ? p.avatar : "" }
          : null;
      return {
        profile,
        text: typeof v.text === "string" ? v.text : "",
        theme: v.theme === "light" ? "light" : "dark",
        tour: v.tour !== false,
        changed: v.changed === true,
        copied: v.copied === true,
      };
    }
    const old = JSON.parse(localStorage.getItem(OLD_KEY) ?? "null");
    return { oldLogin: typeof old?.user === "string" ? old.user.slice(0, 39) : "" };
  } catch {
    return {};
  }
}

/** Asks the server for a small card of the login and reads what kind of card came back. */
async function probe(login: string): Promise<Status> {
  try {
    const r = await fetch(`/${encodeURIComponent(login)}/stats?scale=1&animate=false`, { cache: "no-store" });
    return (r.headers.get("x-questlog") as Status | null) ?? "card";
  } catch {
    return "offline";
  }
}

async function toClipboard(text: string) {
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
}

function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = matchMedia("(max-width: 959px)");
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

const STEPS = [
  { title: "Your GitHub login", wide: "", phone: "" },
  { title: "Add cards", wide: "Click Add a card. It goes in where your cursor is in the text.", phone: "Tap Add a card. It goes into your README." },
  {
    title: "Change them",
    wide: "Click a card in the preview to pick its scene, time and words.",
    phone: "Open Preview and tap a card to pick its scene, time and words.",
  },
  { title: "Copy to GitHub", wide: "Copy the text, then paste it into your profile README.", phone: "Copy the text, then paste it into your profile README." },
];

function Num({ n, state }: { n: number; state: "done" | "now" | "next" }) {
  return (
    <span className={s.num} data-state={state}>
      {state === "done" ? <Check aria-hidden="true" /> : n}
    </span>
  );
}

function Banner({ icon, children, action }: { icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={s.banner} role="status">
      {icon}
      <span>{children}</span>
      {action}
    </div>
  );
}

export default function ProfileBuilder() {
  const [ready, setReady] = useState(false);
  const [env, setEnv] = useState({ origin: HOST, host: "" });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [firstLogin, setFirstLogin] = useState("");
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState("");
  const [shown, setShown] = useState("");
  const [theme, setTheme] = useState<Theme>("dark");
  const [tour, setTour] = useState(true);
  const [tourOpen, setTourOpen] = useState(false);
  const [changed, setChanged] = useState(false);
  const [copied, setCopied] = useState(false);
  const [justCopied, setJustCopied] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tab, setTab] = useState<"write" | "preview">("preview");
  const [status, setStatus] = useState<Status>("checking");
  const [retry, setRetry] = useState(0);
  const [v, setV] = useState(0);
  const [flash, setFlash] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: boolean; n: number } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const cursor = useRef<number | null>(null);
  const work = useRef<HTMLDivElement>(null);
  const history = useRef<{ text: string; at: number; typing: boolean }[]>([]);
  const narrow = useNarrow();

  const spots = useMemo(() => findSpots(text, env.host), [text, env.host]);
  const shownSpots = useMemo(() => findSpots(shown, env.host), [shown, env.host]);
  const spot = sel !== null ? spots[sel] : undefined;

  useEffect(() => {
    const r = restore();
    if (r.profile) setProfile(r.profile);
    setFirstLogin(r.profile?.login ?? r.oldLogin ?? "");
    setText(r.text ?? "");
    setShown(r.text ?? "");
    setTheme(r.theme ?? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
    setTour(r.tour ?? true);
    setChanged(r.changed ?? false);
    setCopied(r.copied ?? false);
    // cards name this host, except on the old domain, which now points people to the new one
    setEnv({ origin: location.hostname.endsWith("cevdetbaran.com") ? HOST : location.origin, host: location.host });
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      const saved: Saved = { profile, text, theme, tour, changed, copied };
      localStorage.setItem(KEY, JSON.stringify(saved));
    } catch {
      // storage can be unavailable (private mode); the work then lasts for this visit
    }
  }, [ready, profile, text, theme, tour, changed, copied]);

  // typing settles for a moment before the preview redraws, so cards are not asked for on every key
  useEffect(() => {
    const t = window.setTimeout(() => setShown(text), 400);
    return () => window.clearTimeout(t);
  }, [text]);

  // what the server says about this login: drawn, being fetched, unknown or busy
  useEffect(() => {
    if (!profile) return;
    let live = true;
    setStatus("checking");
    probe(profile.login).then((k) => live && setStatus(k));
    return () => {
      live = false;
    };
  }, [profile?.login, retry]);

  // while the stats are being fetched, look again every few seconds, then redraw the cards
  useEffect(() => {
    if (!profile || status !== "placeholder") return;
    let stop = false;
    (async () => {
      for (let n = 0; n < 45 && !stop; n++) {
        await new Promise((r) => window.setTimeout(r, 4000));
        if (stop) return;
        const k = await probe(profile.login);
        if (stop || k === "placeholder") continue;
        setStatus(k);
        if (k === "card") setV((x) => x + 1);
        return;
      }
    })();
    return () => {
      stop = true;
    };
  }, [status, profile?.login]);

  // on wide screens the steps, the text and the preview all fit in the window, so the steps stay in view
  useLayoutEffect(() => {
    const el = work.current;
    if (!el) return;
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.setProperty("--fit", `${Math.max(540, window.innerHeight - top - 20)}px`);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  });

  useEffect(() => {
    if (sel !== null && sel >= spots.length) setSel(null);
  }, [sel, spots.length]);

  useEffect(() => {
    if (flash === null) return;
    const t = window.setTimeout(() => setFlash(null), 2600);
    return () => window.clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.undo ? 7000 : 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  /** Every change made by the builder can be undone; typing in one field counts as one change. */
  const edit = (next: string, o: { now?: boolean; typing?: boolean } = {}) => {
    const h = history.current;
    const last = h[h.length - 1];
    const t = Date.now();
    if (o.typing && last?.typing && t - last.at < 1500) last.at = t;
    else h.push({ text, at: t, typing: !!o.typing });
    if (h.length > 80) h.shift();
    setCanUndo(true);
    setText(next);
    if (o.now) setShown(next);
  };
  const undo = () => {
    const last = history.current.pop();
    if (last) {
      setText(last.text);
      setShown(last.text);
    }
    setCanUndo(history.current.length > 0);
    setToast(null);
  };
  const say = (t: string, undoable = false) => setToast({ text: t, undo: undoable, n: Date.now() });

  const onLogin = (p: Profile, next: string | null, start: Start) => {
    const old = profile?.login;
    let t = next ?? text;
    if (start === "keep" && old && old.toLowerCase() !== p.login.toLowerCase()) t = renameUser(t, old, p.login, env.host);
    history.current = [];
    setCanUndo(false);
    setProfile(p);
    setText(t);
    setShown(t);
    setAsking(false);
    setSel(null);
    setTour(false);
    cursor.current = null;
    if (start !== "keep") {
      setChanged(false);
      setCopied(false);
    }
    if (start === "github") say("Loaded your README from GitHub. Your cards go in next to it.");
  };

  const change = (card: Card, mode: Mode, typing = false) => {
    if (!spot) return;
    edit(replaceSpot(text, spot, card, mode), { now: !typing, typing });
    setChanged(true);
  };

  const remove = () => {
    if (!spot) return;
    const name = cardName(spot.card.widget, spot.card.scene);
    edit(removeSpot(text, spot), { now: true });
    setSel(null);
    say(`Removed the ${name}.`, true);
  };

  const openAdd = () => {
    setSel(null);
    setAdding(true);
  };

  const add = (w: Widget, scene: string) => {
    if (!profile) return;
    const last = spots[spots.length - 1];
    const mode: Mode = last && last.kind === "picture" && last.dark ? "auto" : "single";
    const card: Card = {
      origin: env.origin,
      user: profile.login,
      widget: w,
      scene,
      night: mode === "single" && !!last?.card.night,
      params: w === "streak" ? [["fire", "themed"]] : [],
    };
    const r = insertAt(text, cursor.current ?? text.length, writeSpot(card, autoAlt(card), mode));
    edit(r.text, { now: true });
    cursor.current = r.end;
    setFlash(findSpots(r.text, env.host).findIndex((x) => x.start === r.start));
    setAdding(false);
    if (narrow) setTab("preview");
    say(`Added the ${cardName(w, scene)}. ${narrow ? "Tap" : "Click"} it in the preview to change it.`);
  };

  const copy = async () => {
    await toClipboard(text);
    setCopied(true);
    setJustCopied(true);
    setHelpOpen(true);
  };

  const pick = (i: number) => {
    setAdding(false);
    setSel(i);
  };
  const step = (d: -1 | 1) => setSel((i) => (i === null ? i : (i + d + spots.length) % spots.length));

  if (!ready) return <div className={s.loading} aria-hidden="true" />;

  if (!profile || asking) {
    return (
      <div className={s.page}>
        <h1 className={s.kicker}>Profile builder</h1>
        <LoginStep
          initial={profile?.login ?? firstLogin}
          current={profile?.login ?? ""}
          draft={text}
          tour={tour && !profile}
          onTourDone={() => setTour(false)}
          onDone={onLogin}
          onCancel={profile ? () => setAsking(false) : undefined}
        />
      </div>
    );
  }

  const done = [true, spots.length > 0, changed, copied];
  const now = copied ? -1 : done.findIndex((d) => !d);
  const state = (i: number) => (done[i] && i !== now ? "done" : i === now ? "now" : "next");
  const lastScene = spots[spots.length - 1]?.card.scene ?? "forest";
  const lastNight = !!spots[spots.length - 1]?.card.night && !spots[spots.length - 1]?.dark;
  const where =
    cursor.current === null || cursor.current >= text.trimEnd().length
      ? "It goes at the end of your README."
      : "It goes where your cursor is in the text.";

  const notice = (() => {
    const again = (label = "Try again") => (
      <button
        type="button"
        className={`btn btn-ghost ${s.small}`}
        onClick={() => {
          setRetry((n) => n + 1);
          setV((x) => x + 1);
        }}
      >
        <RefreshCw aria-hidden="true" />
        {label}
      </button>
    );
    if (spots.length === 0) return null;
    switch (status) {
      case "placeholder":
        return (
          <Banner icon={<Hourglass aria-hidden="true" />} action={again("Check now")}>
            We&apos;re fetching {profile.login}&apos;s GitHub stats for the first time. Until they arrive your cards say{" "}
            <b>&quot;The scribe is inking your sheet&quot;</b>. That&apos;s normal: it takes a few seconds, and the preview
            updates by itself.
          </Banner>
        );
      case "unknown":
        return (
          <Banner
            icon={<TriangleAlert aria-hidden="true" />}
            action={
              <button type="button" className={`btn btn-ghost ${s.small}`} onClick={() => setAsking(true)}>
                Change login
              </button>
            }
          >
            GitHub has no account named <b>{profile.login}</b>, so the cards say &quot;No adventurer by that name&quot;.
          </Banner>
        );
      case "busy":
        return (
          <Banner icon={<Hourglass aria-hidden="true" />} action={again()}>
            The card painter is busy right now, so some cards may show a busy message. Wait a minute, then try again.
          </Banner>
        );
      case "failed":
      case "offline":
        return (
          <Banner icon={<TriangleAlert aria-hidden="true" />} action={again()}>
            {status === "failed" ? "We couldn't reach GitHub just now." : "We couldn't reach questlog. Check your connection."} Try
            again in a minute.
          </Banner>
        );
      default:
        return null;
    }
  })();

  const options = spot && sel !== null && (
    <CardOptions
      key={sel}
      spot={spot}
      index={sel}
      count={spots.length}
      onChange={change}
      onRemove={remove}
      onClose={() => setSel(null)}
      onStep={step}
    />
  );

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <h1 className={s.h1}>Profile builder</h1>
          <p className={s.lede}>Write your GitHub profile README here and see it the way GitHub will show it. Follow the four steps.</p>
        </div>
        <button type="button" className={`btn ${s.quiet}`} onClick={() => setTourOpen(true)}>
          <CircleHelp aria-hidden="true" />
          How does this work?
        </button>
      </header>

      {narrow ? (
        <div className={s.stepNow}>
          {now === -1 ? (
            <>
              <Num n={4} state="done" />
              <div>
                <b>All done</b>
                <p>Copy again whenever you change something, and paste it over the old text on GitHub.</p>
              </div>
            </>
          ) : (
            <>
              <Num n={now + 1} state="now" />
              <div>
                <b>
                  {STEPS[now].title} <small>Step {now + 1} of 4</small>
                </b>
                <p>{STEPS[now].phone}</p>
              </div>
            </>
          )}
        </div>
      ) : (
        <ol className={s.steps}>
          <li className={s.step} data-state={state(0)}>
            <span className={s.stepTitle}>
              <Num n={1} state={state(0)} />
              {STEPS[0].title}
            </span>
            <span className={s.who}>
              <img src={profile.avatar || `https://github.com/${profile.login}.png?size=64`} width={28} height={28} alt="" />
              <b>{profile.login}</b>
              <button type="button" className={s.linkBtn} onClick={() => setAsking(true)}>
                Change
              </button>
            </span>
          </li>
          <li className={s.step} data-state={state(1)}>
            <span className={s.stepTitle}>
              <Num n={2} state={state(1)} />
              {STEPS[1].title}
            </span>
            <p>{STEPS[1].wide}</p>
            <button type="button" className={`btn ${now === 1 ? "btn-primary" : "btn-ghost"} ${s.small}`} onClick={openAdd}>
              <Plus aria-hidden="true" />
              Add a card
            </button>
          </li>
          <li className={s.step} data-state={state(2)}>
            <span className={s.stepTitle}>
              <Num n={3} state={state(2)} />
              {STEPS[2].title}
            </span>
            <p>{spots.length ? STEPS[2].wide : "Add a card first, then click it in the preview to change it."}</p>
          </li>
          <li className={s.step} data-state={state(3)}>
            <span className={s.stepTitle}>
              <Num n={4} state={state(3)} />
              {STEPS[3].title}
            </span>
            <p>{STEPS[3].wide}</p>
            <span className={s.stepButtons}>
              <button type="button" className={`btn ${now === 3 || now === -1 ? "btn-primary" : "btn-ghost"} ${s.small}`} onClick={copy}>
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? "Copy again" : "Copy README"}
              </button>
              <button type="button" className={s.linkBtn} onClick={() => setHelpOpen(true)}>
                Where do I paste it?
              </button>
            </span>
          </li>
        </ol>
      )}

      {narrow && (
        <div className={s.tabs} role="tablist" aria-label="Show">
          <button type="button" role="tab" aria-selected={tab === "write"} onClick={() => setTab("write")}>
            <Pencil aria-hidden="true" />
            Write
          </button>
          <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>
            <Eye aria-hidden="true" />
            Preview
          </button>
        </div>
      )}

      <div ref={work} className={s.work} data-tab={narrow ? tab : undefined}>
        <section className={`${s.pane} ${s.writePane}`} aria-label={!narrow && options ? "Card options" : "Your README"}>
          {!narrow && options ? (
            <>
              <div className={s.paneHead}>
                <button type="button" className={`btn ${s.quiet}`} onClick={() => setSel(null)}>
                  <ArrowLeft aria-hidden="true" />
                  Back to the text
                </button>
              </div>
              <div className={s.paneScroll} onKeyDown={(e) => e.key === "Escape" && setSel(null)}>
                {options}
              </div>
            </>
          ) : (
            <>
              <div className={s.paneHead}>
                <span className={s.paneTitle}>
                  <Pencil aria-hidden="true" />
                  Your README
                </span>
                <span className={s.paneTools}>
                  <button type="button" className={`btn ${s.quiet}`} onClick={undo} disabled={!canUndo}>
                    <Undo2 aria-hidden="true" />
                    Undo
                  </button>
                  <button type="button" className={`btn btn-ghost ${s.small}`} onClick={openAdd}>
                    <Plus aria-hidden="true" />
                    Add a card
                  </button>
                </span>
              </div>
              <Editor
                value={text}
                onChange={(t) => setText(t)}
                onCursor={(at) => (cursor.current = at)}
                mark={spot ? [spot.start, spot.end] : null}
                placeholder={`# Hi, I'm ${profile.login}\n\nType your README here, or click Add a card.`}
              />
              <p className={s.editorTip}>
                This is Markdown, the text GitHub turns into your profile. Your cards are the lines with <code>questlog</code> in
                them.
              </p>
            </>
          )}
        </section>

        <section className={`${s.pane} ${s.previewPane}`} aria-label="Preview">
          <div className={s.paneHead}>
            <span className={s.paneTitle}>
              <Eye aria-hidden="true" />
              Preview: your GitHub profile
            </span>
            <span className={s.themeSwitch} role="radiogroup" aria-label="GitHub theme">
              {(["light", "dark"] as const).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => setTheme(t)}>
                  {t === "light" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
                  {t === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </span>
          </div>
          {notice}
          <div className={s.paneScroll} data-scroll>
            <ProfilePreview
              text={shown}
              spots={shownSpots}
              theme={theme}
              profile={profile}
              ownHost={env.host}
              v={v}
              selected={sel}
              flash={flash}
              onPick={pick}
              empty={
                <div className={s.emptyState}>
                  <p>
                    <b>Your README is empty.</b>
                  </p>
                  <p>
                    {narrow ? "Tap" : "Click"} Add a card to put your first card here, or write some text. A first line could be:{" "}
                    <code># Hi, I&apos;m {profile.name}</code>
                  </p>
                  <button type="button" className={`btn btn-primary ${s.small}`} onClick={openAdd}>
                    <Plus aria-hidden="true" />
                    Add a card
                  </button>
                </div>
              }
            />
          </div>
        </section>
      </div>

      {narrow && (
        <div className={s.dock}>
          <button type="button" className={`btn ${now === 1 ? "btn-primary" : "btn-ghost"}`} onClick={openAdd}>
            <Plus aria-hidden="true" />
            Add a card
          </button>
          <button type="button" className={`btn ${now === 3 || now === -1 ? "btn-primary" : "btn-ghost"}`} onClick={copy}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? "Copy again" : "Copy README"}
          </button>
        </div>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} label="Add a card">
        <AddCard scene={lastScene} night={lastNight} where={where} onAdd={add} onClose={() => setAdding(false)} />
      </Sheet>
      <Sheet open={narrow && !!options} onClose={() => setSel(null)} label="Card options">
        {options}
      </Sheet>
      <Sheet
        open={helpOpen}
        onClose={() => {
          setHelpOpen(false);
          setJustCopied(false);
        }}
        label="Where to paste your README"
        wide
      >
        <CopyHelp
          login={profile.login}
          copied={justCopied}
          onCopy={copy}
          onClose={() => {
            setHelpOpen(false);
            setJustCopied(false);
          }}
        />
      </Sheet>
      <Sheet open={tourOpen} onClose={() => setTourOpen(false)} label="How the builder works">
        <div className={s.opts}>
          <div className={s.optsHead}>
            <h3 className={`display ${s.optsName}`}>How it works</h3>
            <CloseButton onClick={() => setTourOpen(false)} label="Close" />
          </div>
          <TourSteps />
          <p className={s.help}>
            Your work stays in this browser, so you can close the page and come back. Nothing is sent to GitHub until you paste
            it there yourself.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setTourOpen(false)}>
            Got it
          </button>
        </div>
      </Sheet>

      {toast && (
        <div className={s.toast} role="status" key={toast.n}>
          <span>{toast.text}</span>
          {toast.undo && (
            <button type="button" className={s.linkBtn} onClick={undo}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
