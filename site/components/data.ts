export const REPO = "https://github.com/BaranDev/questlog-github-stats";
import snapped from "./snapped.json";

export const DEMO_USER = "BaranDev";
/** The primary host; questlog.cevdetbaran.com still answers too. */
export const HOST = "https://questlog.cc";

export type Widget = "stats" | "languages" | "streak";

export const THEMES = [
  {
    name: "Forest",
    cover: "forest",
    blurb: "Campfires under old trees, in summer green, autumn, mist and moonlight.",
    scenes: ["forest", "forest-autumn", "forest-misty", "forest-moonlit"],
  },
  {
    name: "Castle",
    cover: "castle-aurora",
    blurb: "Braziers on the walls at sunset, under the aurora, in the sky and in the storm.",
    scenes: ["castle", "castle-aurora", "castle-sky", "castle-storm"],
  },
  {
    name: "Cozy",
    cover: "witch-cottage",
    blurb: "A fairy ring, a witch's hearth, a kingdom on the clouds and a rose garden.",
    scenes: ["fairy-garden", "witch-cottage", "cloud-kingdom", "rose-garden"],
  },
  {
    name: "Scholarly",
    cover: "observatory",
    blurb: "A royal library, a war room, a guild hall and an observatory full of brass.",
    scenes: ["royal-library", "war-room", "guild-hall", "observatory"],
  },
];

export const SCENES = THEMES.flatMap((t) => t.scenes);

/** Scenes whose fire has been redrawn for the scene (fire=themed). The others are being reworked. */
export const READY = ["forest", "forest-autumn", "forest-misty", "forest-moonlit", "castle", "castle-aurora", "castle-sky", "castle-storm",
  "fairy-garden", "witch-cottage", "cloud-kingdom", "rose-garden", "royal-library", "war-room", "guild-hall", "observatory"];
export const isReady = (scene: string) => READY.includes(scene);

const FIRE: Record<string, string> = {
  forest: "Campfire", "forest-autumn": "Campfire", "forest-misty": "Campfire", "forest-moonlit": "Campfire",
  "fairy-garden": "Campfire",
  castle: "Brazier", "castle-aurora": "Brazier", "castle-sky": "Brazier", "castle-storm": "Brazier", "war-room": "Brazier",
  "witch-cottage": "Hearth", "royal-library": "Hearth", "guild-hall": "Hearth",
  "cloud-kingdom": "Lantern", observatory: "Lantern",
  "rose-garden": "Fire Bowl",
};

/** The card's title in a scene: the streak card's fire changes with the scene. */
export function cardName(w: Widget, scene: string): string {
  if (w === "stats") return "Character Sheet";
  if (w === "languages") return "Spellbook";
  return FIRE[scene] ?? "Campfire";
}

/** "forest-autumn" -> "Forest autumn" */
export function sceneName(scene: string): string {
  const s = scene.replace(/-/g, " ");
  return s[0].toUpperCase() + s.slice(1);
}

/** A live card of the demo profile on this host. */
export function card(w: Widget, scene: string, extra = ""): string {
  return `/${w}?user=${DEMO_USER}&scene=${scene}${extra}`;
}

/** The site's own copy of a card: drawn once by scripts/snap_cards.py and shipped as a WebP file, so showing the
 * site never asks the card server for a drawing. "/stats?user=x&scene=y" is cards/stats.user=x,scene=y.webp, and a
 * character a file name can't hold becomes ~ and its hex bytes (":" is ~3A). The version changes whenever the copies
 * are drawn again, so browsers and Cloudflare fetch the new ones. */
export function snap(url: string): string {
  const [path, query = ""] = url.slice(1).split(/\?(.*)/s);
  const safe = (part: string) =>
    part.replace(/[^A-Za-z0-9=._-]/g, (c) => Array.from(new TextEncoder().encode(c), (b) => `~${b.toString(16).toUpperCase().padStart(2, "0")}`).join(""));
  const name = path.replace("/", "_") + (query ? `.${query.split("&").map(safe).join(",")}` : "");
  return `/static/cards/${name}.webp?v=${snapped.version}`;
}

