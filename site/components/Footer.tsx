import { REPO } from "./data";
import Attributions from "./Attributions";
import { m, rich } from "@/i18n";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-top">
        <a className="footer-mark" href="/">
          questlog
        </a>
        <nav aria-label={m.site.footer.label}>
          <a href="/builder">{m.site.footer.makeCards}</a>
          <a href="/#scenes">{m.site.footer.scenes}</a>
          <a href="/cards">{m.site.footer.allCards}</a>
          <a href="/wiki">{m.site.footer.wiki}</a>
          <a href="/status">{m.site.footer.health}</a>
          <a href={REPO}>{m.site.footer.github}</a>
        </nav>
      </div>
      <p className="footer-fine">
        {rich(m.site.footer.fine, {
          home: (c) => <a href="https://questlog.cc">{c}</a>,
          mit: (c) => <a href={`${REPO}/blob/main/LICENSE`}>{c}</a>,
          cc: (c) => <a href={`${REPO}/blob/main/ART-LICENSE.md`}>{c}</a>,
        })}
      </p>
      <Attributions />
    </footer>
  );
}
