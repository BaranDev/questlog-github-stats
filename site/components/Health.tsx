"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import s from "./Health.module.css";

/** What the public /health answers: no counts or capacities, only states and times. */
type PublicData = {
  ok: boolean;
  now: number;
  started_at: number;
  fetching: { paused: boolean; back_in_secs: number | null };
  new_users: { open: boolean; next_opening_secs: number | null };
};

/** What /admin/health answers (the keys this page reads). */
type HealthData = {
  ok: boolean;
  version: string;
  now: number;
  started_at: number;
  queue: number;
  cache: { entries: number; bytes: number; budget: number; hits: number; misses: number };
  renders: { busy: number; slots: number };
  scenes: string[];
  github: { remaining: number | null; limit: number; resets_at: number | null; paused_secs: number };
  new_users: { this_hour: number; per_hour: number; oldest_frees_in_secs: number | null };
  waiting: { new: number; new_capacity: number; refresh: number; refresh_capacity: number };
};

const EVERY = 30; // seconds between automatic checks
const REST = 10; // seconds the Refresh button rests after a press

const utc = (secs: number) => new Date(secs * 1000).toISOString().slice(11, 16) + " UTC";
const clockUtc = (d: Date) => d.toISOString().slice(11, 19) + " UTC";
const mins = (secs: number) => {
  const m = Math.max(1, Math.ceil(secs / 60));
  return m === 1 ? "1 minute" : `${m} minutes`;
};
const num = (n: number) => n.toLocaleString("en-US");
const mb = (b: number) =>
  b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(b < 10485760 ? 1 : 0)} MB`;

function since(secs: number) {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d} day${d === 1 ? "" : "s"} ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${Math.max(1, m)} min`;
}

type Tone = "good" | "watch" | "bad";

/** A pixel meter: 20 blocks, filled by share, coloured by tone. */
function Meter({ share, tone, label }: { share: number; tone: Tone; label: string }) {
  const filled = Math.round(Math.min(1, Math.max(0, share)) * 20);
  return (
    <div className={s.meter} data-tone={tone} role="img" aria-label={label}>
      {Array.from({ length: 20 }, (_, i) => (
        <span key={i} className={i < filled ? s.on : undefined} />
      ))}
    </div>
  );
}

function Panel({ title, tone, value, of, meter, children }: {
  title: string;
  tone: Tone;
  value: string;
  of?: string;
  meter?: { share: number; label: string };
  children: React.ReactNode;
}) {
  const word = { good: "Fine", watch: "Busy", bad: "Needs attention" }[tone];
  return (
    <section className={s.panel} aria-label={title}>
      <header className={s.panelHead}>
        <h2>{title}</h2>
        <span className={s.chip} data-tone={tone}>
          {word}
        </span>
      </header>
      <p className={s.value}>
        {value}
        {of && <span className={s.of}> {of}</span>}
      </p>
      {meter && <Meter share={meter.share} tone={tone} label={meter.label} />}
      <div className={s.notes}>{children}</div>
    </section>
  );
}

/** Used share to tone: under 70% fine, under 90% busy, then needs attention. */
const toneOfUsed = (used: number): Tone => (used < 0.7 ? "good" : used < 0.9 ? "watch" : "bad");

