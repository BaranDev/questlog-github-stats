"use client";

import { useEffect, useRef } from "react";
import s from "./builder.module.css";

/** The README text. A layer behind the textarea marks the card being changed; both wrap the same way. */
export default function Editor({
  value,
  onChange,
  onCursor,
  mark,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onCursor: (at: number) => void;
  mark: [number, number] | null;
  placeholder: string;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const marked = useRef<HTMLElement>(null);

  useEffect(() => {
    const t = area.current;
    const m = marked.current;
    if (!t || !m) return;
    const top = m.offsetTop - t.clientHeight / 3;
    if (m.offsetTop < t.scrollTop || m.offsetTop + m.offsetHeight > t.scrollTop + t.clientHeight) t.scrollTop = Math.max(0, top);
    if (back.current) back.current.scrollTop = t.scrollTop;
  }, [mark?.[0], mark?.[1]]);

  const track = () => {
    const t = area.current;
    if (t) onCursor(t.selectionEnd);
  };

  return (
    <div className={s.editor}>
      <div ref={back} className={s.backdrop} aria-hidden="true">
        {mark ? (
          <>
            {value.slice(0, mark[0])}
            <mark ref={marked}>{value.slice(mark[0], mark[1])}</mark>
            {value.slice(mark[1])}
          </>
        ) : (
          value
        )}
        {"\n"}
      </div>
      <textarea
        ref={area}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onCursor(e.target.selectionEnd);
        }}
        onSelect={track}
        onKeyUp={track}
        onClick={track}
        onScroll={(e) => {
          if (back.current) back.current.scrollTop = e.currentTarget.scrollTop;
        }}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        aria-label="Your README, in Markdown"
      />
    </div>
  );
}
