import { SCENES, card, snap } from "../data";
import s from "./Bento.module.css";
import { m, rich } from "@/i18n";

const FAN = (["stats", "languages", "streak"] as const).map((w) => snap(card(w, "castle-aurora", "&time=night&scale=2")));

export default function Bento() {
  return (
    <section className="section" id="features" aria-labelledby="features-title">
      <div className="section-head">
        <h2 className="h2" id="features-title">
          {m.home.bento.title}
        </h2>
        <p className="lede">{m.home.bento.lede}</p>
      </div>

      <div className={s.grid}>
        <article className={`${s.card} ${s.scenes}`}>
          <div className={`${s.mosaic} pix`} aria-hidden="true">
            {SCENES.map((scene) => (
              <img key={scene} src={`/art/${scene}/streak.png`} width={320} height={128} alt="" loading="lazy" />
            ))}
          </div>
          <div className={s.copy}>
            <p className={s.big}>{m.home.bento.scenesBig}</p>
            <h3 className={s.title}>{m.home.bento.scenesTitle}</h3>
            <p className={s.text}>{m.home.bento.scenesText}</p>
          </div>
        </article>

        <article className={`${s.card} ${s.setup}`}>
          <h3 className={s.words}>
            <span>{m.home.bento.setupTitle}</span>
          </h3>
          <p className={s.text}>{m.home.bento.setupText}</p>
        </article>

        <article className={`${s.card} ${s.daynight}`}>
          <div className={`${s.sky} pix`} aria-hidden="true">
            <img src="/art/rose-garden/streak.png" width={320} height={128} alt="" loading="lazy" />
            <img className={s.night} src="/art/rose-garden/streak-night.png" width={320} height={128} alt="" loading="lazy" />
          </div>
          <div className={s.copy}>
            <h3 className={s.title}>{m.home.bento.dayNightTitle}</h3>
            <p className={s.text}>{rich(m.home.bento.dayNightText, { code: (c) => <code>{c}</code> })}</p>
          </div>
        </article>

        <article className={`${s.card} ${s.three}`}>
          <div className={s.copy}>
            <h3 className={s.title}>{m.home.bento.threeTitle}</h3>
            <p className={s.text}>{m.home.bento.threeText}</p>
          </div>
          <div className={`${s.fan} pix`} aria-hidden="true">
            {FAN.map((src) => (
              <img key={src} src={src} width={640} height={256} alt="" loading="lazy" />
            ))}
          </div>
        </article>

      </div>
    </section>
  );
}
