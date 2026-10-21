"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { DECORATIONS, cardName, type Widget } from "../data";
import { WIDGETS, decorationThumb, thumb } from "./cards";
import { describe, sceneGroups } from "./CardOptions";
import { CloseButton, SelectField } from "./ui";
import { m } from "@/i18n";
import s from "./builder.module.css";

/** The card picker: a scene, then one of the three cards in it. */
export default function AddCard({
  scene: first,
  night,
  where,
  onAdd,
  onAddDecoration,
  onClose,
  noLogin = false,
}: {
  scene: string;
  night: boolean;
  where: string;
  onAdd: (w: Widget, scene: string) => void;
  onAddDecoration: (name: string) => void;
  onClose: () => void;
  /** No GitHub login: only the decorations, which show no stats. */
  noLogin?: boolean;
}) {
  const [scene, setScene] = useState(first);
  return (
    <div className={s.opts}>
      <div className={s.optsHead}>
        <div>
          <h3 className={`display ${s.optsName}`}>{m.builder.addCard.title}</h3>
          <p className={s.optsSub}>{where}</p>
        </div>
        <CloseButton onClick={onClose} label={m.builder.addCard.close} />
      </div>
      {noLogin ? (
        <p className={s.help}>{m.builder.addCard.needLogin}</p>
      ) : (
        <>
      <SelectField
        label={m.builder.addCard.scene}
        value={scene}
        onChange={setScene}
        groups={sceneGroups}
        help={m.builder.addCard.sceneHelp}
      />
      <div className={s.group}>
        <p className={s.label}>{m.builder.addCard.pickCard}</p>
        <div className={s.pickList}>
          {WIDGETS.map((w) => (
            <button key={w} type="button" className={s.pick} onClick={() => onAdd(w, scene)}>
              <img className="pix" src={thumb(w, scene, night, w === "streak" ? "themed" : "")} width={640} height={256} alt="" />
              <span className={s.pickText}>
                <b>{cardName(w, scene)}</b>
                <small>{describe(w)}</small>
              </span>
              <span className={s.pickAdd}>
                <Plus aria-hidden="true" />
                {m.builder.addCard.add}
              </span>
            </button>
          ))}
        </div>
      </div>
        </>
      )}
      <div className={s.group}>
        <p className={s.label}>{m.builder.addCard.orDecoration}</p>
        <p className={s.help}>{m.builder.addCard.decorationHelp}</p>
        <div className={s.pickList}>
          {DECORATIONS.map((d) => (
            <button key={d.name} type="button" className={s.pick} onClick={() => onAddDecoration(d.name)}>
              <img className="pix" src={decorationThumb(d.name)} width={640} height={d.h * 2} alt="" />
              <span className={s.pickText}>
                <b>{d.label}</b>
                <small>{d.title ? m.builder.addCard.forExample(d.title) : m.builder.addCard.divider}</small>
              </span>
              <span className={s.pickAdd}>
                <Plus aria-hidden="true" />
                {m.builder.addCard.add}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
