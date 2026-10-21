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
  RotateCcw,
  LayoutTemplate,
  FileText,
  Sun,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { DECORATIONS, HOST, cardName, type Widget } from "../data";
import { HOSTS, autoAlt, findSpots, getParam, insertAt, kindName, removeSpot, renameUser, replaceSpot, setParam, writeSpot, type Card, type Spot } from "./cards";
import Coach, { type CoachStep } from "./Coach";
import { TEMPLATES, template, type TemplateKind } from "./templates";
import CardOptions, { type Mode } from "./CardOptions";
import AddCard from "./AddCard";
import CopyHelp, { AnywhereHelp } from "./CopyHelp";
import Editor from "./Editor";
import LoginStep, { type Profile, type Purpose, type Start } from "./LoginStep";
import ProfilePreview from "./ProfilePreview";
import { Sheet } from "./ui";
import { m, rich } from "@/i18n";
import type { Theme } from "./render";
import s from "./builder.module.css";

const KEY = "questlog-profile";
/** The old card maker's saved picks: only its login is reused. */
const OLD_KEY = "questlog-builder";

/** What the server says about the login, from its X-Questlog header. */
type Status = "card" | "placeholder" | "unknown" | "busy" | "failed" | "error" | "offline" | "checking";

type Saved = {
  profile: Profile | null;
  text: string;
  theme: Theme;
  tour: boolean;
  coached: boolean;
  purpose: Purpose;
  /** The profile README as it came from GitHub, for Back to my README. */
  original: string | null;
  changed: boolean;
  copied: boolean;
};

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
        coached: v.coached === true,
        purpose: v.purpose === "other" ? "other" : "profile",
        original: typeof v.original === "string" ? v.original : null,
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

/** Whether the text reached the clipboard. */
async function toClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      // no clipboard at all
    }
    ta.remove();
    return ok;
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

const STEPS = m.builder.profile.steps;

/** The same four steps, for a page that is not a GitHub profile. */
const OTHER_STEPS = [{ ...STEPS[0], title: m.builder.profile.otherLoginTitle }, STEPS[1], STEPS[2], m.builder.profile.otherCopyStep];

type Toast = { text: string; undo?: boolean; error?: boolean; n: number };

type Pixels = "fine" | "chunky" | "mixed";

/** Whether a card (and its night card, in a picture block) draws chunky pixels. */
const chunky = (sp: Spot) => getParam(sp.card, "pixels") === "chunky";

/** The pixel style of every card at once: fine, chunky, or mixed when they differ. No cards counts as fine. */
function pixelsOf(spots: Spot[]): Pixels {
  const n = spots.filter(chunky).length;
  return n === 0 ? "fine" : n === spots.length ? "chunky" : "mixed";
}

/** The guided tour, opened once right after the login (or from "How does this work?"), worded for a GitHub profile or
 * for any other page. With no card yet, it starts by adding one for the reader. */
function coachSteps(purpose: Purpose, empty: boolean, addFirst: () => void, noLogin = false): CoachStep[] {
  const other = purpose === "other";
  const words = m.builder.profile.tour;
  const first: CoachStep[] = empty
    ? [
        {
          target: '[data-coach="add"]',
          title: words.addFirst.title,
          body: noLogin ? words.addFirst.bodyNoLogin : words.addFirst.body,
          action: { label: words.addFirst.action, run: addFirst },
        },
      ]
    : [];
  return [
    ...first,
    {
      target: "[data-spot]",
      tab: "preview",
      title: words.card.title,
      body: words.card.body,
    },
    {
      target: '[data-coach="pixels"]',
      tab: "preview",
      title: words.pixels.title,
      body: words.pixels.body,
    },
    {
      target: '[data-coach="theme"]',
      tab: "preview",
      title: words.theme.title,
      body: other ? words.theme.bodyOther : words.theme.bodyProfile,
    },
    {
      target: '[data-coach="editor"]',
      tab: "write",
      title: other ? words.editor.titleOther : words.editor.titleProfile,
      body: other ? words.editor.bodyOther : words.editor.bodyProfile,
    },
    { target: '[data-coach="templates"]', tab: "write", title: words.templates.title, body: words.templates.body },
    ...(empty
      ? []
      : [
          {
            target: '[data-coach="add"]',
            title: words.more.title,
            body: words.more.body,
          },
        ]),
    {
      target: '[data-coach="copy"]',
      title: other ? words.copy.titleOther : words.copy.titleProfile,
      body: other ? words.copy.bodyOther : words.copy.bodyProfile,
    },
  ];
}

