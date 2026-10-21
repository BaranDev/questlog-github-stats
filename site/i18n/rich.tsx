import { Fragment, type ReactNode } from "react";

/** The element for each tag a rich text uses: `<code>x</code>` is `code("x")`, `<br/>` is `br()`. */
export type Tags = Record<string, (chunks?: ReactNode) => ReactNode>;

/** Draws a dictionary text with tags in it, like "Run <code>npm i</code>, then see the <a>wiki</a>.", with the
 * component's elements for its tags. Only the names in `tags` count as tags, so "<picture>" in the text stays text
 * when there is no `picture` tag. Tags can hold other tags, but not one of the same name. */
export function rich(text: string, tags: Tags): ReactNode {
  const out: ReactNode[] = [];
  const open = /<(\w+)(\/?)>/g;
  let last = 0;
  let hit: RegExpExecArray | null;
  while ((hit = open.exec(text))) {
    const [whole, name, self] = hit;
    const tag = tags[name];
    if (!tag) continue;
    if (self) {
      out.push(text.slice(last, hit.index), tag());
      last = open.lastIndex;
      continue;
    }
    const close = text.indexOf(`</${name}>`, open.lastIndex);
    if (close < 0) continue;
    out.push(text.slice(last, hit.index), tag(rich(text.slice(hit.index + whole.length, close), tags)));
    last = open.lastIndex = close + name.length + 3;
  }
  out.push(text.slice(last));
  const parts = out.filter((p) => p !== "");
  if (parts.length === 1 && typeof parts[0] === "string") return parts[0];
  return parts.map((p, i) => <Fragment key={i}>{p}</Fragment>);
}
