"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MousePointerClick, Pencil } from "lucide-react";
import "github-markdown-css/github-markdown.css";
import { render, morph, type Theme } from "./render";
import type { Spot } from "./cards";
import type { Profile } from "./LoginStep";
import s from "./builder.module.css";
import gh from "./github-colors.module.css";

/** GitHub's mark (Octicons, MIT). */
function Mark() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" fill="currentColor">
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

/** A label on a card in the preview, at its top right corner: every card says it can be changed, so nobody has to
 * find out by hovering. */
type Tag = { i: number; top: number; right: number; kind: "sel" | "hover" | "idle" };

/** The README inside a likeness of a GitHub profile page. Clicking a card picks it. */
export default function ProfilePreview({
  text,
  spots,
  theme,
  profile,
  ownHost,
  v,
  selected,
  flash,
  onPick,
  empty,
}: {
  text: string;
  spots: Spot[];
  theme: Theme;
  profile: Profile;
  ownHost: string;
  v: number;
  selected: number | null;
  flash: number | null;
  onPick: (i: number) => void;
  empty: React.ReactNode;
}) {
  const article = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(matchMedia("(hover: none)").matches), []);

  useEffect(() => {
    if (!article.current) return;
    morph(article.current, render(text, spots, { theme, login: profile.login, ownHost, v }));
    setDrawn((n) => n + 1);
  }, [text, spots, theme, profile.login, ownHost, v]);

  const cardEl = (i: number | null) => (i === null ? null : article.current?.querySelector<HTMLElement>(`[data-spot="${i}"]:not([hidden])`) ?? null);

  // the card being changed keeps an outline, and every card wears a label; cards too small for one go without
  const place = useCallback(() => {
    article.current?.querySelectorAll("[data-sel]").forEach((e) => e.removeAttribute("data-sel"));
    cardEl(selected)?.setAttribute("data-sel", "");
    const b = box.current;
    if (!b || !article.current) return setTags([]);
    const o = b.getBoundingClientRect();
    const seen = new Set<number>();
    const next: Tag[] = [];
    for (const el of article.current.querySelectorAll<HTMLElement>("[data-spot]:not([hidden])")) {
      const i = Number(el.dataset.spot);
      const r = el.getBoundingClientRect();
      if (seen.has(i) || r.width < 140 || r.height < 40) continue;
      seen.add(i);
      next.push({ i, top: r.top - o.top + 8, right: o.right - r.right + 8, kind: i === selected ? "sel" : i === hover ? "hover" : "idle" });
    }
    setTags(next);
  }, [selected, hover]);

  useLayoutEffect(place, [place, drawn]);
  useEffect(() => {
    const ro = new ResizeObserver(place);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [place]);

  // a card just added glows for a moment and comes into view
  useEffect(() => {
    const el = cardEl(flash);
    if (!el) return;
    el.setAttribute("data-flash", "");
    const pane = el.closest<HTMLElement>("[data-scroll]");
    if (pane && pane.scrollHeight > pane.clientHeight) {
      const r = el.getBoundingClientRect();
      const o = pane.getBoundingClientRect();
      pane.scrollTo({ top: pane.scrollTop + r.top - o.top - (pane.clientHeight - r.height) / 2, behavior: "smooth" });
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const t = window.setTimeout(() => el.removeAttribute("data-flash"), 2600);
    return () => window.clearTimeout(t);
  }, [flash, drawn]);

  const pick = (e: React.SyntheticEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-spot]");
    if (!el) return false;
    e.preventDefault();
    onPick(Number(el.dataset.spot));
    return true;
  };

  const avatar = profile.avatar || `https://github.com/${profile.login}.png?size=128`;
  return (
    <div className={`${s.gh} ${theme === "dark" ? gh.dark : gh.light}`} data-theme={theme}>
      <div className={s.ghBar}>
        <Mark />
        <b>{profile.login}</b>
      </div>
      <div className={s.ghTabs} aria-hidden="true">
        <span className={s.ghOn}>Overview</span>
        <span>Repositories</span>
        <span>Projects</span>
        <span>Packages</span>
        <span>Stars</span>
      </div>
      <div className={s.ghBody}>
        <div className={s.ghWho}>
          <img className={s.ghAvatar} src={avatar} width={64} height={64} alt="" />
          <div>
            <div className={s.ghName}>{profile.name}</div>
            <div className={s.ghLogin}>{profile.login}</div>
          </div>
          <span className={s.ghFollow} aria-hidden="true">
            Follow
          </span>
        </div>
        <div className={s.ghReadme}>
          <div className={s.ghReadmeHead}>
            <span>
              <b>{profile.login}</b> / README.md
            </span>
            <Pencil aria-hidden="true" />
          </div>
          <div
            ref={box}
            className={s.ghArticle}
            onClick={pick}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && (e.target as HTMLElement).dataset.spot !== undefined) pick(e);
            }}
            onMouseOver={(e) => {
              const el = (e.target as HTMLElement).closest<HTMLElement>("[data-spot]");
              setHover(el ? Number(el.dataset.spot) : null);
            }}
            onMouseLeave={() => setHover(null)}
            onLoadCapture={place}
          >
            {!text.trim() && empty}
            <div ref={article} className="markdown-body" hidden={!text.trim()} />
            {tags.map((t) => (
              <span
                key={t.i}
                className={`${s.cardTag} ${t.kind === "sel" ? s.cardTagSel : t.kind === "hover" ? s.cardTagHover : ""}`}
                style={{ top: t.top, right: t.right }}
                aria-hidden="true"
              >
                {t.kind === "sel" ? <Pencil /> : <MousePointerClick />}
                {t.kind === "sel" ? "Changing this card" : touch ? "Tap to change" : "Click to change"}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
