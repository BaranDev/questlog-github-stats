"use client";

import { useEffect, useRef, useState } from "react";
import { m, rich } from "@/i18n";
import { ArrowRight, FileText, LoaderCircle, Sparkles } from "lucide-react";
import { LOGIN } from "./cards";
import { CloseButton, Field } from "./ui";
import s from "./builder.module.css";

export type Profile = { login: string; name: string; avatar: string };
export type Start = "github" | "keep" | "fresh";

const tx = m.builderParts.login;

export const template = (name: string) => tx.template(name);

/** Who the builder is for: a GitHub profile README, or any other page or Markdown file. */
export type Purpose = "profile" | "other";

/** The first text for a page that is not a GitHub profile. */
export const otherTemplate = () => tx.otherTemplate;

/** The account's display name and avatar; ok is false when GitHub has no such account and null when it could not
 * say (offline, or its hourly limit for this reader). */
async function lookUp(login: string): Promise<{ ok: boolean | null; profile?: Profile }> {
  try {
    const r = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, { headers: { Accept: "application/vnd.github+json" } });
    if (r.status === 404) return { ok: false };
    if (!r.ok) return { ok: null };
    const j = await r.json();
    return { ok: true, profile: { login: j.login || login, name: j.name || j.login || login, avatar: j.avatar_url || "" } };
  } catch {
    return { ok: null };
  }
}

/** The README of the account's profile repository (login/login) on its default branch, if there is one. */
async function profileReadme(login: string): Promise<string | null> {
  for (const file of ["README.md", "readme.md", "Readme.md"]) {
    try {
      const r = await fetch(`https://raw.githubusercontent.com/${login}/${login}/HEAD/${file}`);
      if (r.ok) return (await r.text()).slice(0, 200_000);
    } catch {
      return null;
    }
  }
  return null;
}

export function TourSteps({ other = false }: { other?: boolean }) {
  return (
    <ol className={s.tourList}>
      {(other ? tx.tourStepsOther : tx.tourSteps).map((step) => (
        <li key={step}>{rich(step, { b: (c) => <b>{c}</b> })}</li>
      ))}
    </ol>
  );
}

