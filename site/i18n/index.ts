// The words the site shows, in one place. Components read them from `m`: `m.nav.wiki`, or `m.builder.added(name)` for
// a text with values in it. A text with markup in a sentence (a link, <code>, <b>) is a string with tags in it, drawn
// by `rich()` with the component's own elements for each tag.
//
// Adding a language:
// 1. Copy `en/` to a folder for the language, for example `tr/`, and translate every text. Give its index the type
//    `Messages` (`export const tr: Messages = { ... }`), so a missing or misspelled key is a compile error.
// 2. Keep the tags of rich texts (<code>...</code>, <a>...</a>) and the parameters of the functions; word order,
//    plurals and number formats are free to change inside a function.
// 3. Add it to LOCALES and set LOCALE. The site is a static export with fixed paths, so a language is picked at build
//    time; a page per language would need routing and is not part of this.
import { en } from "./en";

export type Messages = typeof en;

const LOCALES: Record<string, Messages> = { en };
const LOCALE = "en";

/** The active messages. */
export const m: Messages = LOCALES[LOCALE];
/** The active language, for <html lang>. */
export const lang = LOCALE;

export { rich, type Tags } from "./rich";
