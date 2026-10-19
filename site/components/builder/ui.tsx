"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, TriangleAlert, X } from "lucide-react";
import s from "./builder.module.css";

type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: ReactNode;
  error?: string;
  prefix?: string;
  maxLength?: number;
  inputMode?: "text" | "url";
  autoFocus?: boolean;
  onEnter?: () => void;
  end?: ReactNode;
};

/** A text field whose label sits inside it while empty and moves up once you type. */
export function Field({ label, value, onChange, help, error, prefix, maxLength = 60, inputMode, autoFocus, onEnter, end }: FieldProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  // a new error takes the person to the field it is about
  useEffect(() => {
    if (error) input.current?.focus();
  }, [error]);
  return (
    <div className={s.fieldWrap}>
      <label className={`${s.ff} ${prefix ? s.prefixed : ""} ${error ? s.bad : ""}`}>
        {prefix && <span className={s.pre}>{prefix}</span>}
        <input
          ref={input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) {
              e.preventDefault();
              onEnter();
            }
          }}
          placeholder=" "
          maxLength={maxLength}
          inputMode={inputMode}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={!!error}
          aria-describedby={help || error ? `${id}-help` : undefined}
        />
        <span className={s.fl}>{label}</span>
        {end}
      </label>
      {(error || help) && (
        <span id={`${id}-help`} className={error ? s.error : s.help} role={error ? "alert" : undefined}>
          {error && <TriangleAlert aria-hidden="true" />}
          {error || help}
        </span>
      )}
    </div>
  );
}

export type Option = { value: string; label: string };

/** A dropdown with its label always above the value. Groups become optgroups. */
export function SelectField({
  label,
  value,
  onChange,
  groups,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  groups: { label?: string; options: Option[] }[];
  help?: ReactNode;
}) {
  const known = groups.some((g) => g.options.some((o) => o.value === value));
  return (
    <div className={s.fieldWrap}>
      <label className={`${s.ff} ${s.select}`}>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {!known && (
            <option value={value} disabled>
              {value} (not a scene)
            </option>
          )}
          {groups.map((g, i) =>
            g.label ? (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              g.options.map((o) => (
                <option key={`${i}-${o.value}`} value={o.value}>
                  {o.label}
                </option>
              ))
            ),
          )}
        </select>
        <span className={s.fl}>{label}</span>
        <ChevronDown className={s.chev} aria-hidden="true" />
      </label>
      {help && <span className={s.help}>{help}</span>}
    </div>
  );
}

/** A choice between a few values, all visible at once. */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  help,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  help?: ReactNode;
}) {
  const name = useId();
  return (
    <fieldset className={s.group}>
      <legend className={s.label}>{label}</legend>
      <div className={s.seg}>
        {options.map((o) => (
          <label key={o.value}>
            <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>
              {o.icon}
              {o.label}
            </span>
          </label>
        ))}
      </div>
      {help && <span className={s.help}>{help}</span>}
    </fieldset>
  );
}

export function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className={s.toggle}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={s.switch} aria-hidden="true" />
      <span>{children}</span>
    </label>
  );
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A hex color without its "#", or nothing. */
export const hex = (v: string) => (HEX.test(v.trim()) ? v.trim().replace("#", "").toUpperCase() : "");

/** The system color picker next to a hex field; empty means the scene's own color. Only a whole color reaches the
 * card, so a half-typed one never draws an error card. */
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft((d) => (hex(d) === hex(value) ? d : value));
  }, [value]);
  const h = hex(draft);
  const full = h.length === 3 ? h.replace(/(.)/g, "$1$1") : h;
  const type = (v: string) => {
    setDraft(v);
    if (hex(v) || !v.trim()) onChange(hex(v));
  };
  return (
    <div className={s.color}>
      <input
        type="color"
        value={full ? `#${full.toLowerCase()}` : "#000000"}
        data-empty={!full || undefined}
        onChange={(e) => type(e.target.value.replace("#", "").toUpperCase())}
        aria-label={`Pick the ${label.toLowerCase()}`}
      />
      <Field
        label={label}
        value={draft}
        onChange={type}
        maxLength={7}
        error={draft.trim() && !h ? "Use a hex color, like FFD700." : undefined}
        help={draft ? undefined : "Empty: the scene's own color."}
        end={
          draft ? (
            <button type="button" className={s.clear} onClick={() => type("")} aria-label={`Reset the ${label.toLowerCase()}`}>
              <X aria-hidden="true" />
            </button>
          ) : undefined
        }
      />
    </div>
  );
}

/** A modal dialog: centered on wide screens, a sheet from the bottom on phones. Clicking outside closes it. */
export function Sheet({
  open,
  onClose,
  label,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`${s.sheet} ${wide ? s.sheetWide : ""}`}
      aria-label={label}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={s.sheetBody}>
        <span className={s.grab} aria-hidden="true" />
        {open && children}
      </div>
    </dialog>
  );
}

export function CloseButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className={s.x} onClick={onClick} aria-label={label}>
      <X aria-hidden="true" />
    </button>
  );
}