/** Each language's rune, in its readable color, drawn as 1x1 cells on the 5x9 rune grid. */
export const RUNES = [
  { lang: "Python", rune: "perthro", color: "#6D99BE", d: "M0 0h1v1h-1zM4 0h1v1h-1zM0 1h2v1h-2zM3 1h1v1h-1zM0 2h1v1h-1zM2 2h1v1h-1zM0 3h1v1h-1zM0 4h1v1h-1zM0 5h1v1h-1zM0 6h1v1h-1zM2 6h1v1h-1zM0 7h2v1h-2zM3 7h1v1h-1zM0 8h1v1h-1zM4 8h1v1h-1z" },
  { lang: "JavaScript", rune: "jera", color: "#F1E05A", d: "M2 1h1v1h-1zM1 2h1v1h-1zM0 3h1v1h-1zM2 3h1v1h-1zM1 4h1v1h-1zM3 4h1v1h-1zM2 5h1v1h-1zM4 5h1v1h-1zM3 6h1v1h-1zM2 7h1v1h-1z" },
  { lang: "TypeScript", rune: "tiwaz", color: "#508CCF", d: "M2 0h1v1h-1zM1 1h3v1h-3zM1 2h3v1h-3zM0 3h1v1h-1zM2 3h1v1h-1zM4 3h1v1h-1zM2 4h1v1h-1zM2 5h1v1h-1zM2 6h1v1h-1zM2 7h1v1h-1zM2 8h1v1h-1z" },
  { lang: "Java", rune: "eihwaz", color: "#BC873C", d: "M2 0h1v1h-1zM2 1h2v1h-2zM2 2h1v1h-1zM4 2h1v1h-1zM2 3h1v1h-1zM2 4h1v1h-1zM2 5h1v1h-1zM0 6h1v1h-1zM2 6h1v1h-1zM1 7h2v1h-2zM2 8h1v1h-1z" },
  { lang: "C#", rune: "sowilo", color: "#58A747", d: "M3 0h1v1h-1zM2 1h1v1h-1zM2 2h1v1h-1zM1 3h1v1h-1zM2 4h1v1h-1zM3 5h1v1h-1zM2 6h1v1h-1zM2 7h1v1h-1zM1 8h1v1h-1z" },
  { lang: "C++", rune: "kaunan", color: "#F34B7D", d: "M3 1h1v1h-1zM2 2h1v1h-1zM2 3h1v1h-1zM1 4h1v1h-1zM2 5h1v1h-1zM2 6h1v1h-1zM3 7h1v1h-1z" },
  { lang: "C", rune: "calc", color: "#848484", d: "M2 0h1v1h-1zM2 1h1v1h-1zM2 2h1v1h-1zM2 3h1v1h-1zM2 4h1v1h-1zM1 5h3v1h-3zM1 6h3v1h-3zM0 7h1v1h-1zM4 7h1v1h-1z" },
  { lang: "PHP", rune: "wunjo", color: "#808AB2", d: "M1 0h1v1h-1zM1 1h3v1h-3zM1 2h1v1h-1zM4 2h1v1h-1zM1 3h3v1h-3zM1 4h1v1h-1zM1 5h1v1h-1zM1 6h1v1h-1zM1 7h1v1h-1zM1 8h1v1h-1z" },
  { lang: "Go", rune: "gebo", color: "#26B9DE", d: "M0 0h1v1h-1zM4 0h1v1h-1zM1 1h1v1h-1zM3 1h1v1h-1zM1 2h1v1h-1zM3 2h1v1h-1zM2 3h1v1h-1zM2 4h1v1h-1zM1 5h1v1h-1zM3 5h1v1h-1zM1 6h1v1h-1zM3 6h1v1h-1zM0 7h1v1h-1zM4 7h1v1h-1zM0 8h1v1h-1zM4 8h1v1h-1z" },
  { lang: "Rust", rune: "raido", color: "#DEA584", d: "M1 0h1v1h-1zM1 1h3v1h-3zM1 2h1v1h-1zM4 2h1v1h-1zM1 3h3v1h-3zM1 4h1v1h-1zM1 5h2v1h-2zM1 6h1v1h-1zM3 6h1v1h-1zM1 7h1v1h-1zM3 7h1v1h-1zM1 8h1v1h-1zM4 8h1v1h-1z" },
  { lang: "Ruby", rune: "yr", color: "#A76F70", d: "M0 0h1v1h-1zM4 0h1v1h-1zM1 1h1v1h-1zM3 1h1v1h-1zM1 2h1v1h-1zM3 2h1v1h-1zM2 3h1v1h-1zM2 4h1v1h-1zM2 5h1v1h-1zM2 6h1v1h-1zM1 7h3v1h-3zM0 8h1v1h-1zM2 8h1v1h-1zM4 8h1v1h-1z" },
  { lang: "Kotlin", rune: "gar", color: "#A97BFF", d: "M0 0h1v1h-1zM2 0h1v1h-1zM4 0h1v1h-1zM1 1h3v1h-3zM1 2h3v1h-3zM2 3h1v1h-1zM2 4h1v1h-1zM1 5h3v1h-3zM1 6h3v1h-3zM0 7h1v1h-1zM2 7h1v1h-1zM4 7h1v1h-1zM0 8h1v1h-1zM2 8h1v1h-1zM4 8h1v1h-1z" },
  { lang: "Swift", rune: "ear", color: "#F26B56", d: "M2 0h1v1h-1zM1 1h3v1h-3zM0 2h1v1h-1zM2 2h1v1h-1zM4 2h1v1h-1zM2 3h1v1h-1zM1 4h3v1h-3zM0 5h1v1h-1zM2 5h1v1h-1zM4 5h1v1h-1zM2 6h1v1h-1zM2 7h1v1h-1zM2 8h1v1h-1z" },
  { lang: "Dart", rune: "dagaz", color: "#26BFB8", d: "M0 0h1v1h-1zM4 0h1v1h-1zM0 1h2v1h-2zM3 1h2v1h-2zM0 2h2v1h-2zM3 2h2v1h-2zM0 3h1v1h-1zM2 3h1v1h-1zM4 3h1v1h-1zM0 4h1v1h-1zM2 4h1v1h-1zM4 4h1v1h-1zM0 5h2v1h-2zM3 5h2v1h-2zM0 6h2v1h-2zM3 6h2v1h-2zM0 7h1v1h-1zM4 7h1v1h-1zM0 8h1v1h-1zM4 8h1v1h-1z" },
  { lang: "Shell", rune: "stan", color: "#89E051", d: "M2 0h1v1h-1zM2 1h1v1h-1zM0 2h5v1h-5zM0 3h1v1h-1zM2 3h1v1h-1zM4 3h1v1h-1zM0 4h1v1h-1zM2 4h1v1h-1zM4 4h1v1h-1zM0 5h5v1h-5zM2 6h1v1h-1zM2 7h1v1h-1zM2 8h1v1h-1z" },
  { lang: "PowerShell", rune: "thurisaz", color: "#7A8DA7", d: "M1 0h1v1h-1zM1 1h1v1h-1zM1 2h1v1h-1zM1 3h3v1h-3zM1 4h1v1h-1zM4 4h1v1h-1zM1 5h3v1h-3zM1 6h1v1h-1zM1 7h1v1h-1zM1 8h1v1h-1z" },
  { lang: "HTML", rune: "hagalaz", color: "#E76747", d: "M0 0h1v1h-1zM4 0h1v1h-1zM0 1h1v1h-1zM4 1h1v1h-1zM0 2h1v1h-1zM4 2h1v1h-1zM0 3h1v1h-1zM4 3h1v1h-1zM0 4h3v1h-3zM4 4h1v1h-1zM0 5h1v1h-1zM3 5h2v1h-2zM0 6h1v1h-1zM4 6h1v1h-1zM0 7h1v1h-1zM4 7h1v1h-1zM0 8h1v1h-1zM4 8h1v1h-1z" },
  { lang: "CSS", rune: "algiz", color: "#A182C0", d: "M0 1h1v1h-1zM4 1h1v1h-1zM1 2h3v1h-3zM1 3h3v1h-3zM2 4h1v1h-1zM2 5h1v1h-1zM2 6h1v1h-1zM2 7h1v1h-1zM2 8h1v1h-1z" },
  { lang: "SCSS", rune: "ing-square", color: "#CF6D9D", d: "M0 2h5v1h-5zM0 3h2v1h-2zM3 3h2v1h-2zM0 4h1v1h-1zM2 4h1v1h-1zM4 4h1v1h-1zM0 5h2v1h-2zM3 5h2v1h-2zM0 6h5v1h-5z" },
  { lang: "Jupyter Notebook", rune: "ingwaz", color: "#E07430", d: "M2 1h1v1h-1zM1 2h1v1h-1zM3 2h1v1h-1zM1 3h1v1h-1zM3 3h1v1h-1zM0 4h1v1h-1zM4 4h1v1h-1zM1 5h1v1h-1zM3 5h1v1h-1zM1 6h1v1h-1zM3 6h1v1h-1zM2 7h1v1h-1z" },
  { lang: "Vue", rune: "uruz", color: "#41B883", d: "M0 0h1v1h-1zM0 1h2v1h-2zM0 2h1v1h-1zM2 2h2v1h-2zM0 3h1v1h-1zM4 3h1v1h-1zM0 4h1v1h-1zM4 4h1v1h-1zM0 5h1v1h-1zM4 5h1v1h-1zM0 6h1v1h-1zM4 6h1v1h-1zM0 7h1v1h-1zM4 7h1v1h-1zM0 8h1v1h-1zM4 8h1v1h-1z" },
  { lang: "Svelte", rune: "naudiz", color: "#FF5B26", d: "M2 0h1v1h-1zM2 1h1v1h-1zM2 2h1v1h-1zM0 3h1v1h-1zM2 3h1v1h-1zM1 4h2v1h-2zM2 5h3v1h-3zM2 6h1v1h-1zM2 7h1v1h-1zM2 8h1v1h-1z" },
  { lang: "Lua", rune: "laguz", color: "#7A7ABD", d: "M1 0h1v1h-1zM1 1h2v1h-2zM1 2h1v1h-1zM3 2h1v1h-1zM1 3h1v1h-1zM4 3h1v1h-1zM1 4h1v1h-1zM1 5h1v1h-1zM1 6h1v1h-1zM1 7h1v1h-1zM1 8h1v1h-1z" },
  { lang: "R", rune: "ansuz", color: "#3C9DEB", d: "M1 0h1v1h-1zM1 1h2v1h-2zM1 2h1v1h-1zM3 2h1v1h-1zM1 3h1v1h-1zM4 3h1v1h-1zM1 4h2v1h-2zM1 5h1v1h-1zM3 5h1v1h-1zM1 6h1v1h-1zM4 6h1v1h-1zM1 7h1v1h-1zM1 8h1v1h-1z" },
  { lang: "Scala", rune: "berkanan", color: "#D36775", d: "M0 0h1v1h-1zM0 1h3v1h-3zM0 2h1v1h-1zM3 2h1v1h-1zM0 3h3v1h-3zM0 4h1v1h-1zM0 5h3v1h-3zM0 6h1v1h-1zM3 6h1v1h-1zM0 7h3v1h-3zM0 8h1v1h-1z" },
  { lang: "Objective-C", rune: "ior", color: "#438EFF", d: "M2 0h1v1h-1zM2 1h1v1h-1zM2 2h1v1h-1zM1 3h3v1h-3zM0 4h1v1h-1zM2 4h1v1h-1zM4 4h1v1h-1zM2 5h1v1h-1zM2 6h1v1h-1zM2 7h1v1h-1zM2 8h1v1h-1z" },
  { lang: "Perl", rune: "fehu", color: "#28A7CC", d: "M1 0h1v1h-1zM4 0h1v1h-1zM1 1h1v1h-1zM3 1h1v1h-1zM1 2h2v1h-2zM4 2h1v1h-1zM1 3h1v1h-1zM3 3h1v1h-1zM1 4h2v1h-2zM1 5h1v1h-1zM1 6h1v1h-1zM1 7h1v1h-1zM1 8h1v1h-1z" },
  { lang: "Haskell", rune: "mannaz", color: "#8B80A7", d: "M0 0h1v1h-1zM4 0h1v1h-1zM0 1h2v1h-2zM3 1h2v1h-2zM0 2h1v1h-1zM2 2h1v1h-1zM4 2h1v1h-1zM0 3h2v1h-2zM3 3h2v1h-2zM0 4h1v1h-1zM4 4h1v1h-1zM0 5h1v1h-1zM4 5h1v1h-1zM0 6h1v1h-1zM4 6h1v1h-1zM0 7h1v1h-1zM4 7h1v1h-1zM0 8h1v1h-1zM4 8h1v1h-1z" },
  { lang: "Elixir", rune: "ehwaz", color: "#967CA2", d: "M0 0h1v1h-1zM4 0h1v1h-1zM0 1h2v1h-2zM3 1h2v1h-2zM0 2h2v1h-2zM3 2h2v1h-2zM0 3h1v1h-1zM2 3h1v1h-1zM4 3h1v1h-1zM0 4h1v1h-1zM4 4h1v1h-1zM0 5h1v1h-1zM4 5h1v1h-1zM0 6h1v1h-1zM4 6h1v1h-1zM0 7h1v1h-1zM4 7h1v1h-1zM0 8h1v1h-1zM4 8h1v1h-1z" },
  { lang: "Dockerfile", rune: "cealc", color: "#859296", d: "M2 0h1v1h-1zM2 1h1v1h-1zM2 2h1v1h-1zM1 3h3v1h-3zM1 4h3v1h-3zM0 5h1v1h-1zM2 5h1v1h-1zM4 5h1v1h-1zM1 6h3v1h-3zM1 7h3v1h-3zM0 8h1v1h-1zM2 8h1v1h-1zM4 8h1v1h-1z" },
  { lang: "Anything else", rune: "othala", color: "#C89B3C", d: "M2 0h1v1h-1zM1 1h1v1h-1zM3 1h1v1h-1zM1 2h1v1h-1zM3 2h1v1h-1zM0 3h1v1h-1zM4 3h1v1h-1zM1 4h1v1h-1zM3 4h1v1h-1zM2 5h1v1h-1zM2 6h1v1h-1zM1 7h1v1h-1zM3 7h1v1h-1zM0 8h1v1h-1zM4 8h1v1h-1z" },
];
