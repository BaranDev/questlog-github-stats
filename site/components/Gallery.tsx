"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { card, cardName, type Widget } from "./data";
import s from "./Gallery.module.css";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const SHOTS: [Widget, string, "day" | "night"][] = [
  ["stats", "castle-aurora", "night"],
  ["languages", "fairy-garden", "day"],
  ["streak", "observatory", "night"],
  ["stats", "rose-garden", "day"],
  ["languages", "war-room", "night"],
  ["streak", "witch-cottage", "day"],
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
          Every scene,
          <br />
          by day and by night.
        </h2>
        <p className="lede">Light mode shows the day painting, dark mode brings the night. Same card, same numbers.</p>
      </div>
      <div className={s.grid}>
        {SHOTS.map(([w, scene, time]) => (
          <figure key={w + scene} className={s.shot}>
            <div className={s.frame}>
              <img
                className="pix"
                src={card(w, scene, `&time=${time}&scale=2`)}
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
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
