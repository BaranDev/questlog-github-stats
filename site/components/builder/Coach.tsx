"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import s from "./builder.module.css";

/** One step of the tour: what to point at (a CSS selector; the first visible match), which phone tab shows it, and
 * what to say. */
export type CoachStep = {
  target?: string;
  tab?: "write" | "preview";
  title: string;
  body: string;
  /** Done for the reader by the main button, before the tour moves on (like adding a first card). */
  action?: { label: string; run: () => void };
};

const PAD = 8;

/** Guided tour: the target is lit and the rest dimmed. Skip, Esc or close end it; Back, Next and the arrow keys move
 * through it. The page stays usable underneath, so the reader can try what is shown. */
export default function Coach({
  steps,
  onTab,
  onDone,
}: {
  steps: CoachStep[];
  onTab: (t: "write" | "preview") => void;
  onDone: (finished: boolean) => void;
}) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  const find = useCallback(() => {
    if (!step.target) return null;
    const all = [...document.querySelectorAll<HTMLElement>(step.target)];
    return all.find((el) => el.getClientRects().length > 0) ?? null;
  }, [step.target]);

  // show the step's tab on a phone, bring the target into view, then follow it while the page moves
  useLayoutEffect(() => {
    if (step.tab) onTab(step.tab);
  }, [step.tab, onTab]);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRect(find()?.getBoundingClientRect() ?? null));
    };
    const t = window.setTimeout(() => {
      find()?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      measure();
    }, 60);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      ro.disconnect();
    };
  }, [find, i]);

  useEffect(() => card.current?.focus(), [i]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone(false);
      else if (e.key === "ArrowRight" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement))
        last ? onDone(true) : setI((n) => n + 1);
      else if (e.key === "ArrowLeft" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement))
        setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [last, onDone]);

  // the card sits below the target when there is room, above it otherwise, and centered when there is no target
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const w = Math.min(360, vw - 32);
  let pos: React.CSSProperties = { left: (vw - w) / 2, top: vh / 2, transform: "translateY(-50%)", width: w };
  if (rect) {
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - w / 2), vw - w - 16);
    const below = rect.bottom + PAD + 12;
    pos = vh - below > 220 ? { left, top: below, width: w } : { left, bottom: vh - rect.top + PAD + 12, width: w };
  }

  return (
    <div className={s.coach} role="presentation">
      {rect ? (
        <div
          className={s.coachHole}
          style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + 2 * PAD, height: rect.height + 2 * PAD }}
        />
      ) : (
        <div className={s.coachDim} />
      )}
      <div
        ref={card}
        className={s.coachCard}
        style={pos}
        role="dialog"
        aria-modal="false"
        aria-labelledby="coach-title"
        aria-describedby="coach-body"
        tabIndex={-1}
      >
        <div className={s.coachHead}>
          <span className={s.label}>
            Tip {i + 1} of {steps.length}
          </span>
          <button type="button" className={s.coachClose} onClick={() => onDone(false)} aria-label="Skip the tour">
            <X aria-hidden="true" />
          </button>
        </div>
        <h2 id="coach-title" className={`display ${s.coachTitle}`}>
          {step.title}
        </h2>
        <p id="coach-body" className={s.coachBody}>
          {step.body}
        </p>
        <div className={s.coachDots} aria-hidden="true">
          {steps.map((_, n) => (
            <span key={n} data-on={n === i ? "" : undefined} />
          ))}
        </div>
        <div className={s.coachFoot}>
          <button type="button" className={s.linkBtn} onClick={() => onDone(false)}>
            Skip the tour
          </button>
          <span className={s.coachNav}>
            {i > 0 && (
              <button type="button" className={`btn btn-ghost ${s.small}`} onClick={() => setI(i - 1)}>
                <ArrowLeft aria-hidden="true" />
                Back
              </button>
            )}
            <button
              type="button"
              className={`btn btn-primary ${s.small}`}
              onClick={() => {
                if (step.action) {
                  step.action.run();
                  window.setTimeout(() => setI(i + 1), 450); // the new card needs a moment to appear
                } else if (last) onDone(true);
                else setI(i + 1);
              }}
            >
              {step.action ? step.action.label : last ? "Start building" : "Next"}
              {!last && !step.action && <ArrowRight aria-hidden="true" />}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
