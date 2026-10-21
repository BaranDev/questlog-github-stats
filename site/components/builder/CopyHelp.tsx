"use client";

import { Check, CircleHelp, Copy, ExternalLink } from "lucide-react";
import { CloseButton } from "./ui";
import s from "./builder.module.css";

/** After copying, for a page that is not a GitHub profile: where the text works. */
export function AnywhereHelp({ copied, onCopy, onClose }: { copied: boolean; onCopy: () => void; onClose: () => void }) {
  return (
    <div className={s.howto}>
      <div className={s.optsHead}>
        <div>
          {copied ? (
            <span className={s.donePill}>
              <Check aria-hidden="true" />
              Copied
            </span>
          ) : (
            <span className={s.label}>Step 4 of 4</span>
          )}
          <h2 className={s.howtoTitle}>Where do I paste this?</h2>
        </div>
        <CloseButton onClick={onClose} label="Close" />
      </div>
      <ol className={s.howtoList}>
        <li>
          <span className={s.num} data-state="now">1</span>
          <p>
            <b>Anywhere that shows Markdown:</b> a repository README, a wiki or docs page, a blog that takes Markdown. Paste the
            text as it is.
          </p>
        </li>
        <li>
          <span className={s.num} data-state="now">2</span>
          <p>
            <b>On an HTML page:</b> the <code>&lt;picture&gt;</code> and <code>&lt;img&gt;</code> lines work as they are. For a
            Markdown line, use its address as an image: <code>&lt;img src=&quot;...&quot; alt=&quot;...&quot;&gt;</code>.
          </p>
        </li>
        <li>
          <span className={s.num} data-state="now">3</span>
          <p>
            <b>Where only plain images are allowed</b> (some forums and chat apps), paste a card&apos;s address on its own.
          </p>
        </li>
      </ol>
      <div className={s.howtoFoot}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Back to my text
        </button>
        <button type="button" className="btn btn-primary" onClick={onCopy}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copy again" : "Copy text"}
        </button>
      </div>
    </div>
  );
}

/** After copying: where the text goes on GitHub, step by step. */
export default function CopyHelp({ login, copied, onCopy, onClose }: { login: string; copied: boolean; onCopy: () => void; onClose: () => void }) {
  const repo = `https://github.com/${login}/${login}`;
  return (
    <div className={s.howto}>
      <div className={s.optsHead}>
        <div>
          {copied ? (
            <span className={s.donePill}>
              <Check aria-hidden="true" />
              Copied
            </span>
          ) : (
            <span className={s.label}>Step 4 of 4</span>
          )}
          <h2 className={s.howtoTitle}>Where do I paste this?</h2>
        </div>
        <CloseButton onClick={onClose} label="Close" />
      </div>
      <p className={s.howtoText}>
        GitHub shows a README on your profile when it sits in a repository named exactly like your login:{" "}
        <code>
          {login}/{login}
        </code>
        .
      </p>
      <ol className={s.howtoList}>
        <li>
          <span className={s.num} data-state="now">
            1
          </span>
          <p>
            <b>Open your profile repository:</b>{" "}
            <a href={repo} target="_blank" rel="noopener noreferrer">
              github.com/{login}/{login}
              <ExternalLink aria-hidden="true" />
            </a>
            . If GitHub says the page isn&apos;t there,{" "}
            <a href={`https://github.com/new?name=${encodeURIComponent(login)}`} target="_blank" rel="noopener noreferrer">
              create it
              <ExternalLink aria-hidden="true" />
            </a>
            : name it exactly <code>{login}</code>, keep it Public and tick &quot;Add a README file&quot;.
          </p>
        </li>
        <li>
          <span className={s.num} data-state="now">
            2
          </span>
          <p>
            <b>Edit README.md:</b>{" "}
            <a href={`${repo}/blob/HEAD/README.md`} target="_blank" rel="noopener noreferrer">
              open the file
              <ExternalLink aria-hidden="true" />
            </a>{" "}
            and click the pencil icon, &quot;Edit this file&quot;.
          </p>
        </li>
        <li>
          <span className={s.num} data-state="now">
            3
          </span>
          <p>
            <b>Paste and save:</b> select everything in the file (Ctrl+A, or Cmd+A on a Mac), paste (Ctrl+V or Cmd+V),
            then click &quot;Commit changes&quot;. Your profile shows the cards right away.
          </p>
        </li>
      </ol>
      <div className={s.tip}>
        <CircleHelp aria-hidden="true" />
        <span>
          Your profile says <b>&quot;The scribe is inking your sheet&quot;</b>? That&apos;s normal the first time: your stats are
          being fetched. Refresh the page in a few seconds.
        </span>
      </div>
      <div className={s.howtoFoot}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Back to my README
        </button>
        <button type="button" className="btn btn-primary" onClick={onCopy}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copy again" : "Copy README"}
        </button>
      </div>
    </div>
  );
}
