export const health = {
  tone: { good: "Fine", watch: "Busy", bad: "Needs attention" },
  utc: (t: string) => `${t} UTC`,
  minutes: (n: number) => (n === 1 ? "1 minute" : `${n} minutes`),
  gb: (n: number) => `${n} GB`,
  kb: (n: number) => `${n} KB`,
  mb: (n: string) => `${n} MB`,
  sinceDays: (d: number, h: number) => `${d} day${d === 1 ? "" : "s"} ${h} h`,
  sinceHours: (h: number, m: number) => `${h} h ${m} min`,
  sinceMinutes: (m: number) => `${m} min`,

  headline: {
    down: "The service is not answering",
    checking: "Checking the service",
    stopped: "The service stopped answering",
    wrong: "Something is wrong",
    well: "All is well",
    busy: "Running, but busy",
  },
  eyebrow: "Service health",
  updating: "Updating",
  refreshIn: (n: number) => `Refresh in ${n} s`,
  refresh: "Refresh",
  updated: (time: string, every: number) => `Updated at ${time}. Checks again every ${every} seconds by itself.`,
  asking: "Asking the server for its numbers.",
  failed: (time: string, hasData: boolean) =>
    `The check at ${time} got no answer${hasData ? ", so these are the last numbers that came in" : ""}. The page keeps trying.`,
  loading: "Loading",
  raw: (monitors: boolean) =>
    `The same as JSON${monitors ? ", for scripts and uptime monitors" : ""}: <a/>. Times are in UTC.`,

  pub: {
    cards: {
      title: "Cards",
      up: "Up",
      down: "Down",
      for: (t: string) => `for ${t}`,
      note: "Cards are being drawn and served. Cards already on a profile keep showing even while the service restarts.",
    },
    reading: {
      title: "Reading from GitHub",
      paused: "Paused",
      running: "Running",
      runningOf: "stats arrive as usual",
      pausedNote: (wait: string, at: string) =>
        `GitHub asks us to slow down. Reading starts again in <strong>${wait}</strong>, at <strong>${at}</strong>. Until then cards show the last stats they had.`,
      note: "When a card gets old, its stats are read from GitHub again, so every card stays close to current.",
    },
    newUsers: {
      title: "New users",
      welcome: "Welcome",
      busy: "Busy",
      welcomeOf: "first cards in seconds",
      busyNote: (wait: string, at: string) =>
        `Many people are trying questlog right now. A new user sees the busy card and gets in at the next opening, in <strong>${wait}</strong>, at <strong>${at}</strong>.`,
      note: "A new user's first card shows a short wait message, then the real card a few seconds later.",
    },
  },

  quota: {
    title: "GitHub quota",
    unused: "Not used yet",
    of: (limit: string) => `of ${limit} points left this hour`,
    meter: (left: string, limit: string) => `${left} of ${limit} points left`,
    refills: (wait: string, at: string) => `Refills in <strong>${wait}</strong>, at <strong>${at}</strong>.`,
    none: "GitHub reports the quota with each fetch; nothing has been fetched since the last start.",
    paused: (wait: string) =>
      `Fetching is paused for ${wait} to save the quota. New users see a wait message until then.`,
    cost: "Each new or refreshed user costs a few points. Cards already drawn cost nothing.",
  },
  hour: {
    title: "New users this hour",
    of: (cap: string) => `of ${cap} allowed`,
    meter: (n: number, cap: number) => `${n} of ${cap} new users this hour`,
    more: (n: string) => `${n} more first-time users can come in this hour.`,
    slides: (wait: string, at: string) =>
      `The hour slides: the next place frees in <strong>${wait}</strong>, at <strong>${at}</strong>.`,
    cap: "Past the cap a new user sees the busy card and gets in a little later. People already on the list are never held back.",
  },
  lines: {
    title: "Waiting lines",
    of: (n: number) => (n === 1 ? "new user waiting" : "new users waiting"),
    meter: (n: number, cap: number) => `${n} of ${cap} places in the line for new users`,
    note: (cap: string, refresh: string, refreshCap: string) =>
      `The line for new users holds ${cap}. Refreshes of known users wait in their own line: <strong>${refresh}</strong> of ${refreshCap}.`,
    keeps: "While a refresh waits, its card keeps showing the last stats.",
  },
  renderer: {
    title: "Renderer",
    value: (busy: number, slots: number) => `${busy} of ${slots}`,
    of: "drawing slots in use",
    meter: (busy: number, slots: number) => `${busy} of ${slots} drawing slots in use`,
    note: "A card that is not in the cache takes a slot for a moment. When both are taken, a request waits up to 2 seconds, then gets the busy card for a minute.",
  },
  cache: {
    title: "Card cache",
    of: (n: number) => (n === 1 ? "card ready in memory" : "cards ready in memory"),
    meter: (used: string, budget: string) => `${used} of ${budget} used`,
    note: (used: string, budget: string, rate: number, hits: string, misses: string) =>
      `${used} of ${budget} used. Since the last start <strong>${rate}%</strong> of cards came from the cache (${hits} found, ${misses} drawn).`,
    disk: "Every drawn card is also saved on disk, so it is drawn once per version.",
  },
  running: {
    title: "Running",
    of: "since the last start",
    note: (version: string, at: string, date: string, scenes: number) =>
      `Version <strong>${version}</strong>, started at ${at} on ${date}, with ${scenes} scenes.`,
    restart: "A start clears the in-memory cache; cards saved on disk come back at once.",
  },
  users: {
    title: "Users",
    inMemory: "users in memory",
    saved: "users saved",
    note: (asked: string, unknown: number, unknownText: string) =>
      `<strong>${asked}</strong> of them asked for since the last start. <strong>${unknownText}</strong> ${unknown === 1 ? "name was" : "names were"} not on GitHub in the last hour.`,
    held: (n: string) =>
      `${n} held after failed GitHub fetches; their cards say the road is closed for 10 minutes.`,
    noneHeld: "No user is held after failed fetches.",
  },
  server: {
    title: "Server",
    unknown: "Unknown",
    of: (limit: string) => `of ${limit} memory`,
    inUse: "memory in use",
    meter: (used: string, limit: string) => `${used} of ${limit} memory`,
    note: (disk: string, budget: string) =>
      `Saved cards on disk: <strong>${disk}</strong> of ${budget}. Past that, the hourly trim removes the least recently used.`,
    none: "none",
  },

  kinds: {
    cache: "From the cache",
    drawn: "Drawn",
    busy: "Busy",
    error: "Errors",
    other: "Pages and files",
  },
  traffic: {
    aria: "Traffic in the last hour",
    title: "Traffic, last hour",
    peak: (n: string) => `busiest minute: ${n}`,
    summary: (all: string, parts: string[]) => `${all} requests in the last hour: ${parts.join(", ")}`,
    part: (n: string, label: string) => `${n} ${label.toLowerCase()}`,
    column: (time: string, n: string) => `${time}: ${n} requests`,
    now: "now",
    note: "Requests Cloudflare answers from its own cache never reach the server, so they are not counted here.",
  },
  log: {
    aria: "Recent log lines",
    title: "Recent log",
    only: "Warnings and errors only",
    searchLabel: "Search the log",
    placeholder: "Search, e.g. a username",
    intro: (n: string) =>
      `The last ${n} lines since the start, newest first. The full log is in Portainer or <code>docker logs questlog</code>.`,
    noMatch: "No line matches. Clear the search or the filter.",
    empty: "Nothing logged yet.",
  },
};

