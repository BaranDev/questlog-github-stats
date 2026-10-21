import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Bento from "@/components/home/Bento";
import Themes from "@/components/home/Themes";
import CardStack from "@/components/home/CardStack";
import Marquee from "@/components/home/Marquee";
import Gallery from "@/components/home/Gallery";
import Decorations from "@/components/home/Decorations";
import { DEMO_USER, snap } from "@/components/data";
import { m } from "@/i18n";
import s from "./page.module.css";

const HERO = "/stats?user=BaranDev&scene=castle&scale=3";

export default function Home() {
  return (
    <>
      {/* old /#demo links go to the builder */}
      <script dangerouslySetInnerHTML={{ __html: `if(location.hash==="#demo")location.replace("/builder")` }} />
      <a className="skip" href="#top">
        {m.site.skip}
      </a>
      <Nav />
      <main id="top" style={{ overflowX: "clip" }}>
        <section className={s.hero}>
          <div className={s.heroCopy}>
            <h1 className={s.h1}>{m.home.hero.title}</h1>
            <p className={s.heroLine}>{m.home.hero.line}</p>
            <div className={s.ctas}>
              <a className="btn btn-primary" href="/builder">
                {m.home.hero.make}
              </a>
              <a className="btn btn-ghost" href="/wiki">
                {m.home.hero.wiki}
              </a>
            </div>
          </div>
          <div className={s.heroArt}>
            <picture className="pix">
              <source media="(prefers-color-scheme: dark)" srcSet={snap(`${HERO}&time=night`)} />
              <img src={snap(HERO)} width={960} height={384} alt={m.home.hero.alt(DEMO_USER)} />
            </picture>
          </div>
        </section>

        <Bento />
        <Themes />
        <CardStack />
        <Decorations />
        <Marquee />
        <Gallery />
      </main>
      <Footer />
    </>
  );
}
