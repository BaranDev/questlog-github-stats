import { THEMES, card, isReady } from "./data";
import s from "./Themes.module.css";

function Pill({ scene }: { scene: string }) {
  return <span className={`${s.pill} pix`} style={{ backgroundImage: `url(/art/${scene}/streak.png)` }} aria-hidden="true" />;
}

export default function Themes() {
  return (
    <section className="section" id="scenes" aria-labelledby="scenes-title">
      <h2 className={s.heading} id="scenes-title">
        Pick a realm, from <Pill scene="forest" /> deep forests to <Pill scene="castle" /> castle walls,{" "}
        <Pill scene="witch-cottage" /> cozy cottages and <Pill scene="royal-library" /> quiet libraries.
      </h2>

      <div className={s.accordion}>
        {THEMES.map((t) => (
          <article key={t.name} className={s.slice} aria-label={`${t.name} scenes`}>
            <div className={`${s.bg} pix`} style={{ backgroundImage: `url(/art/${t.cover}/streak.png)` }} />
            <h3 className={s.spine} aria-hidden="true">
              {t.name}
            </h3>
            <div className={s.body}>
              <h3 className={s.name}>{t.name}</h3>
              <p className={s.blurb}>{t.blurb}</p>
              <ul className={s.thumbs}>
                {t.scenes.map((scene) => (
                  <li key={scene}>
                    <a href={`/wiki#scene-${scene}`}>
                      <img
                        className="pix"
                        src={card("stats", scene, "&scale=1")}
                        width={320}
                        height={128}
                        loading="lazy"
                        alt={`Character Sheet in the ${scene} scene`}
                      />
                      <span>
                        {scene}
                        {!isReady(scene) && (
                          <small className={s.wip} title="Fire being reworked">
                            WIP
                          </small>
                        )}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
