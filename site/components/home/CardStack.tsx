"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { DEMO_USER, card, cardName, snap } from "../data";
import s from "./CardStack.module.css";
import { m } from "@/i18n";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const CARDS = [
  { name: cardName("stats", "forest"), src: snap(card("stats", "forest", "&scale=2")), caption: m.home.stack.stats },
  { name: cardName("languages", "forest"), src: snap(card("languages", "forest", "&scale=2")), caption: m.home.stack.languages },
  { name: cardName("streak", "forest"), src: snap(card("streak", "forest", "&scale=2")), caption: m.home.stack.streak },
];

export default function CardStack() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const el = root.current!;
        const cards = gsap.utils.toArray<HTMLElement>(`.${s.card}`, el);
        el.classList.add(s.stacking);
        const dims = cards.map((c) => c.querySelector(`.${s.dim}`));
        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: { trigger: el, start: "top top", end: "+=180%", pin: true, scrub: 0.6, invalidateOnRefresh: true },
        });
        cards.slice(1).forEach((c, i) => {
          tl.fromTo(c, { y: () => window.innerHeight }, { y: 0, duration: 1 }, i);
          cards.slice(0, i + 1).forEach((under, j) => {
            const depth = i + 1 - j;
            tl.to(under, { y: -depth * 26, scale: 1 - depth * 0.05, duration: 1 }, i);
            tl.to(dims[j], { opacity: depth * 0.22, duration: 1 }, i);
          });
        });
        return () => el.classList.remove(s.stacking);
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className={s.stage} id="cards" aria-labelledby="cards-title">
      <div className={s.inner}>
        <div className={s.copy}>
          <h2 className="h2" id="cards-title">
            {m.home.stack.title}
          </h2>
          <p className="lede">{m.home.stack.lede}</p>
        </div>
        <div className={s.deck}>
          {CARDS.map((c) => (
            <figure key={c.name} className={s.card}>
              <img className="pix" src={c.src} width={640} height={256} alt={m.home.stack.alt(DEMO_USER, c.name)} />
              <span className={s.dim} aria-hidden="true" />
              <figcaption>
                <strong className="display">{c.name}</strong>
                <span>{c.caption}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
