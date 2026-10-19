import { REPO } from "./data";

/** `still`: the nav stays at the top of the page instead of floating over it, for pages that fill the window. */
export default function Nav({ still = false }: { still?: boolean }) {
  return (
    <header className={still ? "nav nav-still" : "nav"}>
      <a className="nav-mark" href="/" aria-label="questlog home">
        questlog
      </a>
      <nav aria-label="Main">
        <a href="/builder">Make cards</a>
        <a className="nav-more" href="/#scenes">
          Scenes
        </a>
        <a href="/wiki">Wiki</a>
        <a href={REPO}>GitHub</a>
      </nav>
    </header>
  );
}
