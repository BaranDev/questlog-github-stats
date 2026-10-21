import { THEMES, card, cardName, sceneName, snap } from "../data";
import s from "./Themes.module.css";
import { m } from "@/i18n";

export default function Themes() {
  return (
    <section className="section" id="scenes" aria-labelledby="scenes-title">
      <div className="section-head">
        <h2 className="h2" id="scenes-title">
          {m.home.themes.title}
        </h2>
        <p className="lede">{m.home.themes.lede}</p>
      </div>

      <div className={s.accordion}>
        {THEMES.map((t) => (
          <article key={t.name} className={s.slice} aria-label={m.home.themes.label(t.name)}>
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
                        alt={m.home.themes.thumbAlt(cardName("stats", scene), sceneName(scene))}
                      />
                      <span>{sceneName(scene)}</span>
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
