// Copies what the builder preview needs out of ../art and the sample stats into public/preview, so the preview
// can draw a card in the browser without asking the card server. Skipped where ../art is absent (the Docker site
// stage); the committed copy is used then.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");
const art = path.join(root, "art");
const out = path.resolve(import.meta.dirname, "..", "public", "preview");
if (!fs.existsSync(art)) {
  console.log("export-art: no ../art here, keeping public/preview as committed");
  process.exit(0);
}

const WIDGETS = ["stats", "languages", "streak"];
const SPRITE_DIRS = ["sprites", "sprites-night", "sprites-themed", "sprites-themed-night"];
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const pngs = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)) : []);

// glyphs.json beside them comes from export-glyphs.py and stays
fs.rmSync(path.join(out, "sprites"), { recursive: true, force: true });
fs.mkdirSync(path.join(out, "sprites"), { recursive: true });
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};

// Shared fire sprites only; runes come from the site's own rune table.
const shared = pngs(path.join(art, "_shared", "sprites")).filter((n) => !n.startsWith("rune-"));
for (const n of shared) copy(path.join(art, "_shared", "sprites", `${n}.png`), path.join(out, "sprites", "_shared", `${n}.png`));

const scenes = {};
for (const name of fs.readdirSync(art).sort()) {
  const dir = path.join(art, name);
  if (!fs.existsSync(path.join(dir, "scene.json"))) continue;
  const s = read(path.join(dir, "scene.json"));
  // sprites/ and sprites-themed/, each with a -night/ twin drawn instead at night
  const sprites = Object.fromEntries(SPRITE_DIRS.map((d) => [d, pngs(path.join(dir, d))]));
  for (const d of SPRITE_DIRS)
    for (const n of sprites[d]) copy(path.join(dir, d, `${n}.png`), path.join(out, "sprites", name, d, `${n}.png`));
  scenes[name] = {
    ink: s.ink,
    night: s.night,
    titles: s.titles,
    labels: s.labels,
    anchors: Object.fromEntries(WIDGETS.map((w) => [w, read(path.join(dir, `${w}.json`))])),
    nightPaintings: WIDGETS.filter((w) => fs.existsSync(path.join(dir, `${w}-night.png`))),
    sprites,
  };
}

const sample = read(path.join(root, "tests", "fixtures", "sample.json"));
fs.writeFileSync(path.join(out, "scenes.json"), JSON.stringify({ shared, scenes, sample }));
console.log(`export-art: ${Object.keys(scenes).length} scenes, ${shared.length} shared sprites`);