/** `full`: the admin view with every number, from /admin/health (behind a login). */
export default function Health({ full = false }: { full?: boolean }) {
  const url = full ? "/admin/health" : "/health";
  const [data, setData] = useState<HealthData | PublicData | null>(null);
  const [at, setAt] = useState<Date | null>(null);
  const [failedAt, setFailedAt] = useState<Date | null>(null);
  const [asking, setAsking] = useState(false);
  const [rest, setRest] = useState(0);
  const [, tick] = useState(0);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setAsking(true);
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setData(await r.json());
      setAt(new Date());
      setFailedAt(null);
    } catch {
      setFailedAt(new Date()); // the last good numbers stay on screen
    } finally {
      busy.current = false;
      setAsking(false);
    }
  }, [url]);

  // checks every EVERY seconds while the tab is visible, and at once when it comes back
  useEffect(() => {
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), EVERY * 1000);
    const back = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", back);
    };
  }, [load]);

  // a one second clock for the countdowns and the Refresh rest
  useEffect(() => {
    const id = setInterval(() => {
      tick((n) => n + 1);
      setRest((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const refresh = () => {
    if (rest > 0 || asking) return;
    setRest(REST);
    load();
  };

  // server time now, moved on by the seconds since the last answer, so countdowns run between checks
  const drift = at ? Math.floor((Date.now() - at.getTime()) / 1000) : 0;
  const now = data ? data.now + drift : 0;

  const down = !data && failedAt;
  const calm = data && "fetching" in data ? !data.fetching.paused && data.new_users.open : true;
  const headline = !data
    ? down
      ? "The service is not answering"
      : "Checking the service"
    : failedAt
      ? "The service stopped answering"
      : !data.ok
        ? "Something is wrong"
        : calm
          ? "All is well"
          : "Running, but busy";

  return (
    <div className={s.page}>
      <header className={s.header}>
        <p className={s.eyebrow}>Service health</p>
        <div className={s.titleRow}>
          <h1 className={s.h1}>
            <span
              className={s.dot}
              data-tone={!data ? (down ? "bad" : "wait") : failedAt ? "bad" : calm ? "good" : "watch"}
              aria-hidden="true"
            />
            {headline}
          </h1>
          <button type="button" className={`btn btn-ghost ${s.refresh}`} onClick={refresh} disabled={rest > 0 || asking}>
            <RefreshCw aria-hidden="true" className={asking ? s.spin : undefined} />
            {asking ? "Updating" : rest > 0 ? `Refresh in ${rest} s` : "Refresh"}
          </button>
        </div>
        <p className={s.updated} aria-live="polite">
          {at ? `Updated at ${clockUtc(at)}. Checks again every ${EVERY} seconds by itself.` : "Asking the server for its numbers."}
          {failedAt && (
            <span className={s.failed}>
              {" "}
              The check at {clockUtc(failedAt)} got no answer{data ? ", so these are the last numbers that came in" : ""}. The page
              keeps trying.
            </span>
          )}
        </p>
      </header>

      {!data ? (
        <div className={s.grid} aria-busy={!down} aria-label="Loading">
          {Array.from({ length: full ? 6 : 3 }, (_, i) => (
            <div key={i} className={`${s.panel} ${s.shimmer}`} />
          ))}
        </div>
      ) : "fetching" in data ? (
        <PublicPanels d={data} now={now} />
      ) : (
        <Panels d={data} now={now} />
      )}

      <p className={s.raw}>
        The same as JSON{full ? "" : ", for scripts and uptime monitors"}: <a href={url}>{url}</a>. Times are in UTC.
      </p>
    </div>
  );
}

function PublicPanels({ d, now }: { d: PublicData; now: number }) {
  const back = d.fetching.back_in_secs;
  const next = d.new_users.next_opening_secs;
  return (
    <div className={s.grid}>
      <Panel title="Cards" tone={d.ok ? "good" : "bad"} value={d.ok ? "Up" : "Down"} of={`for ${since(now - d.started_at)}`}>
        <p>Cards are being drawn and served. Cards already on a profile keep showing even while the service restarts.</p>
      </Panel>

      <Panel
        title="Reading from GitHub"
        tone={d.fetching.paused ? "watch" : "good"}
        value={d.fetching.paused ? "Paused" : "Running"}
        of={d.fetching.paused ? undefined : "stats arrive as usual"}
      >
        {d.fetching.paused && back ? (
          <p>
            GitHub asks us to slow down. Reading starts again in <strong>{mins(back)}</strong>, at <strong>{utc(now + back)}</strong>.
            Until then cards show the last stats they had.
          </p>
        ) : (
          <p>When a card gets old, its stats are read from GitHub again, so every card stays close to current.</p>
        )}
      </Panel>

      <Panel
        title="New users"
        tone={d.new_users.open ? "good" : "watch"}
        value={d.new_users.open ? "Welcome" : "Busy"}
        of={d.new_users.open ? "first cards in seconds" : undefined}
      >
        {!d.new_users.open && next ? (
          <p>
            Many people are trying questlog right now. A new user sees the busy card and gets in at the next opening, in{" "}
            <strong>{mins(next)}</strong>, at <strong>{utc(now + next)}</strong>.
          </p>
        ) : (
          <p>A new user&apos;s first card shows a short wait message, then the real card a few seconds later.</p>
        )}
      </Panel>
    </div>
  );
}

function Panels({ d, now }: { d: HealthData; now: number }) {
  const g = d.github;
  const left = g.remaining;
  const resetIn = g.resets_at ? g.resets_at - now : null;
  const quotaTone: Tone = left === null ? "good" : g.paused_secs > 0 ? "bad" : toneOfUsed(1 - left / g.limit);

  const nu = d.new_users;
  const nuTone = toneOfUsed(nu.this_hour / nu.per_hour);
  const freeIn = nu.oldest_frees_in_secs;

  const w = d.waiting;
  const lineTone = toneOfUsed(Math.max(w.new / w.new_capacity, w.refresh / w.refresh_capacity));

  const r = d.renders;
  const renderTone: Tone = r.busy < r.slots ? "good" : "watch";

  const c = d.cache;
  const asks = c.hits + c.misses;
  const rate = asks ? Math.round((c.hits * 100) / asks) : 0;

  return (
    <div className={s.grid}>
      <Panel
        title="GitHub quota"
        tone={quotaTone}
        value={left === null ? "Not used yet" : num(left)}
        of={left === null ? undefined : `of ${num(g.limit)} points left this hour`}
        meter={left === null ? undefined : { share: left / g.limit, label: `${num(left)} of ${num(g.limit)} points left` }}
      >
        {resetIn !== null && resetIn > 0 ? (
          <p>
            Refills in <strong>{mins(resetIn)}</strong>, at <strong>{utc(g.resets_at!)}</strong>.
          </p>
        ) : (
          <p>GitHub reports the quota with each fetch; nothing has been fetched since the last start.</p>
        )}
        {g.paused_secs > 0 && (
          <p className={s.warn}>
            Fetching is paused for {mins(g.paused_secs)} to save the quota. New users see a wait message until then.
          </p>
        )}
        <p>Each new or refreshed user costs a few points. Cards already drawn cost nothing.</p>
      </Panel>

      <Panel
        title="New users this hour"
        tone={nuTone}
        value={num(nu.this_hour)}
        of={`of ${num(nu.per_hour)} allowed`}
        meter={{ share: nu.this_hour / nu.per_hour, label: `${nu.this_hour} of ${nu.per_hour} new users this hour` }}
      >
        <p>
          {num(Math.max(0, nu.per_hour - nu.this_hour))} more first-time users can come in this hour.
        </p>
        {freeIn !== null && freeIn > 0 && (
          <p>
            The hour slides: the next place frees in <strong>{mins(freeIn)}</strong>, at <strong>{utc(now + freeIn)}</strong>.
          </p>
        )}
        <p>Past the cap a new user sees the busy card and gets in a little later. People already on the list are never held back.</p>
      </Panel>

      <Panel
        title="Waiting lines"
        tone={lineTone}
        value={num(w.new)}
        of={w.new === 1 ? "new user waiting" : "new users waiting"}
        meter={{ share: w.new / w.new_capacity, label: `${w.new} of ${w.new_capacity} places in the line for new users` }}
      >
        <p>
          The line for new users holds {num(w.new_capacity)}. Refreshes of known users wait in their own line:{" "}
          <strong>{num(w.refresh)}</strong> of {num(w.refresh_capacity)}.
        </p>
        <p>While a refresh waits, its card keeps showing the last stats.</p>
      </Panel>

      <Panel
        title="Renderer"
        tone={renderTone}
        value={`${r.busy} of ${r.slots}`}
        of="drawing slots in use"
        meter={{ share: r.busy / r.slots, label: `${r.busy} of ${r.slots} drawing slots in use` }}
      >
        <p>
          A card that is not in the cache takes a slot for a moment. When both are taken, a request waits up to 2 seconds, then
          gets the busy card for a minute.
        </p>
      </Panel>

      <Panel
        title="Card cache"
        tone="good"
        value={num(c.entries)}
        of={c.entries === 1 ? "card ready in memory" : "cards ready in memory"}
        meter={{ share: c.bytes / c.budget, label: `${mb(c.bytes)} of ${mb(c.budget)} used` }}
      >
        <p>
          {mb(c.bytes)} of {mb(c.budget)} used. Since the last start <strong>{rate}%</strong> of cards came from the cache (
          {num(c.hits)} found, {num(c.misses)} drawn).
        </p>
        <p>Every drawn card is also saved on disk, so it is drawn once per version.</p>
      </Panel>

      <Panel title="Running" tone={d.ok ? "good" : "bad"} value={since(now - d.started_at)} of="since the last start">
        <p>
          Version <strong>{d.version}</strong>, started at {utc(d.started_at)} on{" "}
          {new Date(d.started_at * 1000).toISOString().slice(0, 10)}, with {d.scenes.length} scenes.
        </p>
        <p>A start clears the in-memory cache; cards saved on disk come back at once.</p>
      </Panel>
    </div>
  );
}
