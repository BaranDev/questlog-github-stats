import { THEMES, card, isReady, sceneName, snap } from "./data";
import s from "./Themes.module.css";

export default function Themes() {
  return (
    <section className="section" id="scenes" aria-labelledby="scenes-title">
      <div className="section-head">
        <h2 className="h2" id="scenes-title">
          Scenes
        </h2>
        <p className="lede">16 scenes in four themes, each painted by day and by night. Open one in the wiki to see all of its cards.</p>
      </div>

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
                        src={snap(card("stats", scene, "&scale=1"))}
                        width={320}
                        height={128}
                        loading="lazy"
                        alt={`Character Sheet in the ${sceneName(scene)} scene`}
                      />
                      <span>
                        {sceneName(scene)}
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
