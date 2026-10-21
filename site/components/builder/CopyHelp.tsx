"use client";

import { m, rich } from "@/i18n";
import { Check, CircleHelp, Copy, ExternalLink } from "lucide-react";
import { CloseButton } from "./ui";
import s from "./builder.module.css";

const tx = m.builderParts.copyHelp;

/** After copying, for a page that is not a GitHub profile: where the text works. */
export function AnywhereHelp({ copied, onCopy, onClose }: { copied: boolean; onCopy: () => void; onClose: () => void }) {
  return (
    <div className={s.howto}>
      <div className={s.optsHead}>
        <div>
          {copied ? (
            <span className={s.donePill}>
              <Check aria-hidden="true" />
              {tx.copied}
            </span>
          ) : (
            <span className={s.label}>{tx.step}</span>
          )}
          <h2 className={s.howtoTitle}>{tx.title}</h2>
        </div>
        <CloseButton onClick={onClose} label={tx.close} />
      </div>
      <ol className={s.howtoList}>
        <li>
          <span className={s.num} data-state="now">1</span>
          <p>{rich(tx.anywhere.items[0], { b: (c) => <b>{c}</b> })}</p>
        </li>
        <li>
          <span className={s.num} data-state="now">2</span>
          <p>{rich(tx.anywhere.items[1], { b: (c) => <b>{c}</b>, code: (c) => <code>{c}</code> })}</p>
        </li>
        <li>
          <span className={s.num} data-state="now">3</span>
          <p>{rich(tx.anywhere.items[2], { b: (c) => <b>{c}</b> })}</p>
        </li>
      </ol>
      <div className={s.howtoFoot}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {tx.anywhere.back}
        </button>
        <button type="button" className="btn btn-primary" onClick={onCopy}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? tx.copyAgain : tx.anywhere.copy}
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
              {tx.copied}
            </span>
          ) : (
            <span className={s.label}>{tx.step}</span>
          )}
          <h2 className={s.howtoTitle}>{tx.title}</h2>
        </div>
        <CloseButton onClick={onClose} label={tx.close} />
      </div>
      <p className={s.howtoText}>{rich(tx.intro(`${login}/${login}`), { code: (c) => <code>{c}</code> })}</p>
      <ol className={s.howtoList}>
        <li>
          <span className={s.num} data-state="now">
            1
          </span>
          <p>
            {rich(tx.steps.open(login), {
              b: (c) => <b>{c}</b>,
              repo: (c) => (
                <a href={repo} target="_blank" rel="noopener noreferrer">
                  {c}
                  <ExternalLink aria-hidden="true" />
                </a>
              ),
              create: (c) => (
                <a href={`https://github.com/new?name=${encodeURIComponent(login)}`} target="_blank" rel="noopener noreferrer">
                  {c}
                  <ExternalLink aria-hidden="true" />
                </a>
              ),
              code: (c) => <code>{c}</code>,
            })}
          </p>
        </li>
        <li>
          <span className={s.num} data-state="now">
            2
          </span>
          <p>
            {rich(tx.steps.edit, {
              b: (c) => <b>{c}</b>,
              file: (c) => (
                <a href={`${repo}/blob/HEAD/README.md`} target="_blank" rel="noopener noreferrer">
                  {c}
                  <ExternalLink aria-hidden="true" />
                </a>
              ),
            })}
          </p>
        </li>
        <li>
          <span className={s.num} data-state="now">
            3
          </span>
          <p>{rich(tx.steps.paste, { b: (c) => <b>{c}</b> })}</p>
        </li>
      </ol>
      <div className={s.tip}>
        <CircleHelp aria-hidden="true" />
        <span>{rich(tx.tip, { b: (c) => <b>{c}</b> })}</span>
      </div>
      <div className={s.howtoFoot}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {tx.back}
        </button>
        <button type="button" className="btn btn-primary" onClick={onCopy}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? tx.copyAgain : tx.copy}
        </button>
      </div>
    </div>
  );
}
