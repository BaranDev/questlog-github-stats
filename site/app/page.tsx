import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Bento from "@/components/Bento";
import Themes from "@/components/Themes";
import CardStack from "@/components/CardStack";
import Marquee from "@/components/Marquee";
import Gallery from "@/components/Gallery";
import Builder from "@/components/Builder";
import s from "./page.module.css";

const HERO = "/stats?user=BaranDev&scene=castle&scale=3";

export default function Home() {
  return (
    <>
      <a className="skip" href="#top">
        Skip to content
      </a>
      <Nav />
      <main id="top" style={{ overflowX: "clip" }}>
        <section className={s.hero}>
          <div className={s.heroCopy}>
            <h1 className={s.h1}>
              Your GitHub profile, painted like a <span className={s.realm}>realm.</span>
            </h1>
            <p className={s.heroLine}>Hand-painted pixel-art cards for your README. No setup.</p>
            <div className={s.ctas}>
              <a className="btn btn-primary" href="#demo">
                Make my cards
              </a>
              <a className="btn btn-ghost" href="/wiki">
                Read the wiki
              </a>
            </div>
          </div>
          <div className={s.heroArt}>
            <picture className="pix">
              <source media="(prefers-color-scheme: dark)" srcSet={`${HERO}&time=night`} />
              <img src={HERO} width={960} height={384} alt="BaranDev's Character Sheet in the castle scene" />
            </picture>
          </div>
        </section>

        <Bento />
        <Themes />
        <CardStack />
        <Marquee />
        <Gallery />
        <Builder />

        <section className={s.cta}>
          <h2 className={s.ctaTitle}>
            Paste one line.
            <br />
            Your profile becomes a <span className={s.realm}>realm.</span>
          </h2>
          <div className={s.ctas}>
            <a className="btn btn-primary" href="#demo">
              Make my cards
            </a>
            <a className="btn btn-ghost" href="/wiki">
              Read the wiki
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
