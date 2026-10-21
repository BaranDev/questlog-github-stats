// Every card combination the All cards page shows, shared with the snapshot list so scripts/snap_cards.py draws each one.
import { DECORATIONS, THEMES, cardName, type Widget } from "./data";

/** The four looks every card comes in, in the order of the columns. */
export const LOOKS = [
  { time: "day", chunky: false, label: "Day, fine pixels" },
  { time: "day", chunky: true, label: "Day, chunky pixels" },
  { time: "night", chunky: false, label: "Night, fine pixels" },
  { time: "night", chunky: true, label: "Night, chunky pixels" },
] as const;

export type Look = (typeof LOOKS)[number];

/** One row of cards: what it is called and its address without the look. */
export type Row = { name: string; base: string; h: number };
export type Group = { title: string; note?: string; rows: Row[] };

/** The demo adventurer's streak for each fire size: no streak, 1 to 6 days, 7 to 29, 30 and more. */
const FIRES = [
  { streak: 0, label: "ashes (no streak)" },
  { streak: 3, label: "small flame (1 to 6 days)" },
  { streak: 14, label: "steady flame (7 to 29 days)" },
  { streak: 60, label: "bonfire (30 days and more)" },
];

const MESSAGES = [
  { kind: "placeholder", label: "first visit, stats on the way" },
  { kind: "quota", label: "waiting for GitHub's hourly limit" },
  { kind: "unknown", label: "no such GitHub user" },
  { kind: "busy", label: "too busy right now" },
  { kind: "failed", label: "GitHub could not be reached" },
  { kind: "error", label: "a mistake in the address" },
];

const WIDGETS: Widget[] = ["stats", "languages", "streak"];

export function groups(scene: string): Group[] {
  const fire = cardName("streak", scene);
  return [
    { title: "Character Sheet", rows: [{ name: "Character Sheet", base: `/demo/stats?scene=${scene}`, h: 128 }] },
    {
      title: "Spellbook",
      rows: [
        { name: "Top 5 languages", base: `/demo/languages?scene=${scene}`, h: 128 },
        { name: "Top 3 languages", base: `/demo/languages?scene=${scene}&langs=3`, h: 128 },
      ],
    },
    {
      title: fire,
      note: "The fire grows with your streak. Classic is the same flame in every scene; themed takes the scene's own colors.",
      rows: FIRES.flatMap((f) =>
        ["classic", "themed"].map((style) => ({
          name: `${style === "themed" ? "Themed" : "Classic"} fire, ${f.label}`,
          base: `/demo/streak?scene=${scene}&streak=${f.streak}${style === "themed" ? "&fire=themed" : ""}`,
          h: 128,
        })),
      ),
    },
    {
      title: "Messages",
      note: "What a card shows instead of the stats while they are on the way or when something is wrong.",
      rows: MESSAGES.flatMap((m) =>
        WIDGETS.map((w) => ({
          name: `${cardName(w, scene)}: ${m.label}`,
          base: `/demo/message?kind=${m.kind}&widget=${w}&scene=${scene}`,
          h: 128,
        })),
      ),
    },
  ];
}

export const DECORATION_GROUPS: Group[] = [
  {
    title: "Decorations",
    note: "Painted banners for the sections of a README. The title is yours to choose; these show the examples.",
    rows: DECORATIONS.map((d) => ({
      name: d.label,
      base: `/decorations/${d.name}${d.title ? `?title=${encodeURIComponent(d.title)}` : ""}`,
      h: d.h,
    })),
  },
];

const join = (base: string, query: string) => `${base}${base.includes("?") ? "&" : "?"}${query}`;

/** A row's address in a look: what goes in a README (demo cards show the built-in adventurer). */
export const address = (r: Row, l: Look) => join(r.base, `time=${l.time}${l.chunky ? "&pixels=chunky" : ""}`);
/** The site's still copy of it. */
export const stillOf = (a: string) => `${a}&scale=2&animate=false`;

/** Every still the page can show, for scripts/snap_cards.py. */
export const ALL_CARDS = [...THEMES.flatMap((t) => t.scenes).flatMap(groups), ...DECORATION_GROUPS].flatMap((g) =>
  g.rows.flatMap((r) => LOOKS.map((l) => stillOf(address(r, l)))),
);