/** How long a message stays: longer when it can be undone, longest when it says something went wrong. */
const life = (t: Toast) => (t.error ? 9000 : t.undo ? 7000 : 4500);

/** A message at the bottom of the screen with a bar showing the time it has left. Shown as a popover, so it stays
 * on top of an open dialog. */
function ToastNote({ toast, onUndo }: { toast: Toast; onUndo: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      ref.current?.showPopover?.();
    } catch {
      // without popovers the message still shows, under any open dialog
    }
  }, []);
  return (
    <div
      ref={ref}
      popover="manual"
      className={s.toast}
      role={toast.error ? "alert" : "status"}
      style={{ "--life": `${life(toast)}ms` } as React.CSSProperties}
    >
      <span>{toast.text}</span>
      {toast.undo && (
        <button type="button" className={s.linkBtn} onClick={onUndo}>
          {m.builder.profile.undo}
        </button>
      )}
    </div>
  );
}

/** Left and right arrows move a tab row or a radio group to its neighbour and focus it, as screen readers expect. */
function arrows<T extends string>(values: readonly T[], value: T, set: (v: T) => void) {
  return (e: React.KeyboardEvent<HTMLElement>) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = (values.indexOf(value) + d + values.length) % values.length;
    set(values[i]);
    (e.currentTarget.children[i] as HTMLElement | undefined)?.focus();
  };
}

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
  const [coached, setCoached] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coach, setCoach] = useState<CoachStep[]>([]);
  const [purpose, setPurpose] = useState<Purpose>("profile");
  const other = purpose === "other";
  // "Something else" without a login: only the decorations, which need no GitHub account
  const noLogin = profile?.login === "";
  const [changed, setChanged] = useState(false);
  const [copied, setCopied] = useState(false);
  const [justCopied, setJustCopied] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [original, setOriginal] = useState<string | null>(null);
  const [tab, setTab] = useState<"write" | "preview">("preview");
  const [status, setStatus] = useState<Status>("checking");
  const [retry, setRetry] = useState(0);
  const [v, setV] = useState(0);
  const [flash, setFlash] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const cursor = useRef<number | null>(null);
  const changeBtn = useRef<HTMLButtonElement>(null);
  const optionsPane = useRef<HTMLDivElement>(null);
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
    setCoached(r.coached ?? false);
    setPurpose(r.purpose ?? "profile");
    setOriginal(r.original ?? null);
    setChanged(r.changed ?? false);
    setCopied(r.copied ?? false);
    // cards name questlog.cc; only a self-hosted copy on its own domain names itself
    const ours = HOSTS.includes(location.host) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    setEnv({ origin: ours ? HOST : location.origin, host: location.host });
    setReady(true);
  }, []);

  // saved a moment after the last change, not on every key
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => {
      try {
        const saved: Saved = { profile, text, theme, tour, coached, purpose, original, changed, copied };
        localStorage.setItem(KEY, JSON.stringify(saved));
      } catch {
        // storage can be unavailable (private mode); the work then lasts for this visit
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [ready, profile, text, theme, tour, coached, purpose, original, changed, copied]);

  // typing settles for a moment before the preview redraws, so cards are not asked for on every key
  useEffect(() => {
    const t = window.setTimeout(() => setShown(text), 400);
    return () => window.clearTimeout(t);
  }, [text]);

  useEffect(() => {
    if (!profile) return;
    if (!profile.login) {
      setStatus("card"); // no login, no stats to wait for
      return;
    }
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
        // nobody is looking: wait without using up the tries
        if (document.hidden) {
          n--;
          continue;
        }
        const k = await probe(profile.login);
        if (stop || k === "placeholder") continue;
        setStatus(k);
        if (k === "card") setV((x) => x + 1);
        return;
      }
      // three minutes without the stats: say so instead of promising they are coming
      if (!stop) setStatus("failed");
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
    const t = window.setTimeout(() => setToast(null), life(toast));
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
  const say = (t: string, o: { undo?: boolean; error?: boolean } = {}) => setToast({ text: t, ...o, n: Date.now() });

  // the tour opens by itself once, right after the login; its steps are fixed when it opens
  const openCoach = () => {
    setCoach(coachSteps(purpose, spots.length === 0, () => (noLogin ? addDecoration("reading-nook") : add("stats", "forest")), noLogin));
    setCoachOpen(true);
  };
  useEffect(() => {
    if (!ready || coached || coachOpen || !profile || asking || adding || sel !== null) return;
    const t = window.setTimeout(openCoach, 700);
    return () => window.clearTimeout(t);
  });

  const endCoach = (finished: boolean) => {
    setCoachOpen(false);
    setCoached(true);
    if (!finished) say(m.builder.profile.tourSkipped);
  };

  const pixels = pixelsOf(spots);
  /** Every card to one pixel style; each card can still be changed on its own afterwards (the chooser then says Mixed). */
  const setPixels = (to: "fine" | "chunky") => {
    if (!spots.length || pixels === to) return;
    let next = text;
    for (const sp of [...spots].reverse()) {
      const mode: Mode = sp.kind === "picture" && sp.dark ? "auto" : "single";
      next = replaceSpot(next, sp, setParam(sp.card, "pixels", to === "chunky" ? "chunky" : ""), mode);
    }
    edit(next, { now: true });
    setChanged(true);
    say(m.builder.profile.pixelsSet(to), { undo: true });
  };

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
    if (start === "github") {
      setOriginal(t);
      say(m.builder.profile.loadedReadme);
    } else if (start === "fresh") setOriginal(null);
  };

  const change = (card: Card, mode: Mode, typing = false) => {
    if (!spot) return;
    // a changed card on an older questlog address moves to the current one
    const moved = HOSTS.includes(new URL(card.origin).host) ? { ...card, origin: env.origin } : card;
    edit(replaceSpot(text, spot, moved, mode), { now: !typing, typing });
    setChanged(true);
  };

  const remove = () => {
    if (!spot) return;
    const name = kindName(spot.card);
    edit(removeSpot(text, spot), { now: true });
    setSel(null);
    say(m.builder.profile.removed(name), { undo: true });
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
      hash: "",
    };
    const r = insertAt(text, cursor.current ?? text.length, writeSpot(card, autoAlt(card), mode));
    edit(r.text, { now: true });
    cursor.current = r.end;
    setFlash(findSpots(r.text, env.host).findIndex((x) => x.start === r.start));
    setAdding(false);
    if (narrow) setTab("preview");
    say(m.builder.profile.added(cardName(w, scene), narrow));
  };

  const addDecoration = (name: string) => {
    const d = DECORATIONS.find((x) => x.name === name);
    // like a card: switches with dark mode, or stays at night, when the last image in the README does
    const last = spots[spots.length - 1];
    const mode: Mode = last && last.kind === "picture" && last.dark ? "auto" : "single";
    const card: Card = {
      origin: env.origin,
      user: "",
      widget: "decorations",
      scene: name,
      night: mode === "single" && !!last?.card.night,
      params: d?.title ? [["title", d.title]] : [],
      hash: "",
    };
    const r = insertAt(text, cursor.current ?? text.length, writeSpot(card, autoAlt(card), mode));
    edit(r.text, { now: true });
    cursor.current = r.end;
    setFlash(findSpots(r.text, env.host).findIndex((x) => x.start === r.start));
    setAdding(false);
    if (narrow) setTab("preview");
    say(m.builder.profile.addedDecoration(d?.label ?? name, narrow));
  };

  const applyTemplate = (kind: TemplateKind) => {
    if (!profile) return;
    const next = template(kind, { origin: env.origin, login: profile.login, name: profile.name, other });
    edit(next, { now: true });
    cursor.current = null;
    setSel(null);
    setTemplatesOpen(false);
    setChanged(true);
    if (narrow) setTab("preview");
    say(m.builder.templates.applied(m.builder.templates.names[kind]), { undo: true });
  };
  const backToReadme = () => {
    if (original === null) return;
    edit(original, { now: true });
    cursor.current = null;
    setSel(null);
    setTemplatesOpen(false);
    say(m.builder.templates.restored, { undo: true });
  };

  const copy = async () => {
    if (!(await toClipboard(text))) {
      setTab("write");
      say(m.builder.profile.copyFailed, { error: true });
      return;
    }
    setCopied(true);
    setJustCopied(true);
    setHelpOpen(true);
  };

  /** `i` counts the cards of the preview, which can lag the text by a moment of typing: the same card is found in the
   * text by what it says, the nearest one when it is there twice. */
  const pick = (i: number) => {
    setAdding(false);
    // keyboard users land in the options they just opened
    if (!narrow) window.setTimeout(() => optionsPane.current?.focus());
    if (shown === text) return setSel(i);
    const was = shownSpots[i];
    if (!was) return;
    const said = shown.slice(was.start, was.end);
    const same = spots.flatMap((x, j) => (text.slice(x.start, x.end) === said ? [j] : []));
    if (same.length) setSel(same.reduce((a, b) => (Math.abs(b - i) < Math.abs(a - i) ? b : a)));
  };
  const step = (d: -1 | 1) => setSel((i) => (i === null ? i : (i + d + spots.length) % spots.length));

  if (!ready)
    return (
      <div className={s.loading} role="status">
        <span className="visually-hidden">{m.builder.profile.loading}</span>
      </div>
    );

  if (!profile || asking) {
    return (
      <div className={s.page}>
        <h1 className={s.kicker}>{other ? m.builder.profile.cardBuilder : m.builder.profile.profileBuilder}</h1>
        <LoginStep
          initial={profile?.login ?? firstLogin}
          current={profile?.login ?? ""}
          draft={text}
          tour={tour && !profile}
          onTourDone={() => setTour(false)}
          onDone={onLogin}
          purpose={purpose}
          onPurpose={setPurpose}
          onCancel={
            profile
              ? () => {
                  setAsking(false);
                  window.setTimeout(() => changeBtn.current?.focus());
                }
              : undefined
          }
        />
      </div>
    );
  }

  const steps = other ? OTHER_STEPS : STEPS;
  const done = [true, spots.length > 0, changed, copied];
  const now = copied ? -1 : done.findIndex((d) => !d);
  const state = (i: number) => (done[i] && i !== now ? "done" : i === now ? "now" : "next");
  const lastScene = spots[spots.length - 1]?.card.scene ?? "forest";
  const lastNight = !!spots[spots.length - 1]?.card.night && !spots[spots.length - 1]?.dark;
  const where =
    cursor.current === null || cursor.current >= text.trimEnd().length
      ? m.builder.profile.whereEnd
      : m.builder.profile.whereCursor;

  const notice = (() => {
    const again = (label = m.builder.profile.notice.tryAgain) => (
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
          <Banner icon={<Hourglass aria-hidden="true" />} action={again(m.builder.profile.notice.checkNow)}>
            {rich(m.builder.profile.notice.placeholder(profile.login), { b: (c) => <b>{c}</b> })}
          </Banner>
        );
      case "unknown":
        return (
          <Banner
            icon={<TriangleAlert aria-hidden="true" />}
            action={
              <button type="button" className={`btn btn-ghost ${s.small}`} onClick={() => setAsking(true)}>
                {m.builder.profile.changeLogin}
              </button>
            }
          >
            {rich(m.builder.profile.notice.unknown(profile.login), { b: (c) => <b>{c}</b> })}
          </Banner>
        );
      case "busy":
        return (
          <Banner icon={<Hourglass aria-hidden="true" />} action={again()}>
            {m.builder.profile.notice.busy}
          </Banner>
        );
      case "failed":
      case "offline":
        return (
          <Banner icon={<TriangleAlert aria-hidden="true" />} action={again()}>
            {status === "failed" ? m.builder.profile.notice.failed : m.builder.profile.notice.offline}
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
          <h1 className={s.h1}>{other ? m.builder.profile.cardBuilder : m.builder.profile.profileBuilder}</h1>
          <p className={s.lede}>
            {other
              ? m.builder.profile.ledeOther
              : m.builder.profile.ledeProfile}
          </p>
        </div>
        <button type="button" className={`btn ${s.quiet}`} onClick={openCoach}>
          <CircleHelp aria-hidden="true" />
          {m.builder.profile.howItWorks}
        </button>
      </header>

      {narrow && (
        <span className={`${s.who} ${s.whoNarrow}`}>
          {!noLogin && <img src={profile.avatar || `https://github.com/${profile.login}.png?size=64`} width={28} height={28} alt="" />}
          <b>{noLogin ? m.builder.profile.noLogin : profile.login}</b>
          <button ref={changeBtn} type="button" className={s.linkBtn} onClick={() => setAsking(true)}>
            {m.builder.profile.changeLogin}
          </button>
        </span>
      )}
      {narrow ? (
        <div className={s.stepNow}>
          {now === -1 ? (
            <>
              <Num n={4} state="done" />
              <div>
                <b>{m.builder.profile.allDone}</b>
                <p>{m.builder.profile.allDoneBody(other)}</p>
              </div>
            </>
          ) : (
            <>
              <Num n={now + 1} state="now" />
              <div>
                <b>
                  {steps[now].title} <small>{m.builder.profile.stepOf(now + 1)}</small>
                </b>
                <p>{steps[now].phone}</p>
              </div>
            </>
          )}
        </div>
      ) : (
        <ol className={s.steps}>
          <li className={s.step} data-state={state(0)}>
            <span className={s.stepTitle}>
              <Num n={1} state={state(0)} />
              {steps[0].title}
            </span>
            {noLogin ? (
              <span className={s.who}>
                <b>{m.builder.profile.noLogin}</b>
                <button ref={changeBtn} type="button" className={s.linkBtn} onClick={() => setAsking(true)}>
                  {m.builder.profile.addLogin}
                </button>
              </span>
            ) : (
              <span className={s.who}>
                <img src={profile.avatar || `https://github.com/${profile.login}.png?size=64`} width={28} height={28} alt="" />
                <b>{profile.login}</b>
                <button ref={changeBtn} type="button" className={s.linkBtn} onClick={() => setAsking(true)}>
                  {m.builder.profile.change}
                </button>
              </span>
            )}
          </li>
          <li className={s.step} data-state={state(1)}>
            <span className={s.stepTitle}>
              <Num n={2} state={state(1)} />
              {steps[1].title}
            </span>
            <p>{steps[1].wide}</p>
            <button
              type="button"
              className={`btn ${now === 1 ? "btn-primary" : "btn-ghost"} ${s.small}`}
              onClick={openAdd}
              data-coach="add"
            >
              <Plus aria-hidden="true" />
              {m.builder.profile.addCard}
            </button>
          </li>
          <li className={s.step} data-state={state(2)}>
            <span className={s.stepTitle}>
              <Num n={3} state={state(2)} />
              {steps[2].title}
            </span>
            <p>{spots.length ? steps[2].wide : m.builder.profile.addFirstThenClick}</p>
          </li>
          <li className={s.step} data-state={state(3)}>
            <span className={s.stepTitle}>
              <Num n={4} state={state(3)} />
              {steps[3].title}
            </span>
            <p>{steps[3].wide}</p>
            <span className={s.stepButtons}>
              <button
                type="button"
                className={`btn ${now === 3 || now === -1 ? "btn-primary" : "btn-ghost"} ${s.small}`}
                onClick={copy}
                data-coach="copy"
              >
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? m.builder.profile.copyAgain : other ? m.builder.profile.copyText : m.builder.profile.copyReadme}
              </button>
              <button type="button" className={s.linkBtn} onClick={() => setHelpOpen(true)}>
                {m.builder.profile.wherePaste}
              </button>
            </span>
          </li>
        </ol>
      )}

      {narrow && (
        <div className={s.tabs} role="tablist" aria-label={m.builder.profile.show} onKeyDown={arrows(["write", "preview"] as const, tab, setTab)}>
          <button type="button" role="tab" aria-selected={tab === "write"} tabIndex={tab === "write" ? 0 : -1} onClick={() => setTab("write")}>
            <Pencil aria-hidden="true" />
            {m.builder.profile.write}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "preview"}
            tabIndex={tab === "preview" ? 0 : -1}
            onClick={() => setTab("preview")}
          >
            <Eye aria-hidden="true" />
            {m.builder.profile.preview}
          </button>
        </div>
      )}

      <div ref={work} className={s.work} data-tab={narrow ? tab : undefined}>
        <section
          className={`${s.pane} ${s.writePane}`}
          aria-label={!narrow && options ? m.builder.profile.cardOptions : other ? m.builder.profile.yourText : m.builder.profile.yourReadme}
          data-coach="editor"
        >
          {!narrow && options ? (
            <>
              <div className={s.paneHead}>
                <button type="button" className={`btn ${s.quiet}`} onClick={() => setSel(null)}>
                  <ArrowLeft aria-hidden="true" />
                  {m.builder.profile.backToText}
                </button>
              </div>
              <div
                ref={optionsPane}
                tabIndex={-1}
                className={s.paneScroll}
                onKeyDown={(e) => e.key === "Escape" && setSel(null)}
              >
                {options}
              </div>
            </>
          ) : (
            <>
              <div className={s.paneHead}>
                <span className={s.paneTitle}>
                  <Pencil aria-hidden="true" />
                  {other ? m.builder.profile.yourText : m.builder.profile.yourReadme}
                </span>
                <span className={s.paneTools}>
                  <button type="button" className={`btn ${s.quiet}`} onClick={() => setTemplatesOpen(true)} data-coach="templates">
                    <LayoutTemplate aria-hidden="true" />
                    {m.builder.templates.button}
                  </button>
                  <button type="button" className={`btn ${s.quiet}`} onClick={() => setResetOpen(true)}>
                    <RotateCcw aria-hidden="true" />
                    {m.builder.profile.reset}
                  </button>
                  <button type="button" className={`btn ${s.quiet}`} onClick={undo} disabled={!canUndo}>
                    <Undo2 aria-hidden="true" />
                    {m.builder.profile.undo}
                  </button>
                  <button type="button" className={`btn btn-ghost ${s.small}`} onClick={openAdd}>
                    <Plus aria-hidden="true" />
                    {m.builder.profile.addCard}
                  </button>
                </span>
              </div>
              <Editor
                value={text}
                onChange={(t) => edit(t, { typing: true })}
                onCursor={(at) => (cursor.current = at)}
                mark={spot ? [spot.start, spot.end] : null}
                placeholder={m.builder.profile.editorPlaceholder(profile.login)}
              />
              <p className={s.editorTip}>
                {rich(other ? m.builder.profile.editorTipOther : m.builder.profile.editorTipProfile, { code: (c) => <code>{c}</code> })}
              </p>
            </>
          )}
        </section>

        <section className={`${s.pane} ${s.previewPane}`} aria-label={m.builder.profile.preview}>
          <div className={s.paneHead}>
            <span className={s.paneTitle}>
              <Eye aria-hidden="true" />
              {purpose === "other" ? m.builder.profile.previewOther : m.builder.profile.previewProfile}
            </span>
            <span className={s.paneTools}>
            <span
              className={s.themeSwitch}
              role="radiogroup"
              aria-label={m.builder.profile.pixelStyle}
              data-coach="pixels"
              onKeyDown={arrows(["fine", "chunky"] as const, pixels === "mixed" ? "fine" : pixels, setPixels)}
            >
              {(["fine", "chunky", "mixed"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={pixels === p}
                  aria-disabled={p === "mixed" || !spots.length}
                  tabIndex={pixels === p || (pixels === "mixed" && p === "fine") ? 0 : -1}
                  title={
                    p === "mixed"
                      ? m.builder.profile.pixelMixedTitle
                      : m.builder.profile.pixelTitle(p)
                  }
                  onClick={() => p !== "mixed" && setPixels(p)}
                >
                  {m.builder.profile.pixelLabels[p]}
                </button>
              ))}
            </span>
            <span
              className={s.themeSwitch}
              role="radiogroup"
              aria-label={m.builder.profile.githubTheme}
              data-coach="theme"
              onKeyDown={arrows(["light", "dark"] as const, theme, setTheme)}
            >
              {(["light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={theme === t}
                  tabIndex={theme === t ? 0 : -1}
                  onClick={() => setTheme(t)}
                >
                  {t === "light" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
                  {t === "light" ? m.builder.profile.light : m.builder.profile.dark}
                </button>
              ))}
            </span>
            </span>
          </div>
          {notice}
          <div className={s.paneScroll} data-scroll>
            <ProfilePreview
              plain={purpose === "other"}
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
                    <b>{other ? m.builder.profile.emptyOther : m.builder.profile.emptyProfile}</b>
                  </p>
                  <p>
                    {m.builder.profile.emptyHint(narrow)} <code>{m.builder.profile.emptyFirstLine(profile.name)}</code>
                  </p>
                  <button type="button" className={`btn btn-primary ${s.small}`} onClick={openAdd}>
                    <Plus aria-hidden="true" />
                    {m.builder.profile.addCard}
                  </button>
                </div>
              }
            />
          </div>
        </section>
      </div>

      {narrow && (
        <div className={s.dock}>
          <button type="button" className={`btn ${now === 1 ? "btn-primary" : "btn-ghost"}`} onClick={openAdd} data-coach="add">
            <Plus aria-hidden="true" />
            {m.builder.profile.addCard}
          </button>
          <button
            type="button"
            className={`btn ${now === 3 || now === -1 ? "btn-primary" : "btn-ghost"}`}
            onClick={copy}
            data-coach="copy"
          >
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? m.builder.profile.copyAgain : other ? m.builder.profile.copyText : m.builder.profile.copyReadme}
          </button>
        </div>
      )}

      <Sheet open={templatesOpen} onClose={() => setTemplatesOpen(false)} label={m.builder.templates.title}>
        <div className={s.opts}>
          <h3 className={`display ${s.optsName}`}>{m.builder.templates.title}</h3>
          <p className={s.help}>{m.builder.templates.sub}</p>
          <div className={s.choices}>
            {original !== null && (
              <button type="button" className={s.choice} onClick={backToReadme}>
                <FileText aria-hidden="true" />
                <span>
                  <b>{m.builder.templates.backToReadme}</b>
                  <small>{m.builder.templates.backToReadmeHelp}</small>
                </span>
              </button>
            )}
            {TEMPLATES.map((k) => (
              <button key={k} type="button" className={s.choice} onClick={() => applyTemplate(k)}>
                <LayoutTemplate aria-hidden="true" />
                <span>
                  <b>{m.builder.templates.names[k]}</b>
                  <small>{(noLogin ? m.builder.templates.describeNoLogin : m.builder.templates.describe)[k]}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </Sheet>
      <Sheet open={resetOpen} onClose={() => setResetOpen(false)} label={m.builder.profile.resetTitle}>
        <div className={s.opts}>
          <h3 className={`display ${s.optsName}`}>{m.builder.profile.resetTitle}</h3>
          <p className={s.help}>{m.builder.profile.resetText}</p>
          <div className={s.stepButtons}>
            <button type="button" className="btn btn-ghost" onClick={() => setResetOpen(false)}>
              {m.builder.profile.resetCancel}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                // everything the builder keeps is this one entry; a reload starts it fresh at step 1
                try {
                  localStorage.removeItem(KEY);
                } catch {}
                location.reload();
              }}
            >
              {m.builder.profile.resetConfirm}
            </button>
          </div>
        </div>
      </Sheet>
      <Sheet open={adding} onClose={() => setAdding(false)} label={m.builder.profile.addCard}>
        <AddCard
          scene={lastScene}
          night={lastNight}
          where={where}
          onAdd={add}
          onAddDecoration={addDecoration}
          onClose={() => setAdding(false)}
          noLogin={noLogin}
        />
      </Sheet>
      <Sheet open={narrow && !!options} onClose={() => setSel(null)} label={m.builder.profile.cardOptions}>
        {options}
      </Sheet>
      <Sheet
        open={helpOpen}
        onClose={() => {
          setHelpOpen(false);
          setJustCopied(false);
        }}
        label={m.builder.profile.pasteLabel}
        wide
      >
        {purpose === "other" ? (
          <AnywhereHelp
            copied={justCopied}
            onCopy={copy}
            onClose={() => {
              setHelpOpen(false);
              setJustCopied(false);
            }}
          />
        ) : (
      <CopyHelp
            login={profile.login}
            copied={justCopied}
            onCopy={copy}
            onClose={() => {
              setHelpOpen(false);
              setJustCopied(false);
            }}
          />
        )}
      </Sheet>
      {coachOpen && <Coach steps={coach} onTab={setTab} onDone={endCoach} />}

      {toast && <ToastNote key={toast.n} toast={toast} onUndo={undo} />}
    </div>
  );
}
