// Every card combination the All cards page shows, shared with the snapshot list so scripts/snap_cards.py draws each one.
import { DECORATIONS, THEMES, cardName, type Widget } from "./data";
import { m } from "@/i18n";

const c = m.catalog.combos;

/** The four looks every card comes in, in the order of the columns. */
export const LOOKS = [
  { time: "day", chunky: false, label: c.looks.dayFine },
  { time: "day", chunky: true, label: c.looks.dayChunky },
  { time: "night", chunky: false, label: c.looks.nightFine },
  { time: "night", chunky: true, label: c.looks.nightChunky },
] as const;

export type Look = (typeof LOOKS)[number];

/** One row of cards: what it is called and its address without the look. */
export type Row = { name: string; base: string; h: number };
export type Group = { title: string; note?: string; rows: Row[] };

/** The demo adventurer's streak for each fire size: no streak, 1 to 6 days, 7 to 29, 30 and more. */
const FIRES = [
  { streak: 0, label: c.fires.ashes },
  { streak: 3, label: c.fires.small },
  { streak: 14, label: c.fires.steady },
  { streak: 60, label: c.fires.bonfire },
];

const MESSAGES = [
  { kind: "placeholder", label: c.messages.placeholder },
  { kind: "quota", label: c.messages.quota },
  { kind: "unknown", label: c.messages.unknown },
  { kind: "busy", label: c.messages.busy },
  { kind: "failed", label: c.messages.failed },
  { kind: "error", label: c.messages.error },
];

const WIDGETS: Widget[] = ["stats", "languages", "streak"];

export function groups(scene: string): Group[] {
  const fire = cardName("streak", scene);
  return [
    { title: cardName("stats", scene), rows: [{ name: cardName("stats", scene), base: `/demo/stats?scene=${scene}`, h: 128 }] },
    {
      title: cardName("languages", scene),
      rows: [
        { name: c.top5, base: `/demo/languages?scene=${scene}`, h: 128 },
        { name: c.top3, base: `/demo/languages?scene=${scene}&langs=3`, h: 128 },
      ],
    },
    {
      title: fire,
      note: c.fireNote,
      rows: FIRES.flatMap((f) =>
        ["classic", "themed"].map((style) => ({
          name: c.fireRow(style === "themed", f.label),
          base: `/demo/streak?scene=${scene}&streak=${f.streak}${style === "themed" ? "&fire=themed" : ""}`,
          h: 128,
        })),
      ),
    },
    {
      title: c.messagesTitle,
      note: c.messagesNote,
      rows: MESSAGES.flatMap((msg) =>
        WIDGETS.map((w) => ({
          name: c.messageRow(cardName(w, scene), msg.label),
          base: `/demo/message?kind=${msg.kind}&widget=${w}&scene=${scene}`,
          h: 128,
        })),
      ),
    },
  ];
}

export const DECORATION_GROUPS: Group[] = [
  {
    title: c.decorationsTitle,
    note: c.decorationsNote,
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
