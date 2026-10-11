import { REPO } from "./data";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-top">
        <a className="footer-mark" href="/">
          questlog
        </a>
        <nav aria-label="Footer">
          <a href="/#demo">Make my cards</a>
          <a href="/#scenes">Scenes</a>
          <a href="/wiki">Wiki</a>
          <a href="/wiki#self-hosting">Self-hosting</a>
          <a href={REPO}>GitHub</a>
        </nav>
      </div>
      <p className="footer-fine">
        Code under the <a href={`${REPO}/blob/master/LICENSE`}>MIT license</a>, paintings under{" "}
        <a href={`${REPO}/blob/master/ART-LICENSE.md`}>CC BY-NC 4.0</a> (commercial use needs permission). Nodesto Caps Condensed by Solbera (CC BY-SA 4.0),
        Tiny5 by Stefan Schmidt and Outfit by the Outfit Project Authors (SIL OFL 1.1).
      </p>
    </footer>
  );
}
