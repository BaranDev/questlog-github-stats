import { RUNES } from "./data";

type Rune = (typeof RUNES)[number];

/** A rune drawn on its 5x9 pixel grid; `size` is the pixel size in CSS px. */
export default function Rune({ rune, size = 4 }: { rune: Rune; size?: number }) {
  return (
    <svg
      className="rune"
      viewBox="0 0 5 9"
      width={5 * size}
      height={9 * size}
      shapeRendering="crispEdges"
      aria-hidden="true"
      style={{ color: rune.color }}
    >
      <path d={rune.d} fill="currentColor" />
    </svg>
  );
}
