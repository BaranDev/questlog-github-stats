"use client";

import { useEffect, useRef } from "react";
import Rune from "../Rune";
import { RUNES } from "../data";
import s from "./Marquee.module.css";
import { m } from "@/i18n";

function Row({ hidden }: { hidden?: boolean }) {
  return (
    <ul className={s.row} aria-hidden={hidden || undefined}>
      {RUNES.map((r) => (
        <li key={r.lang} className={s.item}>
          <Rune rune={r} size={5} />
          <span>{r.lang}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Marquee() {
  const box = useRef<HTMLDivElement>(null);
  // the row moves only while it can be seen
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => el.toggleAttribute("data-live", e.isIntersecting), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section className={s.wrap} aria-labelledby="runes-title">
      <div className={`section ${s.head}`}>
        <div className="section-head">
          <h2 className="h2" id="runes-title">
            {m.home.runes.title}
          </h2>
          <p className="lede">{m.home.runes.lede}</p>
        </div>
      </div>
      <div ref={box} className={s.marquee}>
        <div className={s.track}>
          <Row />
          <Row hidden />
        </div>
      </div>
    </section>
  );
}
