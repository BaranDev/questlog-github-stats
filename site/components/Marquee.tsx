import Rune from "./Rune";
import { RUNES } from "./data";
import s from "./Marquee.module.css";

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
  return (
    <section className={s.wrap} aria-labelledby="runes-title">
      <div className={`section ${s.head}`}>
        <div className="section-head">
          <h2 className="h2" id="runes-title">
            A rune for every language.
          </h2>
          <p className="lede">
            The Spellbook marks your top five languages with futhark runes, each in its language&apos;s own color.
            Thirty runes in all, and othala for everything else.
          </p>
        </div>
      </div>
      <div className={s.marquee}>
        <div className={s.track}>
          <Row />
          <Row hidden />
        </div>
      </div>
    </section>
  );
}
