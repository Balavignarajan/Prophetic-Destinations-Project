'use client';

import React from 'react';
import { restrictedLevelsText } from '../lib/item-levels';
import { type Hotspot3DDraft, MODEL_3D_LIMITS, positionSummary } from '../lib/model-3d';
import ItemLevelsField from './ItemLevelsField';
import Icon, { type IconName } from './Model3DIcons';
import ScriptureRefList from './ScriptureRefList';

/** What the author is currently choosing a spot for: a new hotspot, or a new place for an existing one. */
export type Placing = { kind: 'add' } | { kind: 'move'; id: string };

const FIELD = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const FIELD_LABEL = 'mb-1 flex items-baseline justify-between gap-2 text-xs font-semibold text-slate-800';
const BTN = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';
const BTN_DARK = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

/** A small square icon button with a real name (for screen readers) and a tooltip. */
function IconButton({ id, icon, label, onClick, disabled = false, danger = false }: { id?: string; icon: IconName; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      id={id}
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${danger ? 'text-rose-700' : 'text-slate-600 hover:text-slate-900'}`}
    >
      <Icon name={icon} />
    </button>
  );
}

/** The numbered gold medallion that matches the marker on the model; hollow and dashed while the hotspot has no place on the model yet. */
function Badge({ number, placed, selected }: { number: number; placed: boolean; selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        placed ? `bg-amber-400 text-slate-900 ring-2 ${selected ? 'ring-amber-600' : 'ring-amber-200'}` : 'border-2 border-dashed border-slate-400 bg-white text-slate-600'
      }`}
    >
      {number}
    </span>
  );
}

interface Props {
  hotspots: Hotspot3DDraft[];
  selectedId: string | null;
  placing: Placing | null;
  saving: boolean;
  /** Whether a model is chosen at all: without one there is nothing to place hotspots on. */
  hasModel: boolean;
  /** The hotspot whose delete confirmation is open. */
  confirmDelete: string | null;
  /** Called when the author chooses (or, for the chosen one, unchooses) a hotspot's row. */
  onSelect: (id: string | null) => void;
  /** Starts choosing a spot for a new hotspot. */
  onAdd: () => void;
  onCancelPlacing: () => void;
  /** Starts choosing a new spot for an existing hotspot. */
  onMove: (id: string) => void;
  onReorder: (index: number, by: -1 | 1) => void;
  onAskDelete: (id: string | null) => void;
  onDelete: (id: string) => void;
  onPatch: (id: string, changes: Partial<Hotspot3DDraft>) => void;
  /** The empty state's way to the model chooser. */
  onChooseModel: () => void;
}

/**
 * The hotspot manager beside the 3D stage. A header (what hotspots are, how many of how many are used, Add hotspot), then one compact row per hotspot: its gold number, its title, whether it
 * is placed and which levels it is shown at, and small Up, Down and Delete buttons. Choosing a row (or its marker on the model) opens that hotspot's details RIGHT UNDER its row, in the same
 * card: title, explanation, Scripture and levels, with Move position and Delete in its header. Only one is open at a time. Everything here edits the editor's draft; nothing is saved until the
 * editor's Save. Hotspot ids never change: the numbers follow the order, and the same numbers are on the markers on the model.
 */
