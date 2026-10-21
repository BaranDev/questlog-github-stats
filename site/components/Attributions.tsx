"use client";

import { useRef } from "react";
import { m, rich, type Tags } from "@/i18n";
import { REPO } from "./data";

const OFL = "https://openfontlicense.org";

const A = m.attributions;

const ATTRIBUTIONS: [string, string, Tags][] = [
  [A.art.what, A.art.credit, { ccbync: (c) => <a href="https://creativecommons.org/licenses/by-nc/4.0/">{c}</a> }],
  [A.code.what, A.code.credit, { mit: (c) => <a href={`${REPO}/blob/main/LICENSE`}>{c}</a> }],
  [A.nodesto.what, A.nodesto.credit, { ccbysa: (c) => <a href="https://creativecommons.org/licenses/by-sa/4.0/">{c}</a> }],
  [A.tiny5.what, A.tiny5.credit, { ofl: (c) => <a href={OFL}>{c}</a> }],
  [A.outfit.what, A.outfit.credit, { ofl: (c) => <a href={OFL}>{c}</a> }],
  [A.silkscreen.what, A.silkscreen.credit, { ofl: (c) => <a href={OFL}>{c}</a> }],
  [A.colors.what, A.colors.credit, { linguist: (c) => <a href="https://github.com/github-linguist/linguist">{c}</a> }],
  [A.software.what, A.software.credit, { gsap: (c) => <a href="https://gsap.com/standard-license">{c}</a> }],
];

/** A native dialog: Escape or a click outside closes it. */
export default function Attributions() {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="btn btn-ghost attributions-open" onClick={() => ref.current?.showModal()}>
        {A.open}
      </button>
      <dialog
        ref={ref}
        className="attributions"
        aria-labelledby="attributions-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="attributions-body">
          <header>
            <h2 id="attributions-title">{A.title}</h2>
            <button type="button" className="btn btn-ghost" onClick={() => ref.current?.close()}>
              {A.close}
            </button>
          </header>
          <dl>
            {ATTRIBUTIONS.map(([what, credit, tags]) => (
              <div key={what}>
                <dt>{what}</dt>
                <dd>{rich(credit, tags)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </dialog>
    </>
  );
}
