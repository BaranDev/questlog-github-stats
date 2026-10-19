"use client";

import { useRef, type ReactNode } from "react";
import { REPO } from "./data";

const OFL = "https://openfontlicense.org";

const ATTRIBUTIONS: [string, ReactNode][] = [
  [
    "Paintings and sprites",
    <>
      © Cevdet Baran Oral, under <a href="https://creativecommons.org/licenses/by-nc/4.0/">CC BY-NC 4.0</a>. Credit as
      &quot;questlog-github-stats art by Cevdet Baran Oral&quot;; linking the cards to the repository counts. Commercial use
      needs written permission: contact@cevdetbaran.com.
    </>,
  ],
  [
    "Code",
    <>
      questlog, under the <a href={`${REPO}/blob/main/LICENSE`}>MIT license</a>.
    </>,
  ],
  [
    "Nodesto Caps Condensed",
    <>
      By Solbera, under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. The card titles.
    </>,
  ],
  [
    "Tiny5",
    <>
      By Stefan Schmidt, under the <a href={OFL}>SIL Open Font License 1.1</a>. The card text.
    </>,
  ],
  [
    "Outfit",
    <>
      By the Outfit Project Authors, under the <a href={OFL}>SIL Open Font License 1.1</a>. The site text.
    </>,
  ],
  [
    "Silkscreen",
    <>
      By Jason Kottke and the Silkscreen Project Authors, under the <a href={OFL}>SIL Open Font License 1.1</a>. The
      questlog logo.
    </>,
  ],
  [
    "Language colors",
    <>
      Adapted from <a href="https://github.com/github-linguist/linguist">GitHub Linguist</a> (MIT).
    </>,
  ],
  [
    "Software",
    <>
      The card server uses axum, tokio, reqwest, serde, png and skrifa (MIT or Apache 2.0). The site uses Next.js and
      React (MIT) and GSAP (<a href="https://gsap.com/standard-license">GSAP Standard License</a>).
    </>,
  ],
];

/** The attributions button and its modal. A native dialog: Escape closes it, and so does a click outside it. */
export default function Attributions() {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="btn btn-ghost attributions-open" onClick={() => ref.current?.showModal()}>
        Attributions
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
            <h2 id="attributions-title">Attributions</h2>
            <button type="button" className="btn btn-ghost" onClick={() => ref.current?.close()}>
              Close
            </button>
          </header>
          <dl>
            {ATTRIBUTIONS.map(([what, credit]) => (
              <div key={what}>
                <dt>{what}</dt>
                <dd>{credit}</dd>
              </div>
            ))}
          </dl>
        </div>
      </dialog>
    </>
  );
}
