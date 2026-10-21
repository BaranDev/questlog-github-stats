"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { DEMO_USER, card, cardName, sceneName, snap, type Widget } from "../data";
import s from "./Gallery.module.css";
import { m } from "@/i18n";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// The streak shots come in pairs: the scene's themed fire, then the classic flame.
const SHOTS: [Widget, string, "day" | "night", ("themed" | "classic")?][] = [
  ["stats", "castle-aurora", "night"],
  ["languages", "fairy-garden", "day"],
  ["streak", "observatory", "night", "themed"],
  ["streak", "observatory", "night", "classic"],
  ["stats", "rose-garden", "day"],
  ["languages", "war-room", "night"],
  ["streak", "cloud-kingdom", "day", "themed"],
  ["streak", "cloud-kingdom", "day", "classic"],
];

export default function Gallery() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
        gsap.utils.toArray<HTMLElement>(`.${s.shot}`, root.current).forEach((shot) => {
          const frame = shot.querySelector(`.${s.frame}`);
          gsap
            .timeline({ scrollTrigger: { trigger: shot, start: "top bottom", end: "bottom top", scrub: true } })
            .fromTo(frame, { scale: 0.8 }, { scale: 1, duration: 0.4, ease: "power1.out" })
            .fromTo(frame, { opacity: 1 }, { opacity: 0.2, duration: 0.2, ease: "none" }, 0.8);
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="section" aria-labelledby="gallery-title">
      <div className="section-head">
        <h2 className="h2" id="gallery-title">
          {m.home.gallery.title}
        </h2>
        <p className="lede">{m.home.gallery.lede}</p>
      </div>
      <div className={s.grid}>
        {SHOTS.map(([w, scene, time, fire]) => (
          <figure key={w + scene + fire} className={s.shot}>
            <div className={s.frame}>
              <img
                className="pix"
                src={snap(card(w, scene, `&time=${time}${fire ? `&fire=${fire}` : ""}&scale=2`))}
                width={640}
                height={256}
                loading="lazy"
                alt={m.home.gallery.alt(DEMO_USER, cardName(w, scene), sceneName(scene), m.home.gallery.times[time])}
              />
            </div>
            <figcaption>
              <strong className="display">{cardName(w, scene)}</strong>
              <span>
                {sceneName(scene)}, {m.home.gallery.times[time]}
                {fire && m.home.gallery.fire(m.home.gallery.fires[fire])}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
