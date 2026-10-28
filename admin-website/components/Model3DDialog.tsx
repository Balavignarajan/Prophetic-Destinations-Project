'use client';

import React, { useMemo, useRef, useState } from 'react';
import type { Placement, ViewerHotspot } from '../lib/glb-viewer';
import { hasEmptyLevelChoice, restrictedLevelsText } from '../lib/item-levels';
import {
  EMPTY_MODEL_3D,
  GLB_CONTENT_TYPE,
  type Hotspot3DDraft,
  MODEL_3D_LIMITS,
  type Model3DContent,
  buildModel3D,
  model3DReadiness,
  newModelHotspotId,
  positionSummary,
  withoutPositions,
} from '../lib/model-3d';
import type { LearningLevel } from '../lib/types';
import CoverImageField from './CoverImageField';
import ItemLevelsField from './ItemLevelsField';
import Model3DViewer from './Model3DViewer';
import { ErrorNote, Missing } from './SceneMediaDialogs';
import ScriptureRefList from './ScriptureRefList';
import { Actions, LevelChoice, useGuardedClose } from './SectionCalloutDialogs';
import { Modal } from './ui';

const FIELD = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const LABEL = 'block text-sm font-semibold text-slate-800 mb-1';
const HELP = 'text-xs text-slate-700 mt-1';
const BTN = 'px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';
const BTN_DARK = 'px-3 py-1.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

interface Props {
  isOpen: boolean;
  mode: 'create' | 'edit';
  lessonLevels: LearningLevel[];
  saving: boolean;
  error: string | null;
  initial: Model3DContent | null;
  onClose: () => void;
  onSave: (content: Record<string, unknown>, levels: LearningLevel[]) => void;
}

/** What the author is currently choosing a spot for: a new hotspot, or a new place for an existing one. */
type Placing = { kind: 'add' } | { kind: 'move'; id: string };