export default function Model3DHotspotPanel({ hotspots, selectedId, placing, saving, hasModel, confirmDelete, onSelect, onAdd, onCancelPlacing, onMove, onReorder, onAskDelete, onDelete, onPatch, onChooseModel }: Props) {
  const count = hotspots.length;
  const full = count >= MODEL_3D_LIMITS.maxHotspots;
  const adding = placing?.kind === 'add';

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">Hotspots</h3>
          <p className="mt-0.5 text-xs text-slate-700">Add interactive points to explain parts of the model.</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800" aria-label={`${count} of ${MODEL_3D_LIMITS.maxHotspots} hotspots used`}>
          {count} of {MODEL_3D_LIMITS.maxHotspots}
        </span>
      </div>

      {hasModel && (
        <div className="flex flex-wrap items-center gap-2">
          <button id="m3d-add" type="button" className={BTN_DARK} onClick={adding ? onCancelPlacing : onAdd} disabled={saving || (!adding && full)} aria-pressed={adding}>
            <Icon name={adding ? 'close' : 'plus'} />
            {adding ? 'Cancel adding' : 'Add hotspot'}
          </button>
          {full && !adding && <p className="text-xs text-slate-700">The most hotspots a model can have ({MODEL_3D_LIMITS.maxHotspots}) are in use.</p>}
        </div>
      )}

      {!hasModel ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center">
          <p className="text-sm font-semibold text-slate-900">Choose a 3D model first</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-slate-700">Hotspots are placed on the surface of the model, so pick the GLB file from the Media Library before adding any.</p>
          <button type="button" className={`${BTN} mt-3`} onClick={onChooseModel}>
            Choose a 3D model
          </button>
        </div>
      ) : count === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center">
          <p className="text-sm font-semibold text-slate-900">No hotspots yet</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-slate-700">
            Learners can already turn and zoom the model. Add a hotspot to point out a part of it and explain it. The model is published as it is without any.
          </p>
          <button type="button" className={`${BTN} mt-3`} onClick={onAdd} disabled={saving || adding}>
            <Icon name="plus" />
            Add the first hotspot
          </button>
        </div>
      ) : (
        <ol className="space-y-2">
          {hotspots.map((h, index) => {
            const selected = h.id === selectedId;
            const placed = h.position !== null;
            const restricted = restrictedLevelsText(h.levels);
            const title = h.label.trim() || 'Untitled hotspot';
            return (
              <li
                key={h.id}
                id={`m3d-row-${h.id}`}
                className={`rounded-xl border bg-white ${selected ? 'border-amber-400 shadow-sm ring-1 ring-amber-200' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <div className="flex items-center gap-1 p-1.5">
                  <button
                    type="button"
                    onClick={() => onSelect(selected ? null : h.id)}
                    aria-expanded={selected}
                    aria-controls={`m3d-details-${h.id}`}
                    aria-label={`Hotspot ${index + 1}: ${title}, ${placed ? 'placed' : 'position needed'}${restricted ? `, shown at ${restricted}` : ', shown at all levels'}`}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
                  >
                    <Badge number={index + 1} placed={placed} selected={selected} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${selected ? 'font-semibold' : 'font-medium'} ${h.label.trim() ? 'text-slate-900' : 'italic text-slate-600'}`}>{title}</span>
                      <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-700">
                        {placed ? (
                          <span className="inline-flex items-center gap-1 text-emerald-800">
                            <Icon name="check" className="h-3 w-3" />
                            Placed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-medium text-amber-900">
                            <Icon name="alert" className="h-3 w-3" />
                            Position needed
                          </span>
                        )}
                        <span>{restricted ? `Levels: ${restricted}` : 'All levels'}</span>
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center">
                    <IconButton id={`m3d-up-${h.id}`} icon="up" label={`Move hotspot ${index + 1} up`} onClick={() => onReorder(index, -1)} disabled={saving || index === 0} />
                    <IconButton id={`m3d-down-${h.id}`} icon="down" label={`Move hotspot ${index + 1} down`} onClick={() => onReorder(index, 1)} disabled={saving || index === count - 1} />
                    <IconButton icon="trash" label={`Delete hotspot ${index + 1}`} onClick={() => onAskDelete(h.id)} disabled={saving} danger />
                  </div>
                </div>

                {confirmDelete === h.id && (
                  <div role="alertdialog" aria-labelledby={`m3d-del-${h.id}`} className="mx-2 mb-2 rounded-lg border border-rose-300 bg-rose-50 p-3">
                    <p id={`m3d-del-${h.id}`} className="text-sm font-semibold text-rose-950">
                      Remove hotspot {index + 1}?
                    </p>
                    <p className="mt-0.5 text-xs text-rose-900">Its explanation and Scripture references will also be removed. The 3D model and your Media Library are not touched. This is not saved until you choose Save.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className={`${BTN} border-rose-300 text-rose-900 hover:bg-rose-100`} onClick={() => onDelete(h.id)}>
                        Remove hotspot
                      </button>
                      <button type="button" className={BTN} onClick={() => onAskDelete(null)} autoFocus>
                        Keep it
                      </button>
                    </div>
                  </div>
                )}

                {selected && (
                  <div id={`m3d-details-${h.id}`} role="group" aria-labelledby={`m3d-details-title-${h.id}`} className="space-y-4 border-t border-slate-200 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 id={`m3d-details-title-${h.id}`} className="text-sm font-semibold text-slate-900">
                          Hotspot {String(index + 1).padStart(2, '0')}
                        </h4>
                        <p className="text-[11px] text-slate-700">{placed ? positionSummary(h.position) : 'Not placed on the model yet'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {placing?.kind === 'move' && placing.id === h.id ? (
                          <button type="button" className={`${BTN} border-amber-400 bg-amber-50`} onClick={onCancelPlacing}>
                            <Icon name="close" />
                            Cancel moving
                          </button>
                        ) : (
                          <button type="button" className={BTN} onClick={() => onMove(h.id)} disabled={saving}>
                            <Icon name="pin" />
                            {placed ? 'Move position' : 'Place on model'}
                          </button>
                        )}
                        <button type="button" className={`${BTN} text-rose-800`} onClick={() => onAskDelete(h.id)} disabled={saving}>
                          <Icon name="trash" />
                          Delete
                        </button>
                      </div>
                    </div>

                    {!placed && (
                      <p className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">
                        This hotspot has no spot on the model yet, so learners would not see its marker. Choose <span className="font-semibold">Place on model</span>, then click its spot on the surface.
                      </p>
                    )}

                    <fieldset disabled={saving} className="min-w-0 space-y-4">
                      <legend className="sr-only">Details of hotspot {index + 1}</legend>
                      <div>
                        <div className={FIELD_LABEL}>
                          <label htmlFor={`m3d-label-${h.id}`}>Hotspot title</label>
                          <span aria-hidden="true" className="font-normal text-slate-600">
                            {h.label.length}/{MODEL_3D_LIMITS.label}
                          </span>
                        </div>
                        <input
                          id={`m3d-label-${h.id}`}
                          type="text"
                          maxLength={MODEL_3D_LIMITS.label}
                          value={h.label}
                          placeholder="A short name, for example “The crown”"
                          onChange={(e) => onPatch(h.id, { label: e.target.value })}
                          aria-describedby={`m3d-label-help-${h.id}`}
                          className={FIELD}
                        />
                        <p id={`m3d-label-help-${h.id}`} className={`mt-1 text-xs ${h.label.trim() ? 'text-slate-600' : 'font-medium text-amber-900'}`}>
                          {h.label.trim() ? 'Learners see this as the heading of the explanation.' : 'Needed before publishing: learners see this as the heading.'}
                        </p>
                      </div>
                      <div>
                        <div className={FIELD_LABEL}>
                          <label htmlFor={`m3d-expl-${h.id}`}>Explanation</label>
                          <span aria-hidden="true" className="font-normal text-slate-600">
                            {h.explanation.length}/{MODEL_3D_LIMITS.explanation}
                          </span>
                        </div>
                        <textarea
                          id={`m3d-expl-${h.id}`}
                          rows={6}
                          maxLength={MODEL_3D_LIMITS.explanation}
                          value={h.explanation}
                          onChange={(e) => onPatch(h.id, { explanation: e.target.value })}
                          aria-describedby={`m3d-expl-help-${h.id}`}
                          className={`${FIELD} leading-relaxed`}
                        />
                        <p id={`m3d-expl-help-${h.id}`} className={`mt-1 text-xs ${h.explanation.trim() ? 'text-slate-600' : 'font-medium text-amber-900'}`}>
                          {h.explanation.trim() ? 'A blank line starts a new paragraph.' : 'Needed before publishing. A blank line starts a new paragraph.'}
                        </p>
                      </div>
                      <ScriptureRefList itemLabel={`Hotspot ${index + 1}`} idPrefix={`m3d-sc-${h.id}`} entries={h.scripture} onChange={(scripture) => onPatch(h.id, { scripture })} disabled={saving} />
                      <ItemLevelsField
                        idPrefix={`m3d-lv-${h.id}`}
                        itemLabel={`Hotspot ${index + 1}`}
                        plural="hotspots"
                        legend="Visible to"
                        value={h.levels}
                        onChange={(next) => onPatch(h.id, { levels: next })}
                        disabled={saving}
                      />
                    </fieldset>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
