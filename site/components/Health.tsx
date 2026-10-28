"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { m, rich } from "@/i18n";
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
  cache: { entries: number; bytes: number; budget: number; hits: number; misses: number; disk_bytes: number | null; disk_budget: number };
  renders: { busy: number; slots: number };
  held: number;
  users: { saved: number | null; in_memory: number; unknown: number };
  memory: { used: number | null; limit: number | null };
  traffic: Minute[];
  recent: string[];
  scenes: string[];
  github: { remaining: number | null; limit: number; resets_at: number | null; paused_secs: number };
  new_users: { this_hour: number; per_hour: number; oldest_frees_in_secs: number | null };
  waiting: { new: number; new_capacity: number; refresh: number; refresh_capacity: number };
  people: PeopleData;
};

type PeopleData = {
  since: number;
  tried: number;
  in_readme: number;
  removed: string[];
  no_login: { decorations: number; in_readme: number };
};

/** first is 0 for someone saved before the counting began. */
type Person = {
  login: string;
  first: number;
  last: number;
  cards: { address: string; first: number; last: number; readme: boolean }[];
  stats: {
    level: number;
    class: string;
    commits: number;
    stars: number;
    followers: number;
    current_streak: number;
    best_streak: number;
    languages: [string, number][];
    fetched_at: number;
  } | null;
};

type Minute = { minute: number; cache: number; drawn: number; busy: number; error: number; other: number };

const EVERY = 30; // seconds between automatic checks
const REST = 10; // seconds the Refresh button rests after a press

const H = m.health;

const utc = (secs: number) => H.utc(new Date(secs * 1000).toISOString().slice(11, 16));
const clockUtc = (d: Date) => H.utc(d.toISOString().slice(11, 19));
const mins = (secs: number) => H.minutes(Math.max(1, Math.ceil(secs / 60)));
const num = (n: number) => n.toLocaleString("en-US");
const mb = (b: number) =>
  b >= 1073741824
    ? H.gb(+(b / 1073741824).toFixed(1))
    : b < 1048576 ? H.kb(Math.max(1, Math.round(b / 1024))) : H.mb((b / 1048576).toFixed(b < 10485760 ? 1 : 0));

function since(secs: number) {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const mi = Math.floor((secs % 3600) / 60);
  if (d > 0) return H.sinceDays(d, h);
  if (h > 0) return H.sinceHours(h, mi);
  return H.sinceMinutes(Math.max(1, mi));
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
  const word = H.tone[tone];
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
      ? H.headline.down
      : H.headline.checking
    : failedAt
      ? H.headline.stopped
      : !data.ok
        ? H.headline.wrong
        : calm
          ? H.headline.well
          : H.headline.busy;

  return (
    <div className={s.page}>
      <header className={s.header}>
        <p className={s.eyebrow}>{H.eyebrow}</p>
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
            {asking ? H.updating : rest > 0 ? H.refreshIn(rest) : H.refresh}
          </button>
        </div>
        <p className={s.updated} aria-live="polite">
          {at ? H.updated(clockUtc(at), EVERY) : H.asking}
          {failedAt && (
            <span className={s.failed}>
              {" "}
              {H.failed(clockUtc(failedAt), !!data)}
            </span>
          )}
        </p>
      </header>

      {!data ? (
        <div className={s.grid} aria-busy={!down} aria-label={H.loading}>
          {Array.from({ length: full ? 6 : 3 }, (_, i) => (
            <div key={i} className={`${s.panel} ${s.shimmer}`} />
          ))}
        </div>
      ) : "fetching" in data ? (
        <PublicPanels d={data} now={now} />
      ) : (
        <Panels d={data} now={now} reload={load} />
      )}

      <p className={s.raw}>
        {rich(H.raw(!full), { a: () => <a href={url}>{url}</a> })}
      </p>
    </div>
  );
}

