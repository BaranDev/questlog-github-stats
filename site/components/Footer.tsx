import { REPO } from "./data";
import Attributions from "./Attributions";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-top">
        <a className="footer-mark" href="/">
          questlog
        </a>
        <nav aria-label="Footer">
          <a href="/builder">Make my cards</a>
          <a href="/#scenes">Scenes</a>
          <a href="/wiki">Wiki</a>
          <a href="/status">Health</a>
          <a href={REPO}>GitHub</a>
        </nav>
      </div>
      <p className="footer-fine">
        <a href="https://questlog.cc">questlog</a> by Cevdet Baran Oral. Code under the{" "}
        <a href={`${REPO}/blob/main/LICENSE`}>MIT license</a>, paintings under{" "}
        <a href={`${REPO}/blob/main/ART-LICENSE.md`}>CC BY-NC 4.0</a> (commercial use needs permission).
      </p>
      <Attributions />
    </footer>
  );
}
