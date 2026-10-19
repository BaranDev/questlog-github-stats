import { REPO } from "./data";

export default function Nav() {
  return (
    <header className="nav">
      <a className="nav-mark" href="/" aria-label="questlog home">
        questlog
      </a>
      <nav aria-label="Main">
        <a href="/builder">Make cards</a>
        <a href="/#scenes">Scenes</a>
        <a href="/wiki">Wiki</a>
        <a href={REPO}>GitHub</a>
      </nav>
    </header>
  );
}
