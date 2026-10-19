"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { DECORATIONS, cardName, type Widget } from "../data";
import { WIDGETS, decorationThumb, thumb } from "./cards";
import { describe, sceneGroups } from "./CardOptions";
import { CloseButton, SelectField } from "./ui";
import s from "./builder.module.css";

/** The card picker: a scene, then one of the three cards in it. */
export default function AddCard({
  scene: first,
  night,
  where,
  onAdd,
  onAddDecoration,
  onClose,
}: {
  scene: string;
  night: boolean;
  where: string;
  onAdd: (w: Widget, scene: string) => void;
  onAddDecoration: (name: string) => void;
  onClose: () => void;
}) {
  const [scene, setScene] = useState(first);
  return (
    <div className={s.opts}>
      <div className={s.optsHead}>
        <div>
          <h3 className={`display ${s.optsName}`}>Add a card</h3>
          <p className={s.optsSub}>{where}</p>
        </div>
        <CloseButton onClick={onClose} label="Close" />
      </div>
      <SelectField
        label="Scene"
        value={scene}
        onChange={setScene}
        groups={sceneGroups}
        help="Every card comes in every scene. You can change it later."
      />
      <div className={s.group}>
        <p className={s.label}>Pick a card</p>
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
                Add
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className={s.group}>
        <p className={s.label}>Or a decoration</p>
        <p className={s.help}>A painted banner to head a section of your README. You can give it a title after adding it.</p>
        <div className={s.pickList}>
          {DECORATIONS.map((d) => (
            <button key={d.name} type="button" className={s.pick} onClick={() => onAddDecoration(d.name)}>
              <img className="pix" src={decorationThumb(d.name)} width={640} height={d.h * 2} alt="" />
              <span className={s.pickText}>
                <b>{d.label}</b>
                <small>{d.title ? `For example "${d.title}"` : "A divider between sections"}</small>
              </span>
              <span className={s.pickAdd}>
                <Plus aria-hidden="true" />
                Add
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