function PublicPanels({ d, now }: { d: PublicData; now: number }) {
  const P = H.pub;
  const back = d.fetching.back_in_secs;
  const next = d.new_users.next_opening_secs;
  return (
    <div className={s.grid}>
      <Panel title={P.cards.title} tone={d.ok ? "good" : "bad"} value={d.ok ? P.cards.up : P.cards.down} of={P.cards.for(since(now - d.started_at))}>
        <p>{P.cards.note}</p>
      </Panel>

      <Panel
        title={P.reading.title}
        tone={d.fetching.paused ? "watch" : "good"}
        value={d.fetching.paused ? P.reading.paused : P.reading.running}
        of={d.fetching.paused ? undefined : P.reading.runningOf}
      >
        {d.fetching.paused && back ? (
          <p>{rich(P.reading.pausedNote(mins(back), utc(now + back)), { strong: (c) => <strong>{c}</strong> })}</p>
        ) : (
          <p>{P.reading.note}</p>
        )}
      </Panel>

      <Panel
        title={P.newUsers.title}
        tone={d.new_users.open ? "good" : "watch"}
        value={d.new_users.open ? P.newUsers.welcome : P.newUsers.busy}
        of={d.new_users.open ? P.newUsers.welcomeOf : undefined}
      >
        {!d.new_users.open && next ? (
          <p>{rich(P.newUsers.busyNote(mins(next), utc(now + next)), { strong: (c) => <strong>{c}</strong> })}</p>
        ) : (
          <p>{P.newUsers.note}</p>
        )}
      </Panel>
    </div>
  );
}

function Panels({ d, now, reload }: { d: HealthData; now: number; reload: () => Promise<void> }) {
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
    <>
    <div className={s.grid}>
      <Panel
        title={H.quota.title}
        tone={quotaTone}
        value={left === null ? H.quota.unused : num(left)}
        of={left === null ? undefined : H.quota.of(num(g.limit))}
        meter={left === null ? undefined : { share: left / g.limit, label: H.quota.meter(num(left), num(g.limit)) }}
      >
        {resetIn !== null && resetIn > 0 ? (
          <p>{rich(H.quota.refills(mins(resetIn), utc(g.resets_at!)), { strong: (c) => <strong>{c}</strong> })}</p>
        ) : (
          <p>{H.quota.none}</p>
        )}
        {g.paused_secs > 0 && (
          <p className={s.warn}>
            {H.quota.paused(mins(g.paused_secs))}
          </p>
        )}
        <p>{H.quota.cost}</p>
      </Panel>

      <Panel
        title={H.hour.title}
        tone={nuTone}
        value={num(nu.this_hour)}
        of={H.hour.of(num(nu.per_hour))}
        meter={{ share: nu.this_hour / nu.per_hour, label: H.hour.meter(nu.this_hour, nu.per_hour) }}
      >
        <p>
          {H.hour.more(num(Math.max(0, nu.per_hour - nu.this_hour)))}
        </p>
        {freeIn !== null && freeIn > 0 && (
          <p>{rich(H.hour.slides(mins(freeIn), utc(now + freeIn)), { strong: (c) => <strong>{c}</strong> })}</p>
        )}
        <p>{H.hour.cap}</p>
      </Panel>

      <Panel
        title={H.lines.title}
        tone={lineTone}
        value={num(w.new)}
        of={H.lines.of(w.new)}
        meter={{ share: w.new / w.new_capacity, label: H.lines.meter(w.new, w.new_capacity) }}
      >
        <p>{rich(H.lines.note(num(w.new_capacity), num(w.refresh), num(w.refresh_capacity)), { strong: (c) => <strong>{c}</strong> })}</p>
        <p>{H.lines.keeps}</p>
      </Panel>

      <Panel
        title={H.renderer.title}
        tone={renderTone}
        value={H.renderer.value(r.busy, r.slots)}
        of={H.renderer.of}
        meter={{ share: r.busy / r.slots, label: H.renderer.meter(r.busy, r.slots) }}
      >
        <p>{H.renderer.note}</p>
      </Panel>

      <Panel
        title={H.cache.title}
        tone="good"
        value={num(c.entries)}
        of={H.cache.of(c.entries)}
        meter={{ share: c.bytes / c.budget, label: H.cache.meter(mb(c.bytes), mb(c.budget)) }}
      >
        <p>{rich(H.cache.note(mb(c.bytes), mb(c.budget), rate, num(c.hits), num(c.misses)), { strong: (c) => <strong>{c}</strong> })}</p>
        <p>{H.cache.disk}</p>
      </Panel>

      <Panel title={H.running.title} tone={d.ok ? "good" : "bad"} value={since(now - d.started_at)} of={H.running.of}>
        <p>
          {rich(H.running.note(d.version, utc(d.started_at), new Date(d.started_at * 1000).toISOString().slice(0, 10), d.scenes.length), { strong: (c) => <strong>{c}</strong> })}
        </p>
        <p>{H.running.restart}</p>
      </Panel>

      <Panel
        title={H.users.title}
        tone={d.held > 0 ? "watch" : "good"}
        value={d.users.saved === null ? num(d.users.in_memory) : num(d.users.saved)}
        of={d.users.saved === null ? H.users.inMemory : H.users.saved}
      >
        <p>{rich(H.users.note(num(d.users.in_memory), d.users.unknown, num(d.users.unknown)), { strong: (c) => <strong>{c}</strong> })}</p>
        <p>
          {d.held > 0
            ? H.users.held(num(d.held))
            : H.users.noneHeld}
        </p>
      </Panel>

      <Panel
        title={H.server.title}
        tone={memTone(d.memory)}
        value={d.memory.used === null ? H.server.unknown : mb(d.memory.used)}
        of={d.memory.limit ? H.server.of(mb(d.memory.limit)) : H.server.inUse}
        meter={d.memory.used && d.memory.limit ? { share: d.memory.used / d.memory.limit, label: H.server.meter(mb(d.memory.used), mb(d.memory.limit)) } : undefined}
      >
        <p>{rich(H.server.note(d.cache.disk_bytes === null ? H.server.none : mb(d.cache.disk_bytes), mb(d.cache.disk_budget)), { strong: (c) => <strong>{c}</strong> })}</p>
      </Panel>
    </div>

    {d.people && <People p={d.people} stamp={d.now} reload={reload} />}
    <Traffic minutes={d.traffic} />
    <Log lines={d.recent} />
    </>
  );
}

