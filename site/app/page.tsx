import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Bento from "@/components/Bento";
import Themes from "@/components/Themes";
import CardStack from "@/components/CardStack";
import Marquee from "@/components/Marquee";
import Gallery from "@/components/Gallery";
import s from "./page.module.css";

const HERO = "/stats?user=BaranDev&scene=castle&scale=3";

export default function Home() {
  return (
    <>
      {/* the card maker that lived at /#demo is now the profile builder */}
      <script dangerouslySetInnerHTML={{ __html: `if(location.hash==="#demo")location.replace("/builder")` }} />
      <a className="skip" href="#top">
        Skip to content
      </a>
      <Nav />
      <main id="top" style={{ overflowX: "clip" }}>
        <section className={s.hero}>
          <div className={s.heroCopy}>
            <h1 className={s.h1}>Pixel-art cards for your GitHub profile</h1>
            <p className={s.heroLine}>
              Your stats, your top languages and your streak, drawn in one of 16 painted scenes. Add them to your README
              with one line: no token, no setup.
            </p>
            <div className={s.ctas}>
              <a className="btn btn-primary" href="/builder">
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
      </main>
      <Footer />
    </>
  );
}