export default function LoginStep({
  initial,
  current,
  draft,
  tour,
  onTourDone,
  onDone,
  onCancel,
  purpose,
  onPurpose,
}: {
  initial: string;
  /** The login already in use, when changing it. */
  current: string;
  /** The README text already in the builder. */
  draft: string;
  tour: boolean;
  onTourDone: () => void;
  onDone: (p: Profile, text: string | null, start: Start) => void;
  onCancel?: () => void;
  purpose: Purpose;
  onPurpose: (p: Purpose) => void;
}) {
  const other = purpose === "other";
  const fresh = (name: string) => (other ? otherTemplate() : template(name));
  const [login, setLogin] = useState(initial);
  const [phase, setPhase] = useState<"ask" | "checking" | "choose">("ask");
  const [error, setError] = useState("");
  const [found, setFound] = useState<{ profile: Profile; readme: string | null } | null>(null);
  // each lookup gets a number; an answer to an older one, or one arriving after the step closed, is dropped
  const run = useRef(0);
  useEffect(
    () => () => {
      run.current++;
    },
    [],
  );
  const trimmed = login.trim().replace(/^@/, "").replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "").replace(/\/.*$/, "");
  const valid = LOGIN.test(trimmed);
  const keepable = draft.trim() !== "";

  const next = async () => {
    if (phase === "checking") return;
    if (!valid) {
      setError(trimmed ? tx.invalidLogin : tx.emptyLogin);
      return;
    }
    setError("");
    setPhase("checking");
    const id = ++run.current;
    // a page that is not a GitHub profile does not start from the profile README
    const [who, readme] = await Promise.all([lookUp(trimmed), other ? Promise.resolve(null) : profileReadme(trimmed)]);
    if (id !== run.current) return;
    if (who.ok === false) {
      setPhase("ask");
      setError(tx.noAccount(trimmed));
      return;
    }
    const profile = who.profile ?? { login: trimmed, name: trimmed, avatar: "" };
    if (!readme && (!keepable || profile.login.toLowerCase() === current.toLowerCase())) {
      onDone(profile, keepable ? null : fresh(profile.name), keepable ? "keep" : "fresh");
      return;
    }
    setFound({ profile, readme });
    setPhase("choose");
  };

  return (
    <div className={s.solo}>
      <div className={s.soloBox}>
        {phase !== "choose" || !found ? (
          <>
            <p className={s.label}>{tx.step}</p>
            <fieldset className={s.purpose}>
              <legend className={s.label}>{tx.purposeQuestion}</legend>
              <label>
                <input type="radio" name="purpose" checked={!other} onChange={() => onPurpose("profile")} />
                <span>
                  <b>{tx.purposeProfile}</b>
                  <small>{tx.purposeProfileNote}</small>
                </span>
              </label>
              <label>
                <input type="radio" name="purpose" checked={other} onChange={() => onPurpose("other")} />
                <span>
                  <b>{tx.purposeOther}</b>
                  <small>{tx.purposeOtherNote}</small>
                </span>
              </label>
            </fieldset>
            <h2 className={s.soloTitle}>{other ? tx.titleOther : tx.titleProfile}</h2>
            <p className={s.soloText}>
              {rich(other ? tx.textOther : tx.textProfile, { b: (c) => <b>{c}</b> })}
            </p>
            <Field
              label={other ? tx.fieldOther : tx.fieldProfile}
              prefix={tx.fieldPrefix}
              value={login}
              onChange={(v) => {
                setLogin(v);
                if (error) setError("");
                if (phase === "checking") {
                  run.current++;
                  setPhase("ask");
                }
              }}
              maxLength={60}
              autoFocus
              onEnter={next}
              error={error}
              help={tx.fieldHelp}
            />
            <div className={s.soloFoot}>
              <p className={s.help}>
                {other ? tx.footOther : tx.footProfile}
              </p>
              <div className={s.soloButtons}>
                {onCancel && (
                  <button type="button" className="btn btn-ghost" onClick={onCancel}>
                    {tx.cancel}
                  </button>
                )}
                {other && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    title={tx.noLoginHelp}
                    onClick={() => {
                      run.current++; // a lookup still on its way must not land after this
                      onDone({ login: "", name: "", avatar: "" }, keepable ? null : otherTemplate(), keepable ? "keep" : "fresh");
                    }}
                  >
                    {tx.noLogin}
                  </button>
                )}
                <button type="button" className="btn btn-primary" onClick={next} disabled={phase === "checking"}>
                  {phase === "checking" ? (
                    <>
                      <LoaderCircle className={s.spin} aria-hidden="true" />
                      {tx.checking}
                    </>
                  ) : (
                    <>
                      {tx.next}
                      <ArrowRight aria-hidden="true" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className={s.label}>{tx.step}</p>
            {found.readme ? (
              <>
                <h2 className={s.soloTitle}>{tx.foundTitle}</h2>
                <p className={s.soloText}>{tx.foundText(found.profile.login, found.readme.split("\n").length)}</p>
              </>
            ) : (
              <>
                <h2 className={s.soloTitle}>{tx.keepTitle}</h2>
                <p className={s.soloText}>{tx.keepText}</p>
              </>
            )}
            <div className={s.choices}>
              {found.readme && (
                <button type="button" className={s.choice} onClick={() => onDone(found.profile, found.readme, "github")}>
                  <FileText aria-hidden="true" />
                  <span>
                    <b>{tx.startFromReadme}</b>
                    <small>{tx.startFromReadmeNote}</small>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </button>
              )}
              {keepable && (
                <button type="button" className={s.choice} onClick={() => onDone(found.profile, null, "keep")}>
                  <FileText aria-hidden="true" />
                  <span>
                    <b>{tx.keepHere}</b>
                    <small>{tx.keepHereNote}</small>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </button>
              )}
              <button type="button" className={s.choice} onClick={() => onDone(found.profile, fresh(found.profile.name), "fresh")}>
                <Sparkles aria-hidden="true" />
                <span>
                  <b>{tx.startFresh}</b>
                  <small>{tx.startFreshNote}</small>
                </span>
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
            <button type="button" className={`btn ${s.quiet}`} onClick={() => setPhase("ask")}>
              {tx.back}
            </button>
          </>
        )}
      </div>

      {tour && (
        <aside className={s.tour} aria-label={tx.tourLabel}>
          <div className={s.tourHead}>
            <span className={s.label}>{tx.tourNew}</span>
            <CloseButton onClick={onTourDone} label={tx.tourClose} />
          </div>
          <p className={s.tourTitle}>{other ? tx.tourTitleOther : tx.tourTitle}</p>
          <TourSteps other={other} />
          <button type="button" className="btn btn-ghost" onClick={onTourDone}>
            {tx.tourGotIt}
          </button>
        </aside>
      )}
    </div>
  );
}
