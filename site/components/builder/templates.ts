// Ready-made READMEs to start from: simple, with some details, and one with every card and decoration.
import { m } from "@/i18n";
import { writeSpot, type Card } from "./cards";
import type { Widget } from "../data";

export type TemplateKind = "simple" | "details" | "everything";
export const TEMPLATES: TemplateKind[] = ["simple", "details", "everything"];

type Ctx = { origin: string; login: string; name: string; other: boolean };

const T = () => m.builder.templates;

/** A card that switches with the reader's theme. */
function card(c: Ctx, widget: Widget, scene: string, params: [string, string][] = []): string {
  const k: Card = { origin: c.origin, user: c.login, widget, scene, night: false, params, hash: "" };
  return writeSpot(k, T().alt(c.login, widget), "auto");
}

/** A decoration that switches with the reader's theme; `title` empty for none. */
function deco(c: Ctx, name: string, title = ""): string {
  const k: Card = { origin: c.origin, user: "", widget: "decorations", scene: name, night: false, params: title ? [["title", title]] : [], hash: "" };
  return writeSpot(k, title || T().banner, "auto");
}

/** The template's text. Without a login it uses decorations only, since cards with stats need one. */
export function template(kind: TemplateKind, c: Ctx): string {
  const t = T();
  const stats = !!c.login;
  const intro = c.other ? t.introOther : t.intro(c.name || c.login);
  const parts: string[] = [];
  const add = (...xs: (string | false)[]) => xs.forEach((x) => x !== false && parts.push(x));

  if (kind === "simple") {
    add(deco(c, "reading-nook", t.about), intro, stats && card(c, "stats", "forest"), deco(c, "forest-footer"));
  } else if (kind === "details") {
    add(
      deco(c, "reading-nook", t.about),
      intro,
      stats && card(c, "stats", "forest"),
      deco(c, "workbench", t.skills),
      stats ? card(c, "languages", "forest") : t.skillsText,
      deco(c, "raven-moon", t.projects),
      t.projectsText,
      stats && card(c, "streak", "forest", [["fire", "themed"]]),
      deco(c, "enchanted-clearing", t.contact),
      t.contactText,
      deco(c, "forest-footer"),
    );
  } else {
    add(
      deco(c, "reading-nook", t.about),
      intro,
      stats && card(c, "stats", "forest"),
      deco(c, "forest-divider"),
      deco(c, "workbench", t.skills),
      stats ? card(c, "languages", "forest") : t.skillsText,
      deco(c, "crystal-owl", t.learning),
      t.learningText,
      deco(c, "raven-moon", t.projects),
      t.projectsText,
      stats && card(c, "streak", "forest", [["fire", "themed"]]),
      deco(c, "enchanted-clearing", t.contact),
      t.contactText,
      deco(c, "forest-footer"),
    );
  }
  return parts.join("\n\n") + "\n";
}
