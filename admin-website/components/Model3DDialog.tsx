'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Placement, ViewerHotspot } from '../lib/glb-viewer';
import { hasEmptyLevelChoice } from '../lib/item-levels';
import { EMPTY_MODEL_3D, GLB_CONTENT_TYPE, MODEL_3D_LIMITS, type Model3DContent, buildModel3D, model3DReadiness, newModelHotspotId, withoutPositions } from '../lib/model-3d';
import type { LearningLevel } from '../lib/types';
import { describeModelFile, useModelAsset } from '../lib/use-model-asset';
import CoverImageField from './CoverImageField';
import Model3DHotspotPanel, { type Placing } from './Model3DHotspotPanel';
import Icon from './Model3DIcons';
import Model3DViewer, { ViewerToolButton } from './Model3DViewer';
import { ErrorNote } from './SceneMediaDialogs';
import { LevelChoice, useGuardedClose } from './SectionCalloutDialogs';
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

type Tab = 'hotspots' | 'model';

function Body({
  mode,
  lessonLevels,
  initial,
  saving,
  error,
  onSave,
  requestClose,
  closeEditor,
  dirtyRef,
  escapeRef,
}: Omit<Props, 'isOpen' | 'onClose'> & {
  /** Closes the window (asking first when there are unsaved changes). */
  requestClose: () => void;
  /** What the window's Close button and Escape do: first undo whatever is open inside the editor, then close. */
  closeEditor: () => void;
  dirtyRef: React.MutableRefObject<boolean>;
  /** Tell the dialog how to undo the innermost thing that is open (a placement, a confirmation, a list), so Escape does that first instead of closing the window. True when it did something. */
  escapeRef: React.MutableRefObject<() => boolean>;
}) {
  const start = initial ?? EMPTY_MODEL_3D;
  const [draft, setDraft] = useState<Model3DContent>(start);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);
  const [tab, setTab] = useState<Tab>(start.mediaId ? 'hotspots' : 'model');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<Placing | null>(null);
  // Why the last click placed nothing, while a spot is being chosen.
  const [missed, setMissed] = useState<'surface' | 'marker' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // A model chosen while hotspots with positions exist waits here for the author's decision; '' = the model is being removed.
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const [needsOpen, setNeedsOpen] = useState(false);
  // What a screen reader is told after an action whose result is visual (a hotspot placed, moved, removed).
  const [announcement, setAnnouncement] = useState('');
  const asset = useModelAsset(draft.mediaId);

  const patch = (changes: Partial<Model3DContent>) => setDraft((d) => ({ ...d, ...changes }));
  const patchHotspot = (id: string, changes: Partial<Model3DContent['hotspots'][number]>) => setDraft((d) => ({ ...d, hotspots: d.hotspots.map((h) => (h.id === id ? { ...h, ...changes } : h)) }));
  const dirty = JSON.stringify(buildModel3D(draft)) !== JSON.stringify(buildModel3D(start));
  dirtyRef.current = dirty;

  const count = draft.hotspots.length;
  const emptyLevels = hasEmptyLevelChoice(draft.hotspots);
  const levelsMissing = mode === 'create' && levels.length === 0;
  const canSave = !saving && !levelsMissing && !emptyLevels;
  const needs = model3DReadiness(draft);
  const file = describeModelFile(draft.mediaId, asset);

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
    setMissed(null);
  };

  // Escape undoes the innermost thing first: a spot being chosen, then a delete question, then a model question, then the list of what is left to finish. Only then does it close the window.
  escapeRef.current = () => {
    if (placing) {
      cancelPlacing();
      return true;
    }
    if (confirmDelete !== null) {
      setConfirmDelete(null);
      return true;
    }
    if (pendingModel !== null) {
      setPendingModel(null);
      return true;
    }
    if (needsOpen) {
      setNeedsOpen(false);
      return true;
    }
    return false;
  };

  const select = (id: string | null) => {
    setSelectedId(id);
    if (id) setTab('hotspots');
  };

  // The chosen hotspot's row is brought into view (a marker tapped on the model can be for a row far down the list). Choosing a row by clicking it needs no scroll, so nothing moves then.
  useEffect(() => {
    if (!selectedId || tab !== 'hotspots') return;
    document.getElementById(`m3d-row-${selectedId}`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, tab]);

  // In the stacked (narrow) layout the stage may be scrolled out of sight when a placement starts from the panel below it: bring it back, so the banner and the model are in view.
  const showStage = () => document.getElementById('m3d-stage')?.scrollIntoView({ block: 'nearest' });
  const startAdd = () => {
    if (count >= MODEL_3D_LIMITS.maxHotspots) return;
    setMissed(null);
    setConfirmDelete(null);
    setTab('hotspots');
    setPlacing({ kind: 'add' });
    showStage();
  };
  const startMove = (id: string) => {
    setMissed(null);
    setConfirmDelete(null);
    setSelectedId(id);
    setTab('hotspots');
    setPlacing({ kind: 'move', id });
    showStage();
  };

  const movingNumber = placing?.kind === 'move' ? Math.max(0, draft.hotspots.findIndex((h) => h.id === placing.id)) + 1 : 0;
  const placement: Placement | null = placing
    ? {
        message:
          missed === 'surface'
            ? 'That click missed the model. Click directly on its surface.'
            : missed === 'marker'
              ? 'There is already a marker there. Click a different spot on the surface.'
              : placing.kind === 'move'
                ? `Choose a new position for Hotspot ${movingNumber}.`
                : 'Click a location on the model to place your hotspot.',
        onPlace: (point) => {
          const position = { x: point[0], y: point[1], z: point[2] };
          if (placing.kind === 'move') {
            patchHotspot(placing.id, { position });
            setAnnouncement(`Hotspot ${movingNumber} moved to its new position.`);
          } else {
            const id = newModelHotspotId(draft.hotspots);
            setDraft((d) => ({ ...d, hotspots: [...d.hotspots, { id, position, label: '', explanation: '', scripture: [], levels: null }] }));
            setSelectedId(id);
            setTab('hotspots');
            setAnnouncement(`Hotspot ${draft.hotspots.length + 1} placed on the model. Type its title.`);
            // Keyboard and screen-reader users land in the new hotspot's title field, ready to name it.
            window.setTimeout(() => document.getElementById(`m3d-label-${id}`)?.focus(), 80);
          }
          cancelPlacing();
        },
        onMiss: (reason) => setMissed(reason === 'marker' ? 'marker' : 'surface'),
        onCancel: cancelPlacing,
      }
    : null;

  const reorder = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= count) return;
    const id = draft.hotspots[index].id;
    setDraft((d) => {
      if (target >= d.hotspots.length) return d;
      const next = d.hotspots.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, hotspots: next };
    });
    setAnnouncement(`Hotspot moved to position ${target + 1} of ${count}.`);
    // The button that was used moves with its row; keep the keyboard on it (or on its opposite when it has reached the end).
    const keep = by < 0 ? (target > 0 ? 'up' : 'down') : target < count - 1 ? 'down' : 'up';
    window.setTimeout(() => document.getElementById(`m3d-${keep}-${id}`)?.focus(), 30);
  };
  const removeHotspot = (id: string) => {
    setDraft((d) => ({ ...d, hotspots: d.hotspots.filter((h) => h.id !== id) }));
    if (selectedId === id) setSelectedId(null);
    setConfirmDelete(null);
    cancelPlacing();
    setAnnouncement('Hotspot removed. The numbers have been updated.');
    window.setTimeout(() => document.getElementById('m3d-add')?.focus(), 30);
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

  /** Takes the author to the model chooser (the empty states' way to it). */
  const chooseModel = () => {
    setTab('model');
    window.setTimeout(() => document.querySelector<HTMLElement>('#m3d-model-field button')?.focus(), 80);
  };

  const onTabKeys = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next: Tab = event.key === 'Home' ? 'hotspots' : event.key === 'End' ? 'model' : tab === 'hotspots' ? 'model' : 'hotspots';
    setTab(next);
    document.getElementById(`m3d-tab-${next}`)?.focus();
  };

  const tabClass = (id: Tab) =>
    `-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 ${
      tab === id ? 'border-amber-600 text-slate-900' : 'border-transparent text-slate-700 hover:text-slate-900'
    }`;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(buildModel3D(draft), levels);
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      {/* The workspace header: what this is, the model, whether anything is unsaved, and Close. */}
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">3D content editor</p>
          <h3 id="modal-title" className="truncate text-lg font-semibold text-slate-900">
            {draft.title.trim() || 'Interactive 3D Model'}
          </h3>
          <p className={`truncate text-xs ${file.problem ? 'font-medium text-rose-800' : 'text-slate-600'}`}>
            {mode === 'create' ? 'Adding to the lesson · ' : ''}
            {file.text}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {dirty && !saving && (
            <span role="status" className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-950">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-600" />
              Unsaved changes
            </span>
          )}
          <button type="button" onClick={closeEditor} aria-label="Close" title="Close (Escape)" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* The workspace: the 3D stage and the editing panel. Side by side on a wide screen (the panel scrolls on its own); stacked on a narrow one (the whole area scrolls, so nothing is trapped). */}
      <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1.7fr)_minmax(22rem,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
        <section id="m3d-stage" aria-label="3D workspace" className="relative h-[min(60vh,34rem)] min-h-72 shrink-0 bg-[#0d121f] lg:h-auto lg:min-h-0">
          <div className="absolute inset-0">
            {draft.mediaId ? (
              <Model3DViewer
                key={draft.mediaId}
                mediaId={draft.mediaId}
                title={draft.title}
                fill
                asset={asset}
                hotspots={viewerHotspots}
                hotspotTotal={count}
                selectedId={selectedId}
                onSelectHotspot={select}
                placing={placement}
                editable
                toolbarExtra={
                  <ViewerToolButton icon="plus" label="Add hotspot" title="Add a hotspot, then click its spot on the model" onClick={startAdd} disabled={saving || count >= MODEL_3D_LIMITS.maxHotspots} />
                }
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5 text-amber-300 ring-1 ring-white/10">
                  <Icon name="cube" className="h-7 w-7" />
                </span>
                <p className="text-base font-semibold text-white">No 3D model selected</p>
                <p className="max-w-xs text-sm text-slate-300">Choose a GLB file from the Media Library. Then you can turn it around and place hotspots on it.</p>
                <button type="button" onClick={chooseModel} className="rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-400">
                  Choose a 3D model
                </button>
              </div>
            )}
          </div>
        </section>

        <aside aria-label="Editing panel" className="flex min-h-0 flex-col border-t border-slate-200 bg-slate-50 lg:border-l lg:border-t-0">
          <div role="tablist" aria-label="Editing panel sections" onKeyDown={onTabKeys} className="flex shrink-0 gap-1 border-b border-slate-200 bg-white px-3 pt-1">
            <button id="m3d-tab-hotspots" type="button" role="tab" aria-selected={tab === 'hotspots'} aria-controls="m3d-panel-hotspots" tabIndex={tab === 'hotspots' ? 0 : -1} onClick={() => setTab('hotspots')} className={tabClass('hotspots')}>
              Hotspots
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-800">{count}</span>
            </button>
            <button id="m3d-tab-model" type="button" role="tab" aria-selected={tab === 'model'} aria-controls="m3d-panel-model" tabIndex={tab === 'model' ? 0 : -1} onClick={() => setTab('model')} className={tabClass('model')}>
              Model &amp; details
              {file.problem && <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[11px] font-semibold text-rose-900">Check</span>}
            </button>
          </div>
          <p role="status" aria-live="polite" className="sr-only">
            {announcement}
          </p>

          <div className="min-h-0 flex-1 lg:overflow-y-auto">
            <div role="tabpanel" id="m3d-panel-hotspots" aria-labelledby="m3d-tab-hotspots" hidden={tab !== 'hotspots'} className="p-4">
              <Model3DHotspotPanel
                hotspots={draft.hotspots}
                selectedId={selectedId}
                placing={placing}
                saving={saving}
                hasModel={Boolean(draft.mediaId)}
                confirmDelete={confirmDelete}
                onSelect={select}
                onAdd={startAdd}
                onCancelPlacing={cancelPlacing}
                onMove={startMove}
                onReorder={reorder}
                onAskDelete={setConfirmDelete}
                onDelete={removeHotspot}
                onPatch={patchHotspot}
                onChooseModel={chooseModel}
              />
            </div>

            <div role="tabpanel" id="m3d-panel-model" aria-labelledby="m3d-tab-model" hidden={tab !== 'model'} className="p-4">
              <fieldset className="space-y-5" disabled={saving}>
                <legend className="sr-only">Model, poster and description</legend>
                <div>
                  <label htmlFor="m3d-title" className={LABEL}>Title (optional)</label>
                  <input id="m3d-title" type="text" maxLength={MODEL_3D_LIMITS.title} value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder="For example: The Great Statue" className={FIELD} />
                  <p className={HELP}>Learners see this above the model.</p>
                </div>

                <div id="m3d-model-field" className="space-y-3">
                  <div className={`flex items-start gap-3 rounded-lg border p-3 ${file.problem ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'}`}>
                    <span className={`mt-0.5 ${file.problem ? 'text-rose-700' : 'text-amber-700'}`}>
                      <Icon name={file.problem ? 'alert' : 'cube'} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Selected model</p>
                      <p className={`break-all text-sm ${file.problem ? 'font-medium text-rose-900' : 'text-slate-900'}`}>{file.text}</p>
                      {draft.mediaId && !file.problem && asset && asset !== 'missing' && asset.contentType === GLB_CONTENT_TYPE && <p className="text-xs text-slate-600">GLB 3D model</p>}
                    </div>
                  </div>
                  <CoverImageField subject="model" contentType={GLB_CONTENT_TYPE} value={draft.mediaId || null} onChange={(mediaId) => requestModel(mediaId ?? '')} disabled={saving} />
                  {pendingModel !== null && (
                    <div role="alertdialog" aria-labelledby="m3d-replace-title" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                      <p id="m3d-replace-title" className="text-sm font-semibold text-amber-950">
                        {pendingModel === '' ? 'Remove the model?' : 'Replace the model?'} Its hotspots may no longer fit.
                      </p>
                      <p className="text-sm text-amber-950">
                        The {count === 1 ? 'hotspot was' : `${count} hotspots were`} placed on the surface of the current model, so {count === 1 ? 'its position' : 'their positions'} belong to that file and would not
                        match another one. Your titles, explanations, Scripture and levels are not lost unless you choose to remove the hotspots. Nothing changes until you choose.
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
                    A single self-contained .glb file from the Media Library (required before publishing). The server has already checked that it is a real GLB model. Learners need an internet
                    connection to load it; it is not saved for offline reading.
                  </p>
                </div>

                <div className="space-y-2">
                  <CoverImageField subject="modelposter" value={draft.posterMediaId || null} onChange={(mediaId) => patch({ posterMediaId: mediaId ?? '' })} disabled={saving} />
                  <p className={HELP}>A still picture of the model. It is shown with the title and description, and it is saved with the lesson for offline reading.</p>
                </div>

                <div>
                  <label htmlFor="m3d-description" className={LABEL}>Description (optional)</label>
                  <textarea id="m3d-description" rows={4} maxLength={MODEL_3D_LIMITS.description} value={draft.description} onChange={(e) => patch({ description: e.target.value })} className={FIELD} />
                  <p className={HELP}>Say what learners are looking at ({draft.description.length} of {MODEL_3D_LIMITS.description}).</p>
                </div>

                {mode === 'create' && <LevelChoice lessonLevels={lessonLevels} levels={levels} setLevels={setLevels} disabled={saving} legend="Show this at" />}
              </fieldset>
            </div>
          </div>
        </aside>
      </div>

      {/* The footer stays in view whatever the window's height: what is wrong or unfinished, and Cancel and Save. */}
      <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
        {error && (
          <div className="mb-2">
            <ErrorNote error={error} />
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 space-y-1 text-xs">
            {emptyLevels && (
              <p role="alert" className="font-medium text-rose-700">
                A hotspot is hidden at every level. Tick at least one level for it before saving.
              </p>
            )}
            {levelsMissing && (
              <p role="alert" className="font-medium text-rose-700">
                Choose at least one level to show this at (in Model &amp; details).
              </p>
            )}
            {needs.length > 0 ? (
              <button type="button" aria-expanded={needsOpen} aria-controls="m3d-needs" onClick={() => setNeedsOpen((open) => !open)} className="inline-flex items-center gap-1.5 rounded font-medium text-amber-900 underline-offset-2 hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                <Icon name="alert" className="h-3.5 w-3.5" />
                A draft can be saved as it is. {needs.length} {needs.length === 1 ? 'thing' : 'things'} to finish before publishing
              </button>
            ) : (
              <p className="inline-flex items-center gap-1.5 text-emerald-800">
                <Icon name="check" className="h-3.5 w-3.5" />
                Nothing is missing for publishing.
              </p>
            )}
            {dirty && !saving && <p role="status" className="text-amber-900">You have changes that are not saved yet{mode === 'edit' ? '. Choose Save to keep them; closing this window asks first' : ''}.</p>}
          </div>
          <div className="flex shrink-0 gap-3">
            <button type="button" onClick={requestClose} disabled={saving} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
              Cancel
            </button>
            <button type="submit" disabled={!canSave} aria-busy={saving} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
              {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none" aria-hidden="true" />}
              {mode === 'create' ? 'Add to lesson' : 'Save'}
            </button>
          </div>
        </div>
        {needsOpen && needs.length > 0 && (
          <ul id="m3d-needs" className="mt-2 max-h-36 list-disc space-y-0.5 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 py-2 pl-7 pr-3 text-xs text-amber-950">
            {needs.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </footer>
    </form>
  );
}

/**
 * Add or edit an Interactive 3D Model block, in a large workspace: the live 3D stage on the left and, beside it, the hotspot manager and the model's details; the header shows the model and any
 * unsaved changes, and the footer keeps Cancel and Save in view. A draft may be saved without a model or with unfinished hotspots; publishing needs the model and every hotspot placed, titled and
 * explained. Escape (or the window's Close) first undoes whatever is open inside (a placement, a question), then closes, asking first when there are unsaved changes.
 */
export default function Model3DDialog({ isOpen, onClose, ...rest }: Props) {
  const { dirtyRef, requestClose } = useGuardedClose(rest.saving, onClose);
  const escapeRef = useRef<() => boolean>(() => false);
  const close = () => {
    if (escapeRef.current()) return;
    requestClose();
  };
  return (
    <Modal isOpen={isOpen} onClose={close} variant="workspace" title={rest.mode === 'create' ? 'Add an interactive 3D model' : 'Edit interactive 3D model'} description="A 3D model from your Media Library, with an optional title, poster, description and hotspots.">
      <Body {...rest} requestClose={requestClose} closeEditor={close} dirtyRef={dirtyRef} escapeRef={escapeRef} />
    </Modal>
  );
}
