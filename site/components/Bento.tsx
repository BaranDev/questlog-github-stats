import { SCENES, card } from "./data";
import s from "./Bento.module.css";

const FAN = [card("stats", "castle-aurora", "&time=night&scale=2"), card("languages", "castle-aurora", "&time=night&scale=2"), card("streak", "castle-aurora", "&time=night&scale=2")];

export default function Bento() {
  return (
    <section className="section" id="features" aria-labelledby="features-title">
      <div className="section-head">
        <h2 className="h2" id="features-title">
          One line of HTML.
          <br />A whole realm behind it.
        </h2>
        <p className="lede">
          questlog paints your cards on its own server. Your README only links to an image, so there is nothing to
          install, schedule or keep alive.
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
            <h3 className={s.title}>scenes, painted by hand</h3>
            <p className={s.text}>
              Forests, castles, cozy corners and scholarly halls. Every scene has all three cards, painted to match.
            </p>
          </div>
        </article>

        <article className={`${s.card} ${s.setup}`}>
          <h3 className={s.words}>
            <span>No token.</span>
            <span>No workflow.</span>
            <span>No setup.</span>
          </h3>
          <p className={s.text}>GitHub fetches a public image. Your profile needs nothing else.</p>
        </article>

        <article className={`${s.card} ${s.daynight}`}>
          <div className={`${s.sky} pix`} aria-hidden="true">
            <img src="/art/rose-garden/streak.png" width={320} height={128} alt="" loading="lazy" />
            <img className={s.night} src="/art/rose-garden/streak-night.png" width={320} height={128} alt="" loading="lazy" />
          </div>
          <div className={s.copy}>
            <h3 className={s.title}>Night falls on its own</h3>
            <p className={s.text}>
              Readers in dark mode get the night painting, through a plain <code>&lt;picture&gt;</code>.
            </p>
          </div>
        </article>

        <article className={`${s.card} ${s.three}`}>
          <div className={s.copy}>
            <h3 className={s.title}>Three cards</h3>
            <p className={s.text}>A Character Sheet, a Spellbook of your languages and a fire that grows with your streak.</p>
          </div>
          <div className={`${s.fan} pix`} aria-hidden="true">
            {FAN.map((src) => (
              <img key={src} src={src} width={640} height={256} alt="" loading="lazy" />
            ))}
          </div>
        </article>

        <article className={`${s.card} ${s.host}`}>
          <div className={s.copy}>
            <h3 className={s.title}>Or keep your own</h3>
            <p className={s.text}>One Docker image and your own token. It can count your private contributions too.</p>
          </div>
          <pre className={s.term}>
            <code>
              <span>$</span> docker build -t questlog .{"\n"}
              <span>$</span> docker run -p 8080:8080 --env-file .env questlog
            </code>
          </pre>
        </article>
      </div>
    </section>
  );
}
