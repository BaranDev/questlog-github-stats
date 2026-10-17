import { SCENES, card } from "./data";
import s from "./Bento.module.css";

const FAN = [card("stats", "castle-aurora", "&time=night&scale=2"), card("languages", "castle-aurora", "&time=night&scale=2"), card("streak", "castle-aurora", "&time=night&scale=2")];

export default function Bento() {
  return (
    <section className="section" id="features" aria-labelledby="features-title">
      <div className="section-head">
        <h2 className="h2" id="features-title">
          How it works
        </h2>
        <p className="lede">
          Your README links to an image. questlog draws it on its own server, so there is nothing to install or keep
          running.
        </p>
      </div>

      <div className={s.grid}>
        <article className={`${s.card} ${s.scenes}`}>
          <div className={`${s.mosaic} pix`} aria-hidden="true">
            {SCENES.map((scene) => (
              <img key={scene} src={`/art/${scene}/streak.png`} width={320} height={128} alt="" loading="lazy" />
            ))}
          </div>
          <div className={s.copy}>
            <p className={s.big}>16</p>
            <h3 className={s.title}>painted scenes</h3>
            <p className={s.text}>
              Forests, castles, cozy places and old halls. Every scene has all three cards.
            </p>
          </div>
        </article>

        <article className={`${s.card} ${s.setup}`}>
          <h3 className={s.words}>
            <span>Nothing to set up</span>
          </h3>
          <p className={s.text}>GitHub loads a public image. No token, no workflow, no Action to schedule.</p>
        </article>

        <article className={`${s.card} ${s.daynight}`}>
          <div className={`${s.sky} pix`} aria-hidden="true">
            <img src="/art/rose-garden/streak.png" width={320} height={128} alt="" loading="lazy" />
            <img className={s.night} src="/art/rose-garden/streak-night.png" width={320} height={128} alt="" loading="lazy" />
          </div>
          <div className={s.copy}>
            <h3 className={s.title}>Day and night</h3>
            <p className={s.text}>
              Readers on a dark theme get the night painting, through a plain <code>&lt;picture&gt;</code> tag.
            </p>
          </div>
        </article>

        <article className={`${s.card} ${s.three}`}>
          <div className={s.copy}>
            <h3 className={s.title}>Three cards</h3>
            <p className={s.text}>A Character Sheet of your stats, a Spellbook of your top languages and a fire that grows with your streak.</p>
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
