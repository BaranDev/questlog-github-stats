"use client";

import { useState } from "react";
import { ArrowRight, FileText, LoaderCircle, Sparkles } from "lucide-react";
import { LOGIN } from "./cards";
import { CloseButton, Field } from "./ui";
import s from "./builder.module.css";

export type Profile = { login: string; name: string; avatar: string };
export type Start = "github" | "keep" | "fresh";

/** The text a fresh README starts with. */
export const template = (name: string) => `# Hi, I'm ${name}\n\nA line or two about you: what you build, what you're learning, how to reach you.\n`;

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

export function TourSteps() {
  return (
    <ol className={s.tourList}>
      <li>
        <b>Type your login.</b> Your cards show that account&apos;s numbers.
      </li>
      <li>
        <b>Add cards.</b> Pick a card and a scene.
      </li>
      <li>
        <b>Change them.</b> Click a card in the preview to change it.
      </li>
      <li>
        <b>Copy.</b> Paste the text into your profile README on GitHub.
      </li>
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
}) {
  const [login, setLogin] = useState(initial);
  const [phase, setPhase] = useState<"ask" | "checking" | "choose">("ask");
  const [error, setError] = useState("");
  const [found, setFound] = useState<{ profile: Profile; readme: string | null } | null>(null);
  const trimmed = login.trim().replace(/^@/, "").replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "").replace(/\/.*$/, "");
  const valid = LOGIN.test(trimmed);
  const keepable = draft.trim() !== "";

  const next = async () => {
    if (!valid) {
      setError(trimmed ? "A login has only letters, digits and hyphens, up to 39 of them." : "Type your GitHub login first.");
      return;
    }
    setError("");
    setPhase("checking");
    const [who, readme] = await Promise.all([lookUp(trimmed), profileReadme(trimmed)]);
    if (who.ok === false) {
      setPhase("ask");
      setError(`GitHub has no account named "${trimmed}". Check the spelling: it's the name in your profile address.`);
      return;
    }
    const profile = who.profile ?? { login: trimmed, name: trimmed, avatar: "" };
    if (!readme && (!keepable || profile.login.toLowerCase() === current.toLowerCase())) {
      onDone(profile, keepable ? null : template(profile.name), keepable ? "keep" : "fresh");
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
            <p className={s.label}>Step 1 of 4</p>
            <h2 className={s.soloTitle}>What&apos;s your GitHub login?</h2>
            <p className={s.soloText}>
              It&apos;s the name in your GitHub address: github.com/<b>octocat</b>. Your cards will show that account&apos;s
              numbers.
            </p>
            <Field
              label="Your GitHub login"
              prefix="github.com/"
              value={login}
              onChange={(v) => {
                setLogin(v);
                if (error) setError("");
              }}
              maxLength={60}
              autoFocus
              onEnter={next}
              error={error}
              help="Example: octocat. Letters, digits and hyphens."
            />
            <div className={s.soloFoot}>
              <p className={s.help}>Already have a profile README? We&apos;ll find it, and you can start from it.</p>
              <div className={s.soloButtons}>
                {onCancel && (
                  <button type="button" className="btn btn-ghost" onClick={onCancel}>
                    Cancel
                  </button>
                )}
                <button type="button" className="btn btn-primary" onClick={next} disabled={phase === "checking"}>
                  {phase === "checking" ? (
                    <>
                      <LoaderCircle className={s.spin} aria-hidden="true" />
                      Looking you up
                    </>
                  ) : (
                    <>
                      Next
                      <ArrowRight aria-hidden="true" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className={s.label}>Step 1 of 4</p>
            {found.readme ? (
              <>
                <h2 className={s.soloTitle}>We found your profile README</h2>
                <p className={s.soloText}>
                  github.com/{found.profile.login}/{found.profile.login} already has a README ({found.readme.split("\n").length}{" "}
                  lines). Start from it and add cards to it, or start over with a short template.
                </p>
              </>
            ) : (
              <>
                <h2 className={s.soloTitle}>Keep what you wrote?</h2>
                <p className={s.soloText}>Your text from before is still here. Keep it, or start over with a short template.</p>
              </>
            )}
            <div className={s.choices}>
              {found.readme && (
                <button type="button" className={s.choice} onClick={() => onDone(found.profile, found.readme, "github")}>
                  <FileText aria-hidden="true" />
                  <span>
                    <b>Start from my README</b>
                    <small>Your current profile text, with any cards it already has.</small>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </button>
              )}
              {keepable && (
                <button type="button" className={s.choice} onClick={() => onDone(found.profile, null, "keep")}>
                  <FileText aria-hidden="true" />
                  <span>
                    <b>Keep what I wrote here</b>
                    <small>The text you were working on in this builder.</small>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </button>
              )}
              <button type="button" className={s.choice} onClick={() => onDone(found.profile, template(found.profile.name), "fresh")}>
                <Sparkles aria-hidden="true" />
                <span>
                  <b>Start fresh</b>
                  <small>A heading and one line, then you add cards.</small>
                </span>
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
            <button type="button" className={`btn ${s.quiet}`} onClick={() => setPhase("ask")}>
              Back
            </button>
          </>
        )}
      </div>

      {tour && (
        <aside className={s.tour} aria-label="How the builder works">
          <div className={s.tourHead}>
            <span className={s.label}>New here?</span>
            <CloseButton onClick={onTourDone} label="Close the tour" />
          </div>
          <p className={s.tourTitle}>Your profile in four steps:</p>
          <TourSteps />
          <button type="button" className="btn btn-ghost" onClick={onTourDone}>
            Got it
          </button>
        </aside>
      )}
    </div>
  );
}