export const allCards = {
  title: "All cards",
  lede: "Pick a scene to see every card it has: by day and by night, in fine and in chunky pixels, with every board, fire size and message. Click a card to open it live, or copy its address for your README.",
  pickScene: "Pick a scene",
  banners: "Banners",
  decorations: "Decorations",
  empty: "Pick a scene above. Its cards show here, sorted by card and by look.",
  count: (n: number) => `${n} cards.`,
  jumpTo: "Jump to",
  jumpSep: ", ",
  jumpOr: " or ",
  jumpEnd: ".",
  tileAlt: (name: string, place: string, look: string) => `${name}, ${place}, ${look}`,
  previewLabel: (alt: string) => `Preview: ${alt}`,
  copied: "Copied",
  copyFailed: "Copy failed",
  copyAddress: "Copy address",
  copyMarkdown: "Copy Markdown line",
  copyDark: "Copy with dark mode switch",
  openLive: "Open live card",
  close: "Close",
  previous: "Previous card",
  next: "Next card",
  previewSub: (place: string, look: string, n: number, count: number) =>
    `${place}, ${look.toLowerCase()} · ${n} of ${count}`,
  liveAlt: (name: string, look: string) => `${name}, ${look}, live`,
  helpOwn:
    "The Markdown line works in any README. The dark mode switch shows the night painting to readers who use a dark theme. These cards show the owner's stats: put your login in their place, or use the <a>profile builder</a>.",
  wikiPlace: "Wiki",
  help: "The Markdown line works in any README. The dark mode switch shows the night painting to readers who use a dark theme. Demo cards show the built-in adventurer: put your login in place of <code>/demo</code>, as in <code>/you/stats</code>, or use the <a>profile builder</a>.",
};

export const attributions = {
  open: "Attributions",
  title: "Attributions",
  close: "Close",
  art: {
    what: "Paintings and sprites",
    credit:
      "© Cevdet Baran Oral, under <ccbync>CC BY-NC 4.0</ccbync>. Credit as \"questlog-github-stats art by Cevdet Baran Oral\"; linking the cards to the repository counts. Commercial use needs written permission: contact@cevdetbaran.com.",
  },
  code: {
    what: "Code",
    credit: "questlog, under the <mit>MIT license</mit>.",
  },
  nodesto: {
    what: "Nodesto Caps Condensed",
    credit: "By Solbera, under <ccbysa>CC BY-SA 4.0</ccbysa>. The card titles.",
  },
  tiny5: {
    what: "Tiny5",
    credit: "By Stefan Schmidt, under the <ofl>SIL Open Font License 1.1</ofl>. The card text.",
  },
  outfit: {
    what: "Outfit",
    credit: "By the Outfit Project Authors, under the <ofl>SIL Open Font License 1.1</ofl>. The site text.",
  },
  silkscreen: {
    what: "Silkscreen",
    credit:
      "By Jason Kottke and the Silkscreen Project Authors, under the <ofl>SIL Open Font License 1.1</ofl>. The questlog logo.",
  },
  colors: {
    what: "Language colors",
    credit: "Adapted from <linguist>GitHub Linguist</linguist> (MIT).",
  },
  software: {
    what: "Software",
    credit:
      "The card server uses axum, tokio, reqwest, serde, png and skrifa (MIT or Apache 2.0). The site uses Next.js and React (MIT) and GSAP (<gsap>GSAP Standard License</gsap>).",
  },
};