const P = H.people;
const day = (secs: number) => H.utc(new Date(secs * 1000).toISOString().slice(0, 16).replace("T", " "));

/** A change to the people list; the header is one a form on another site can't send. */
async function change(login: string, what: "remove" | "allow") {
  const r = await fetch(`/admin/people/${encodeURIComponent(login)}/${what}`, { method: "POST", headers: { "x-questlog-admin": "1" } });
  if (!r.ok) throw new Error(String(r.status));
}

/** Everyone who tried it, newest first: their GitHub profile, the stats saved for them, and the cards they made. */
/** What /admin/people answers: one page of the list, newest first. */
type PeoplePage = { page: number; pages: number; per: number; total: number; list: Person[] };

function People({ p, stamp, reload }: { p: PeopleData; stamp: number; reload: () => Promise<void> }) {
  const [page, setPage] = useState(1);
  const [find, setFind] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<PeoplePage | null>(null);
  const [failed, setFailed] = useState(false);
  const [asking, setAsking] = useState(false);
  const top = useRef<HTMLElement>(null);

  // search after a short pause in typing, from the first page
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(find.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [find]);

  // the page asked for, again with every health check so it stays current; a failed ask keeps the last list
  useEffect(() => {
    let live = true;
    setAsking(true);
    fetch(`/admin/people?page=${page}&q=${encodeURIComponent(query)}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((v: PeoplePage) => {
        if (live) {
          setData(v);
          setFailed(false);
        }
      })
      .catch(() => live && setFailed(true))
      .finally(() => live && setAsking(false));
    return () => {
      live = false;
    };
  }, [page, query, stamp]);

  const go = (to: number) => {
    setPage(to);
    top.current?.scrollIntoView({ block: "start" });
  };
  const list = data?.list ?? [];
  const from = data && data.total ? (data.page - 1) * data.per + 1 : 0;

  return (
    <section ref={top} className={`${s.panel} ${s.wide}`} aria-label={P.aria}>
      <header className={s.panelHead}>
        <h2>{P.title}</h2>
        <span className={s.peak}>{P.since(day(p.since))}</span>
      </header>
      <div className={s.counts}>
        <p className={s.value}>
          {num(p.tried)}
          <span className={s.of}> {P.tried}</span>
        </p>
        <p className={s.value}>
          {num(p.in_readme)}
          <span className={s.of}> {P.inReadme(p.in_readme)}</span>
        </p>
        <p className={s.value}>
          {num(p.no_login.decorations)}
          <span className={s.of}> {P.noLogin(p.no_login.decorations)}</span>
        </p>
      </div>
      <div className={s.notes}>
        <p>{rich(P.noLoginNote(num(p.no_login.in_readme)), { strong: (c) => <strong>{c}</strong> })}</p>
        <p>{P.rules}</p>
      </div>
      {p.tried > 0 && (
        <label className={s.search}>
          <span className="visually-hidden">{P.findLabel}</span>
          <input id="people-search" type="search" placeholder={P.findPlaceholder} value={find} onChange={(e) => setFind(e.target.value)} />
        </label>
      )}
      {failed && (
        <p className={s.warn} role="status">
          {P.pageFailed(!!data)}
        </p>
      )}
      {!data ? (
        !failed && <div className={`${s.person} ${s.shimmer} ${s.personShimmer}`} aria-busy="true" aria-label={H.loading} />
      ) : list.length ? (
        <>
          <ul className={s.people} aria-busy={asking}>
            {list.map((u) => (
              <PersonRow key={u.login} u={u} reload={reload} />
            ))}
          </ul>
          {data.pages > 1 && (
            <nav className={s.pager} aria-label={P.pagesLabel}>
              <button type="button" className={s.toggle} onClick={() => go(data.page - 1)} disabled={data.page <= 1}>
                {P.newer}
              </button>
              <span aria-live="polite">{P.showing(num(from), num(from + list.length - 1), num(data.total), data.page, data.pages)}</span>
              <button type="button" className={s.toggle} onClick={() => go(data.page + 1)} disabled={data.page >= data.pages}>
                {P.older}
              </button>
            </nav>
          )}
        </>
      ) : (
        <p className={s.notes}>{query ? P.noMatch(query) : P.empty}</p>
      )}
      {(p.removed ?? []).length > 0 && (
        <div className={s.notes}>
          <h3 className={s.subhead}>{P.removedTitle}</h3>
          <p>{P.removedNote}</p>
          <ul className={s.removed}>
            {p.removed.map((login) => (
              <Allow key={login} login={login} reload={reload} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Allow({ login, reload }: { login: string; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const allow = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await change(login, "allow");
      await reload();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li>
      <b>{login}</b>
      <button type="button" className={s.toggle} onClick={allow} disabled={busy}>
        {busy ? P.allowing : P.allow(login)}
      </button>
      {failed && (
        <span className={s.warn} role="alert">
          {P.allowFailed}
        </span>
      )}
    </li>
  );
}

function PersonRow({ u, reload }: { u: Person; reload: () => Promise<void> }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const remove = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await change(u.login, "remove");
      await reload();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };
  const st = u.stats;
  const readme = u.cards.some((c) => c.readme);
  const profile = `https://github.com/${encodeURIComponent(u.login)}`;
  // addresses come from requests: only same-site paths become images and links
  const cards = u.cards.filter((c) => c.address.startsWith("/") && !c.address.startsWith("//"));
  return (
    <li className={s.person}>
      <header className={s.personHead}>
        <a href={profile} target="_blank" rel="noopener noreferrer" className={s.who} aria-label={P.profile(u.login)}>
          <img src={`${profile}.png?size=80`} width={40} height={40} alt="" loading="lazy" />
          <b>{u.login}</b>
        </a>
        <div className={s.tools}>
          {u.first > 0 && (
            <span className={s.chip} data-tone={readme ? "good" : "watch"}>
              {readme ? P.readme : P.tried1}
            </span>
          )}
          {!ask && (
            <button type="button" className={s.toggle} onClick={() => setAsk(true)}>
              {P.remove}
            </button>
          )}
        </div>
      </header>
      {ask && (
        <div className={s.confirm} role="group" aria-label={P.remove}>
          <p>{P.removeAsk(u.login)}</p>
          <div className={s.tools}>
            <button type="button" className={`${s.toggle} ${s.danger}`} onClick={remove} disabled={busy}>
              {busy ? P.removing : P.removeYes}
            </button>
            <button type="button" className={s.toggle} onClick={() => setAsk(false)} disabled={busy}>
              {P.cancel}
            </button>
          </div>
          {failed && (
            <p className={s.warn} role="alert">
              {P.removeFailed}
            </p>
          )}
        </div>
      )}
      <div className={s.notes}>
        {st ? (
          <p>
            <strong>{P.level(st.level, st.class)}</strong>. {P.facts(num(st.commits), num(st.stars), num(st.followers))}.{" "}
            {P.streak(st.current_streak, st.best_streak)}.
            {st.languages.length > 0 && <> {st.languages.slice(0, 3).map(([l]) => l).join(", ")}.</>} {P.fetched(day(st.fetched_at))}.
          </p>
        ) : (
          <p>{P.noStats}</p>
        )}
        <p>{u.first > 0 ? P.seen(day(u.first), day(u.last)) : P.before(u.last > 0 ? day(u.last) : null)}</p>
      </div>
      {cards.length > 0 && (
        <details className={s.made}>
          <summary>{P.cardsTitle(cards.length)}</summary>
          <ul className={s.cards}>
            {cards.map((c) => (
              <li key={c.address}>
                <a href={c.address} target="_blank" rel="noopener noreferrer">
                  <img src={c.address} alt={P.cardAlt(c.address)} loading="lazy" decoding="async" />
                </a>
                <code>{c.address}</code>
                <span className={s.where}>{c.readme ? P.inReadmeShort : P.inBrowser}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

const memTone = (m: { used: number | null; limit: number | null }): Tone =>
  m.used && m.limit ? toneOfUsed(m.used / m.limit) : "good";

const KINDS = [
  { key: "cache", label: H.kinds.cache },
  { key: "drawn", label: H.kinds.drawn },
  { key: "busy", label: H.kinds.busy },
  { key: "error", label: H.kinds.error },
  { key: "other", label: H.kinds.other },
] as const;

/** Requests per minute for the last hour, stacked by what they were answered with. */
function Traffic({ minutes }: { minutes: Minute[] }) {
  const total = (m: Minute) => KINDS.reduce((n, k) => n + m[k.key], 0);
  const peak = Math.max(1, ...minutes.map(total));
  const sums = KINDS.map((k) => minutes.reduce((n, m) => n + m[k.key], 0));
  const all = sums.reduce((a, b) => a + b, 0);
  const summary = H.traffic.summary(num(all), KINDS.map((k, i) => H.traffic.part(num(sums[i]), k.label)));
  return (
    <section className={`${s.panel} ${s.wide}`} aria-label={H.traffic.aria}>
      <header className={s.panelHead}>
        <h2>{H.traffic.title}</h2>
        <span className={s.peak}>{H.traffic.peak(num(peak === 1 && all === 0 ? 0 : peak))}</span>
      </header>
      <div className={s.chart} role="img" aria-label={summary}>
        {minutes.map((m) => (
          <div key={m.minute} className={s.col} title={H.traffic.column(utc(m.minute), num(total(m)))}>
            {KINDS.map((k) =>
              m[k.key] ? <span key={k.key} data-kind={k.key} style={{ height: `${(m[k.key] / peak) * 100}%` }} /> : null,
            )}
          </div>
        ))}
      </div>
      <div className={s.axis} aria-hidden="true">
        <span>{minutes[0] ? utc(minutes[0].minute) : ""}</span>
        <span>{H.traffic.now}</span>
      </div>
      <ul className={s.legend}>
        {KINDS.map((k, i) => (
          <li key={k.key}>
            <span data-kind={k.key} aria-hidden="true" />
            {k.label} <strong>{num(sums[i])}</strong>
          </li>
        ))}
      </ul>
      <p className={s.notes}>{H.traffic.note}</p>
    </section>
  );
}

/** The latest log lines, newest first, with a filter for warnings and errors and a text search. */
function Log({ lines }: { lines: string[] }) {
  const [only, setOnly] = useState(false);
  const [find, setFind] = useState("");
  const shown = lines
    .slice()
    .reverse()
    .filter((l) => (!only || / (WARN|ERROR) /.test(l)) && (!find || l.toLowerCase().includes(find.toLowerCase())));
  return (
    <section className={`${s.panel} ${s.wide}`} aria-label={H.log.aria}>
      <header className={s.panelHead}>
        <h2>{H.log.title}</h2>
        <div className={s.tools}>
          <button type="button" className={s.toggle} aria-pressed={only} onClick={() => setOnly((o) => !o)}>
            {H.log.only}
          </button>
          <label className={s.search}>
            <span className="visually-hidden">{H.log.searchLabel}</span>
            <input id="log-search" type="search" placeholder={H.log.placeholder} value={find} onChange={(e) => setFind(e.target.value)} />
          </label>
        </div>
      </header>
      <div className={s.notes}>
        <p>{rich(H.log.intro(num(lines.length)), { code: (c) => <code>{c}</code> })}</p>
      </div>
      {shown.length ? (
        <ol className={s.log}>
          {shown.map((l, i) => {
            const level = / ERROR /.test(l) ? "error" : / WARN /.test(l) ? "warn" : "info";
            return (
              <li key={i} data-level={level}>
                {l}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={s.notes}>{lines.length ? H.log.noMatch : H.log.empty}</p>
      )}
    </section>
  );
}
