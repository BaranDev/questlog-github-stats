import { DECORATIONS, snap } from "../data";
import s from "./Decorations.module.css";

const address = (name: string, title: string) => `/decorations/${name}${title ? `?title=${encodeURIComponent(title)}` : ""}`;

export default function Decorations() {
  return (
    <section className="section" aria-labelledby="decorations-title">
      <div className="section-head">
        <h2 className="h2" id="decorations-title">
          Decorations
        </h2>
        <p className="lede">
          Painted banners to head the sections of your README, or to divide them. Write any title you like, or none.
          Each one is painted by day and by night, and switches with the reader&apos;s theme like the cards.
        </p>
      </div>
      <div className={s.grid}>
        {DECORATIONS.map((d) => (
          <figure key={d.name} className={d.h < 128 ? `${s.shot} ${s.wide}` : s.shot}>
            <picture className={s.frame}>
              <source media="(prefers-color-scheme: dark)" srcSet={snap(`${address(d.name, d.title)}${d.title ? "&" : "?"}scale=2&time=night`)} />
              <img
                className="pix"
                src={snap(`${address(d.name, d.title)}${d.title ? "&" : "?"}scale=2`)}
                width={640}
                height={d.h * 2}
                loading="lazy"
                alt={d.title ? `The ${d.label} decoration titled ${d.title}` : `The ${d.label} decoration`}
              />
            </picture>
            <figcaption>
              <strong className="display">{d.label}</strong>
              <code>{address(d.name, d.title).replace(/%20/g, " ")}</code>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className={s.more}>
        <a className="btn btn-ghost" href="/builder">
          Add one in the profile builder
        </a>
      </p>
    </section>
  );
}
