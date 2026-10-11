"use client";

import { useEffect, useRef, useState } from "react";
import type { Widget } from "./data";
import { FRAME_MS, H, W, draw, font, imgFrom, type ArtData, type GlyphData, type Img, type Loaded, type Options } from "./draw";

let art: Promise<ArtData> | undefined;
let glyphs: Promise<GlyphData> | undefined;
const images = new Map<string, Promise<HTMLImageElement | null>>();

/** A static image, once per page; null when it does not exist. */
function image(src: string) {
  let p = images.get(src);
  if (!p) {
    p = new Promise((done) => {
      const el = new Image();
      el.onload = () => done(el);
      el.onerror = () => done(null);
      el.src = src;
    });
    images.set(src, p);
  }
  return p;
}

const family = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

async function load(scene: string, w: Widget, night: boolean): Promise<{ L: Loaded; data: ArtData } | null> {
  art ??= fetch("/static/preview/scenes.json").then((r) => r.json());
  glyphs ??= fetch("/static/preview/glyphs.json").then((r) => r.json());
  const [data, g] = await Promise.all([art, glyphs]);
  const sc = data.scenes[scene];
  if (!sc) return null;
  const [tiny, nodesto] = [family("--font-tiny"), family("--font-nodesto")];
  await Promise.all([document.fonts.load(`8px ${tiny}`), document.fonts.load(`30px ${nodesto}`)]);
  const sprites = async (names: string[], dir: string) =>
    new Map(
      (await Promise.all(names.map(async (n) => [n, await image(`/static/preview/sprites/${dir}/${n}.png`)] as const)))
        .filter((e): e is [string, HTMLImageElement] => !!e[1])
        .map(([n, el]) => [n, imgFrom(el)] as [string, Img]),
    );
  const day = await image(`/art/${scene}/${w}.png`);
  if (!day) return null;
  const nightEl = night && sc.nightPaintings.includes(w) ? await image(`/art/${scene}/${w}-night.png`) : null;
  const streak = w === "streak";
  const L: Loaded = {
    scene: sc,
    day: imgFrom(day, [W, H]),
    night: nightEl ? imgFrom(nightEl, [W, H]) : null,
    sprites: Object.fromEntries(
      await Promise.all(
        Object.entries(streak ? sc.sprites : {})
          .filter(([d]) => night || !d.endsWith("-night"))
          .map(async ([d, names]) => [d, await sprites(names, `${scene}/${d}`)]),
      ),
    ),
    shared: streak ? await sprites(data.shared, "_shared") : new Map(),
    text: font(tiny, 8, false, g.text),
    title: font(nodesto, 30, true, g.title),
    titleSmall: font(nodesto, 20, true, g.titleSmall),
  };
  return { L, data };
}

/**
 * A card drawn in the browser from the scene's painting and the sample adventurer. It never asks the card server:
 * the builder shows what a URL would look like, and the snippet fetches the real card.
 */
export default function Preview({ scene, widget, night, options, alt }: { scene: string; widget: Widget; night: boolean; options: Options; alt: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [frames, setFrames] = useState<Img[]>([]);
  const opts = JSON.stringify(options);

  useEffect(() => {
    let alive = true;
    load(scene, widget, night).then((got) => {
      if (alive && got) setFrames(draw(got.L, widget, night, JSON.parse(opts), got.data.sample));
    });
    return () => {
      alive = false;
    };
  }, [scene, widget, night, opts]);

  useEffect(() => {
    const g = ref.current?.getContext("2d");
    if (!g || !frames.length) return;
    const still = frames.length === 1 || matchMedia("(prefers-reduced-motion: reduce)").matches;
    let f = 0;
    const show = () => g.putImageData(new ImageData(new Uint8ClampedArray(frames[f % frames.length].px), W, H), 0, 0);
    show();
    if (still) return;
    const t = window.setInterval(() => {
      f++;
      show();
    }, FRAME_MS);
    return () => window.clearInterval(t);
  }, [frames]);

  return <canvas ref={ref} className="pix" width={W} height={H} role="img" aria-label={alt} />;
}