function Body({
  mode,
  lessonLevels,
  initial,
  saving,
  error,
  onSave,
  requestClose,
  dirtyRef,
  placingRef,
  cancelRef,
}: Omit<Props, 'isOpen' | 'onClose'> & {
  requestClose: () => void;
  dirtyRef: React.MutableRefObject<boolean>;
  /** Tell the dialog whether a spot is being chosen, and how to stop, so Escape cancels that first instead of closing the window. */
  placingRef: React.MutableRefObject<boolean>;
  cancelRef: React.MutableRefObject<() => void>;
}) {
  const start = initial ?? EMPTY_MODEL_3D;
  const [draft, setDraft] = useState<Model3DContent>(start);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [missed, setMissed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // A model chosen while hotspots with positions exist waits here for the author's decision; '' = the model is being removed.
  const [pendingModel, setPendingModel] = useState<string | null>(null);

  const patch = (changes: Partial<Model3DContent>) => setDraft((d) => ({ ...d, ...changes }));
  const patchHotspot = (id: string, changes: Partial<Hotspot3DDraft>) => setDraft((d) => ({ ...d, hotspots: d.hotspots.map((h) => (h.id === id ? { ...h, ...changes } : h)) }));
  const dirty = JSON.stringify(buildModel3D(draft)) !== JSON.stringify(buildModel3D(start));
  dirtyRef.current = dirty;

  const count = draft.hotspots.length;
  const selectedIndex = draft.hotspots.findIndex((h) => h.id === selectedId);
  const selected = selectedIndex >= 0 ? draft.hotspots[selectedIndex] : null;
  const canSave = !saving && (mode === 'edit' || levels.length > 0) && !hasEmptyLevelChoice(draft.hotspots);

  // The markers the viewer draws: the placed hotspots, numbered by their place in the list (so number 3 here is number 3 in the list, even if number 2 is not placed yet).
  const markerKey = draft.hotspots.map((h) => `${h.id}:${h.position ? `${h.position.x},${h.position.y},${h.position.z}` : '-'}`).join('|');
  const viewerHotspots = useMemo<ViewerHotspot[]>(
    () =>
      draft.hotspots.flatMap((h, index) => (h.position ? [{ id: h.id, position: [h.position.x, h.position.y, h.position.z] as [number, number, number], number: index + 1 }] : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markerKey],
  );

  const cancelPlacing = () => {
    setPlacing(null);
    setMissed(false);
  };
  placingRef.current = placing !== null;
  cancelRef.current = cancelPlacing;

  const startAdd = () => {
    if (count >= MODEL_3D_LIMITS.maxHotspots) return;
    setMissed(false);
    setPlacing({ kind: 'add' });
  };
  const startMove = (id: string) => {
    setMissed(false);
    setSelectedId(id);
    setPlacing({ kind: 'move', id });
  };

  const placement: Placement | null = placing
    ? {
        message: missed ? 'That click missed the model. Click directly on its surface.' : placing.kind === 'move' ? 'Click the new location on the model to move the hotspot.' : 'Click a location on the model to place the hotspot.',
        onPlace: (point) => {
          const position = { x: point[0], y: point[1], z: point[2] };
          if (placing.kind === 'move') {
            patchHotspot(placing.id, { position });
          } else {
            const id = newModelHotspotId(draft.hotspots);
            setDraft((d) => ({ ...d, hotspots: [...d.hotspots, { id, position, label: '', explanation: '', scripture: [], levels: null }] }));
            setSelectedId(id);
            // Keyboard and screen-reader users land in the new hotspot's label field, ready to name it.
            window.setTimeout(() => document.getElementById(`m3d-label-${id}`)?.focus(), 60);
          }
          cancelPlacing();
        },
        onMiss: () => setMissed(true),
        onCancel: cancelPlacing,
      }
    : null;

  const moveHotspot = (index: number, by: -1 | 1) =>
    setDraft((d) => {
      const target = index + by;
      if (target < 0 || target >= d.hotspots.length) return d;
      const next = d.hotspots.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, hotspots: next };
    });
  const removeHotspot = (id: string) => {
    setDraft((d) => ({ ...d, hotspots: d.hotspots.filter((h) => h.id !== id) }));
    if (selectedId === id) setSelectedId(null);
    setConfirmDelete(null);
    cancelPlacing();
  };

  // A hotspot belongs to the model it was placed on. Changing the model while any is placed asks first, and never silently reuses or destroys them.
  const requestModel = (next: string) => {
    if (next === draft.mediaId) return;
    if (draft.hotspots.some((h) => h.position !== null)) {
      setPendingModel(next);
      return;
    }
    cancelPlacing();
    patch({ mediaId: next });
  };
  const applyModel = (next: string, keepText: boolean) => {
    cancelPlacing();
    setDraft((d) => ({ ...d, mediaId: next, hotspots: keepText ? withoutPositions(d.hotspots) : [] }));
    if (!keepText) setSelectedId(null);
    setPendingModel(null);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(buildModel3D(draft), levels);
      }}
      className="space-y-5"
    >
      <ErrorNote error={error} />
      <fieldset className="space-y-4" disabled={saving}>
        <legend className="sr-only">Interactive 3D model</legend>
        <div>
          <label htmlFor="m3d-title" className={LABEL}>Title (optional)</label>
          <input id="m3d-title" type="text" maxLength={MODEL_3D_LIMITS.title} value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder="For example: The Great Statue" className={FIELD} />
        </div>
        <CoverImageField subject="model" contentType={GLB_CONTENT_TYPE} value={draft.mediaId || null} onChange={(mediaId) => requestModel(mediaId ?? '')} disabled={saving} />
        {pendingModel !== null && (
          <div role="alertdialog" aria-labelledby="m3d-replace-title" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p id="m3d-replace-title" className="text-sm font-semibold text-amber-950">
              {pendingModel === '' ? 'Remove the model?' : 'Replace the model?'} Its hotspots may no longer fit.
            </p>
            <p className="text-sm text-amber-950">
              The {count === 1 ? 'hotspot was' : `${count} hotspots were`} placed on the surface of the current model, so {count === 1 ? 'its position' : 'their positions'} belong to that file and would not match
              another one. Your labels, explanations, Scripture and levels are not lost unless you choose to remove the hotspots. Nothing changes until you choose.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BTN_DARK} onClick={() => applyModel(pendingModel, true)}>
                {pendingModel === '' ? 'Remove the model and keep the hotspot text' : 'Replace and keep the hotspot text'}
              </button>
              <button type="button" className={BTN} onClick={() => applyModel(pendingModel, false)}>
                {pendingModel === '' ? 'Remove the model and the hotspots' : 'Replace and remove the hotspots'}
              </button>
              <button type="button" className={BTN} onClick={() => setPendingModel(null)}>
                Cancel (keep the current model)
              </button>
            </div>
            <p className="text-xs text-amber-900">Keeping the text clears every position: place each hotspot on the new model again.</p>
          </div>
        )}
        <p className={HELP}>
          A single self-contained .glb file from the Media Library (required before publishing). The server has already checked that it is a real GLB model. Learners need an internet connection to
          load it; it is not saved for offline reading.
        </p>
        <CoverImageField subject="modelposter" value={draft.posterMediaId || null} onChange={(mediaId) => patch({ posterMediaId: mediaId ?? '' })} disabled={saving} />
        <p className={HELP}>A still picture of the model. It is shown with the title and description, and it is saved with the lesson for offline reading.</p>
        <div>
          <label htmlFor="m3d-description" className={LABEL}>Description (optional)</label>
          <textarea id="m3d-description" rows={3} maxLength={MODEL_3D_LIMITS.description} value={draft.description} onChange={(e) => patch({ description: e.target.value })} className={FIELD} />
          <p className={HELP}>Say what learners are looking at ({draft.description.length} of {MODEL_3D_LIMITS.description}).</p>
        </div>
      </fieldset>

      {draft.mediaId && (
        <section aria-labelledby="m3d-hotspots-heading" className="space-y-3 border-t border-slate-200 pt-4">
          <div>
            <h3 id="m3d-hotspots-heading" className="text-base font-semibold text-slate-900">Hotspots (optional)</h3>
            <p className={HELP}>
              Numbered points on the model. Learners tap one, or choose it from a list, to read its explanation and Scripture. The model works without any. Add one, rotate and zoom the model
              if you need to, then click the exact spot on its surface.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div>
              <Model3DViewer
                key={draft.mediaId}
                mediaId={draft.mediaId}
                title={draft.title}
                heightClass="h-80 lg:h-[30rem]"
                hotspots={viewerHotspots}
                selectedId={selectedId}
                onSelectHotspot={setSelectedId}
                placing={placement}
                editable
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">
                  Hotspots ({count} of {MODEL_3D_LIMITS.maxHotspots})
                </p>
                <button
                  type="button"
                  className={BTN_DARK}
                  onClick={placing?.kind === 'add' ? cancelPlacing : startAdd}
                  disabled={saving || (placing?.kind !== 'add' && count >= MODEL_3D_LIMITS.maxHotspots)}
                  aria-pressed={placing?.kind === 'add'}
                >
                  {placing?.kind === 'add' ? 'Cancel adding' : 'Add hotspot'}
                </button>
              </div>
              {placing && (
                <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs font-medium text-amber-950">
                  {placing.kind === 'move' ? 'Click the new location on the model to move the hotspot.' : 'Click a location on the model to place the hotspot.'} Press Escape or Cancel to stop.
                </p>
              )}
              {count === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">No hotspots yet. The model is published as it is, without them.</p>
              ) : (
                <ol className="space-y-1.5">
                  {draft.hotspots.map((h, index) => {
                    const isSelected = h.id === selectedId;
                    const restricted = restrictedLevelsText(h.levels);
                    return (
                      <li key={h.id} className={`rounded-lg border p-2 ${isSelected ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-slate-900">
                            {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedId(isSelected ? null : h.id)}
                            aria-pressed={isSelected}
                            aria-label={`Hotspot ${index + 1}: ${h.label.trim() || 'untitled'}${h.position ? '' : ', not placed yet'}${restricted ? `, shown at ${restricted}` : ''}`}
                            className="min-w-32 flex-1 text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
                          >
                            <span className="block text-sm font-medium text-slate-900 wrap-break-word">{h.label.trim() || 'Untitled hotspot'}</span>
                            <span className="block text-[11px] text-slate-700">
                              {h.position ? 'Placed' : 'Not placed yet'} · {restricted ? `Levels: ${restricted}` : 'All levels'}
                            </span>
                          </button>
                          <button type="button" className={BTN} onClick={() => moveHotspot(index, -1)} disabled={saving || index === 0} aria-label={`Move hotspot ${index + 1} up`}>
                            Up
                          </button>
                          <button type="button" className={BTN} onClick={() => moveHotspot(index, 1)} disabled={saving || index === count - 1} aria-label={`Move hotspot ${index + 1} down`}>
                            Down
                          </button>
                          <button type="button" className={`${BTN} text-rose-800`} onClick={() => setConfirmDelete(h.id)} disabled={saving} aria-label={`Delete hotspot ${index + 1}`}>
                            Delete
                          </button>
                        </div>
                        {confirmDelete === h.id && (
                          <div role="alertdialog" aria-label={`Delete hotspot ${index + 1}?`} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 p-2">
                            <p className="text-xs font-medium text-rose-900">Delete hotspot {index + 1} and its explanation? The model itself is not touched.</p>
                            <button type="button" className={`${BTN} text-rose-800`} onClick={() => removeHotspot(h.id)}>
                              Delete hotspot
                            </button>
                            <button type="button" className={BTN} onClick={() => setConfirmDelete(null)}>
                              Keep it
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}

              {selected && (
                <fieldset disabled={saving} className="space-y-3 rounded-lg border border-slate-300 bg-slate-50/60 p-3">
                  <legend className="px-1 text-xs font-semibold uppercase text-slate-700">Hotspot {selectedIndex + 1}</legend>
                  <div>
                    <label htmlFor={`m3d-label-${selected.id}`} className="block text-xs font-semibold text-slate-800 mb-1">Label</label>
                    <input
                      id={`m3d-label-${selected.id}`}
                      type="text"
                      maxLength={MODEL_3D_LIMITS.label}
                      value={selected.label}
                      placeholder="e.g. Head of Gold"
                      onChange={(e) => patchHotspot(selected.id, { label: e.target.value })}
                      className={FIELD}
                    />
                  </div>
                  <div>
                    <label htmlFor={`m3d-expl-${selected.id}`} className="block text-xs font-semibold text-slate-800 mb-1">Explanation</label>
                    <textarea
                      id={`m3d-expl-${selected.id}`}
                      rows={5}
                      maxLength={MODEL_3D_LIMITS.explanation}
                      value={selected.explanation}
                      onChange={(e) => patchHotspot(selected.id, { explanation: e.target.value })}
                      aria-describedby={`m3d-expl-count-${selected.id}`}
                      className={FIELD}
                    />
                    <p id={`m3d-expl-count-${selected.id}`} className="mt-1 text-xs text-slate-600">
                      {selected.explanation.length}/{MODEL_3D_LIMITS.explanation}. A blank line starts a new paragraph.
                    </p>
                  </div>
                  <ScriptureRefList
                    itemLabel={`Hotspot ${selectedIndex + 1}`}
                    idPrefix={`m3d-sc-${selected.id}`}
                    entries={selected.scripture}
                    onChange={(scripture) => patchHotspot(selected.id, { scripture })}
                    disabled={saving}
                  />
                  <ItemLevelsField
                    idPrefix={`m3d-lv-${selected.id}`}
                    itemLabel={`Hotspot ${selectedIndex + 1}`}
                    plural="hotspots"
                    value={selected.levels}
                    onChange={(next) => patchHotspot(selected.id, { levels: next })}
                    disabled={saving}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={BTN} onClick={() => (placing?.kind === 'move' && placing.id === selected.id ? cancelPlacing() : startMove(selected.id))}>
                      {placing?.kind === 'move' && placing.id === selected.id ? 'Cancel moving' : selected.position ? 'Move hotspot' : 'Place on the model'}
                    </button>
                    <p className="text-xs text-slate-700">{positionSummary(selected.position)}</p>
                  </div>
                </fieldset>
              )}
            </div>
          </div>
        </section>
      )}

      <Missing items={model3DReadiness(draft)} />
      {hasEmptyLevelChoice(draft.hotspots) && <p role="alert" className="text-sm font-medium text-rose-700">A hotspot is hidden at every level. Tick at least one level for it before saving.</p>}
      {mode === 'create' && <LevelChoice lessonLevels={lessonLevels} levels={levels} setLevels={setLevels} disabled={saving} legend="Show this at" />}
      {dirty && !saving && (
        <p role="status" className="text-xs font-medium text-amber-900">
          You have changes that are not saved yet{mode === 'edit' ? '. Choose Save to keep them; closing this window asks first' : ''}.
        </p>
      )}
      <Actions saving={saving} canSave={canSave} createLabel="Add to lesson" editLabel="Save" mode={mode} requestClose={requestClose} />
    </form>
  );
}

/**
 * Add or edit an Interactive 3D Model block: title, the GLB model, an optional poster and description, and its hotspots (placed on the model's surface in the live viewer). A draft may be saved
 * without a model or with unfinished hotspots; publishing needs the model and every hotspot placed, labelled and explained. Escape (or the window's close) first stops a placement in progress.
 */
export default function Model3DDialog({ isOpen, onClose, ...rest }: Props) {
  const { dirtyRef, requestClose } = useGuardedClose(rest.saving, onClose);
  const placingRef = useRef(false);
  const cancelRef = useRef<() => void>(() => undefined);
  const close = () => {
    if (placingRef.current) {
      cancelRef.current();
      return;
    }
    requestClose();
  };
  return (
    <Modal isOpen={isOpen} onClose={close} title={rest.mode === 'create' ? 'Add an interactive 3D model' : 'Edit interactive 3D model'} description="A 3D model from your Media Library, with an optional title, poster, description and hotspots." maxWidth="6xl">
      <Body {...rest} requestClose={requestClose} dirtyRef={dirtyRef} placingRef={placingRef} cancelRef={cancelRef} />
    </Modal>
  );
}
