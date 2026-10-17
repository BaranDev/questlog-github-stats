"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { card, cardName, type Widget } from "./data";
import s from "./Gallery.module.css";

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
            .fromTo(frame, { opacity: 1, filter: "brightness(1)" }, { opacity: 0.2, filter: "brightness(0.5)", duration: 0.2, ease: "none" }, 0.8);
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="section" aria-labelledby="gallery-title">
      <div className="section-head">
        <h2 className="h2" id="gallery-title">
          Day and night
        </h2>
        <p className="lede">A light theme shows the day painting and a dark theme the night one. The numbers stay the same.</p>
      </div>
      <div className={s.grid}>
        {SHOTS.map(([w, scene, time, fire]) => (
          <figure key={w + scene + fire} className={s.shot}>
            <div className={s.frame}>
              <img
                className="pix"
                src={card(w, scene, `&time=${time}${fire ? `&fire=${fire}` : ""}&scale=2`)}
                width={640}
                height={256}
                loading="lazy"
                alt={`BaranDev's ${cardName(w, scene)} in the ${scene} scene, ${time}`}
              />
            </div>
            <figcaption>
              <strong className="display">{cardName(w, scene)}</strong>
              <span>
                {scene}, {time}
                {fire && `, ${fire} fire`}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
