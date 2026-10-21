import { REPO } from "./data";
import GitHubMark from "./GitHubMark";
import { m } from "@/i18n";

/** `still`: the nav stays at the top of the page instead of floating over it, for pages that fill the window. */
export default function Nav({ still = false }: { still?: boolean }) {
  return (
    <header className={still ? "nav nav-still" : "nav"}>
      <a className="nav-mark" href="/" aria-label={m.site.nav.home}>
        questlog
      </a>
      <nav aria-label={m.site.nav.label}>
        <a href="/builder">{m.site.nav.makeCards}</a>
        <a className="nav-more" href="/#scenes">
          {m.site.nav.scenes}
        </a>
        <a className="nav-more" href="/cards">
          {m.site.nav.allCards}
        </a>
        <a href="/wiki">{m.site.nav.wiki}</a>
        <a href={REPO} className="nav-gh">
          <GitHubMark className="gh-mark" />
          {m.site.nav.github}
        </a>
      </nav>
    </header>
  );
}
