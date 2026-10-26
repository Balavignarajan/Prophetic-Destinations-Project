'use client';

import React, { useRef, useState } from 'react';
import {
  HOTSPOT_LIMITS,
  type HotspotContent,
  type HotspotDraft,
  buildHotspotContent,
  clampFraction,
  newHotspotId,
  percentLabel,
  placementSummary,
} from '../lib/hotspot-block';
import { hasEmptyLevelChoice } from '../lib/item-levels';
import { fillIfEmpty } from '../lib/media-api';
import type { LearningLevel, MediaAsset } from '../lib/types';
import HotspotCanvas from './HotspotCanvas';
import HotspotChips from './HotspotChips';
import ImageUploadPanel from './ImageUploadPanel';
import ItemLevelsField from './ItemLevelsField';
import MediaBrowser from './MediaBrowser';
import ScriptureRefList from './ScriptureRefList';
import { Modal } from './ui';

interface Props {
  isOpen: boolean;
  mode: 'create' | 'edit';
  /** Levels the lesson is available at (a new block starts visible at all of them). */
  lessonLevels: LearningLevel[];
  initial: HotspotContent | null;
  /** 'map' = the MAP block: same editor, an optional title, "marker" wording, and markers are optional. Default: interactive image. */
  variant?: 'interactive' | 'map';
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (content: Record<string, unknown>, levels: LearningLevel[]) => void;
}

const FIELD = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const LABEL = 'block text-sm font-semibold text-slate-800 mb-1.5';
const BTN = 'px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';
const LEVEL_NAMES: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

interface BodyProps extends Omit<Props, 'isOpen' | 'onClose'> {
  requestClose: () => void;
  dirtyRef: React.MutableRefObject<boolean>;
}

const percent = (value: number | null) => (value === null ? '' : String(Math.round(value * 1000) / 10));

/** What "Undo" puts back: the position a hotspot had before the last placement, drag, nudge or clearing (null = it was not placed). */
interface UndoMove {
  id: string;
  x: number | null;
  y: number | null;
}

function Body({ mode, lessonLevels, initial, variant = 'interactive', saving, error, onSave, requestClose, dirtyRef }: BodyProps) {
  const isMap = variant === 'map';
  const noun = isMap ? 'marker' : 'hotspot';
  const Noun = isMap ? 'Marker' : 'Hotspot';
  const start: HotspotContent = initial ?? { title: '', mediaId: '', altText: '', caption: '', source: '', hotspots: [] };
  const [draft, setDraft] = useState<HotspotContent>(start);
  const [choosing, setChoosing] = useState(!start.mediaId);
  const [tab, setTab] = useState<'upload' | 'library'>('upload');
  const [picked, setPicked] = useState<MediaAsset | null>(null);
  const [reload, setReload] = useState(0);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);
  // Choosing which hotspot is shown on the right is only a view: it never changes the saved content, so the first one is simply open when the editor opens.
  const [selectedId, setSelectedId] = useState<string | null>(start.hotspots[0]?.id ?? null);
  const [imageStatus, setImageStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [notice, setNotice] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoMove | null>(null);
  const [announcement, setAnnouncement] = useState('');

  dirtyRef.current = JSON.stringify(buildHotspotContent(draft)) !== JSON.stringify(buildHotspotContent(start)) || (mode === 'create' && Boolean(draft.mediaId));

  const patch = (changes: Partial<HotspotContent>) => setDraft((d) => ({ ...d, ...changes }));
  const patchHotspot = (id: string, changes: Partial<HotspotDraft>) =>
    setDraft((d) => ({ ...d, hotspots: d.hotspots.map((h) => (h.id === id ? { ...h, ...changes } : h)) }));

  const selectedIndex = draft.hotspots.findIndex((h) => h.id === selectedId);
  const selected = selectedIndex >= 0 ? draft.hotspots[selectedIndex] : null;

  const useImage = (asset: MediaAsset) => {
    const replacing = Boolean(draft.mediaId) && draft.mediaId !== asset.id;
    const anyPlaced = draft.hotspots.some((h) => h.x !== null);
    setDraft((d) => ({
      ...d,
      mediaId: asset.id,
      altText: fillIfEmpty(d.altText, asset.altText),
      caption: fillIfEmpty(d.caption, asset.caption),
      source: fillIfEmpty(d.source, asset.source),
      // Positions belong to the old picture; keeping them on a different one would point at the wrong things.
      hotspots: replacing ? d.hotspots.map((h) => ({ ...h, x: null, y: null })) : d.hotspots,
    }));
    setUndo(null);
    setNotice(replacing && anyPlaced ? 'You chose a different image, so the marker positions were cleared. The labels and explanations are kept: place each marker on the new image again.' : null);
    setImageStatus('loading');
    setChoosing(false);
    setPicked(null);
    setReload((n) => n + 1);
  };

  const addHotspot = () => {
    const id = newHotspotId(draft.hotspots);
    setDraft((d) => ({ ...d, hotspots: [...d.hotspots, { id, x: null, y: null, label: '', explanation: '', scripture: [], levels: null }] }));
    setSelectedId(id);
    setAnnouncement(`${Noun} ${draft.hotspots.length + 1} added. Click the image to place it.`);
  };

  const removeHotspot = (id: string) => {
    const index = draft.hotspots.findIndex((h) => h.id === id);
    const h = draft.hotspots[index];
    if (!h) return;
    const hasContent = h.x !== null || h.label.trim() !== '' || h.explanation.trim() !== '' || h.scripture.length > 0;
    if (hasContent && !window.confirm(`Remove ${noun} ${index + 1}${h.label.trim() ? ` "${h.label.trim()}"` : ''}? Its label, explanation, Scripture references and position are deleted from this ${isMap ? 'map' : 'image'} when you save.`)) return;
    const rest = draft.hotspots.filter((x) => x.id !== id);
    setDraft((d) => ({ ...d, hotspots: d.hotspots.filter((x) => x.id !== id) }));
    setSelectedId((current) => (current === id ? (rest[index]?.id ?? rest[index - 1]?.id ?? null) : current));
    setUndo((current) => (current && current.id === id ? null : current));
    setAnnouncement(`${Noun} removed.`);
  };

  const reorderHotspot = (id: string, delta: -1 | 1) =>
    setDraft((d) => {
      const index = d.hotspots.findIndex((h) => h.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= d.hotspots.length) return d;
      const next = [...d.hotspots];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, hotspots: next };
    });

  const step = (delta: -1 | 1) => {
    const next = draft.hotspots[selectedIndex + delta];
    if (next) setSelectedId(next.id);
  };

  /** Puts a hotspot at a position (from a click, a drag or the arrow keys), remembering where it was so it can be undone. */
  const setPosition = (id: string, x: number | null, y: number | null, spoken?: string) => {
    const before = draft.hotspots.find((h) => h.id === id);
    if (!before) return;
    setUndo({ id, x: before.x, y: before.y });
    patchHotspot(id, { x, y });
    const index = draft.hotspots.findIndex((h) => h.id === id);
    if (spoken !== undefined) setAnnouncement(spoken);
    else if (x !== null && y !== null) setAnnouncement(`${Noun} ${index + 1} is now ${placementSummary({ x, y })}.`);
    else setAnnouncement(`${Noun} ${index + 1} position cleared.`);
  };

  const undoMove = () => {
    if (!undo) return;
    patchHotspot(undo.id, { x: undo.x, y: undo.y });
    setSelectedId(undo.id);
    setUndo(null);
    setAnnouncement('Last position change undone.');
  };

  const setAxis = (h: HotspotDraft, axis: 'x' | 'y', raw: string) => {
    if (raw.trim() === '') return setPosition(h.id, null, null);
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    const next = clampFraction(value / 100);
    // Typing into a hotspot that is not placed yet places it; the direction not typed starts at 50% until it is changed.
    if (axis === 'x') setPosition(h.id, next, h.y ?? 0.5);
    else setPosition(h.id, h.x ?? 0.5, next);
  };

  const canSave = !saving && Boolean(draft.mediaId) && !hasEmptyLevelChoice(draft.hotspots) && (mode === 'edit' || levels.length > 0);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSave) onSave(buildHotspotContent(draft), levels);
  };

  if (choosing) {
    return (
      <section aria-label="Choose an image" className="space-y-4">
        <div role="tablist" aria-label="Where the image comes from" className="flex gap-2 border-b border-slate-200">
          {([['upload', 'Upload a new image'], ['library', 'Choose from the Media Library']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`px-3.5 py-2 text-sm font-semibold -mb-px border-b-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${tab === id ? 'border-amber-600 text-slate-900' : 'border-transparent text-slate-700 hover:text-slate-900'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {draft.mediaId && draft.hotspots.some((h) => h.x !== null) && (
          <p className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
            Choosing a different image clears the marker positions (they belong to the current picture). Labels and explanations are kept.
          </p>
        )}
        {tab === 'upload' ? (
          <div role="tabpanel" className="space-y-3">
            <p className="text-sm text-slate-700">The image is saved in the Media Library, so you can use it again in other lessons.</p>
            <ImageUploadPanel buttonLabel="Upload and use this image" onUploaded={useImage} />
          </div>
        ) : (
          <div role="tabpanel" className="space-y-3">
            <div className="max-h-[46vh] overflow-y-auto pr-1">
              <MediaBrowser mode="select" canWrite={false} reloadToken={reload} selectedId={picked?.id ?? null} onSelect={setPicked} />
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button type="button" disabled={!picked} onClick={() => picked && useImage(picked)} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50">
                Use this image
              </button>
            </div>
          </div>
        )}
        {draft.mediaId && (
          <button type="button" onClick={() => setChoosing(false)} className="text-sm font-medium text-amber-900 underline min-h-6">
            Keep the current image
          </button>
        )}
      </section>
    );
  }

  const unplacedSelected = selected !== null && selected.x === null;

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
          {error} Everything you entered here is unchanged.
        </p>
      )}
      {notice && (
        <p role="status" className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
          {notice}
        </p>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {isMap && (
        <div>
          <label htmlFor="map-title" className={LABEL}>Title (optional)</label>
          <input id="map-title" type="text" maxLength={200} value={draft.title} disabled={saving} onChange={(e) => patch({ title: e.target.value })} className={FIELD} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        {/* LEFT (above on a narrow screen): the whole picture, which stays in view while the details are edited. */}
        <div className="space-y-3 lg:sticky lg:top-0">
          <HotspotCanvas
            mediaId={draft.mediaId}
            alt={draft.altText || 'Selected image'}
            hotspots={draft.hotspots}
            selectedId={selectedId}
            noun={noun}
            mode="edit"
            disabled={saving}
            maxHeightVh={58}
            onStatus={setImageStatus}
            onSelect={setSelectedId}
            onPlace={(id, x, y) => setPosition(id, x, y)}
            onMove={(id, x, y) => setPosition(id, x, y)}
          />
          <p className={`text-sm ${unplacedSelected ? 'font-medium text-amber-900' : 'text-slate-700'}`} role="status">
            {selected === null
              ? draft.hotspots.length === 0
                ? `Add a ${noun}, then click the image where it belongs.`
                : `Select a ${noun}, then click the image to place it.`
              : unplacedSelected
                ? `${Noun} ${selectedIndex + 1} still needs a position: click the image where it belongs.`
                : `${Noun} ${selectedIndex + 1} is selected. Drag its marker, or click the image to move it there.`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={BTN} disabled={saving || draft.hotspots.length >= HOTSPOT_LIMITS.maxHotspots} onClick={addHotspot}>
              Add {noun}
            </button>
            <button type="button" className={BTN} disabled={saving || !selected || selected.x === null} onClick={() => selected && setPosition(selected.id, null, null)}>
              Clear position
            </button>
            <button type="button" className={BTN} disabled={saving || !undo} onClick={undoMove}>
              Undo last move
            </button>
            <button type="button" className={BTN} onClick={() => setChoosing(true)} disabled={saving}>
              Replace image
            </button>
          </div>
          {draft.hotspots.length >= HOTSPOT_LIMITS.maxHotspots && <p className="text-xs text-slate-700">At most {HOTSPOT_LIMITS.maxHotspots} {noun}s.</p>}
          <p className="text-xs text-slate-600">Positions are saved as a share of the picture, so every marker stays on the same spot at any screen size.</p>
        </div>

        {/* RIGHT (below on a narrow screen): the chosen hotspot only. */}
        <div className="space-y-4">
          <div>
            <p className={LABEL}>{isMap ? 'Markers (optional)' : 'Hotspots'}</p>
            {draft.hotspots.length === 0 ? (
              <p className="p-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-700">
                {isMap
                  ? 'No markers. A map can be just the image; add a marker only if learners should tap a place to read an explanation.'
                  : 'No hotspots yet. Choose "Add hotspot", click the image where it belongs, then give it a label and an explanation.'}
              </p>
            ) : (
              <HotspotChips hotspots={draft.hotspots} selectedId={selectedId} noun={noun} onSelect={setSelectedId} />
            )}
          </div>

          {selected && (
            <fieldset className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/40 p-3" disabled={saving}>
              <legend className="sr-only">
                Details of {noun} {selectedIndex + 1}
              </legend>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  {Noun} {selectedIndex + 1} of {draft.hotspots.length}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={BTN} aria-label={`Previous ${noun}`} disabled={selectedIndex === 0} onClick={() => step(-1)}>
                    Previous
                  </button>
                  <button type="button" className={BTN} aria-label={`Next ${noun}`} disabled={selectedIndex >= draft.hotspots.length - 1} onClick={() => step(1)}>
                    Next
                  </button>
                  <button type="button" className={BTN} aria-label={`Move ${noun} ${selectedIndex + 1} earlier in the order`} disabled={selectedIndex === 0} onClick={() => reorderHotspot(selected.id, -1)}>
                    Move earlier
                  </button>
                  <button type="button" className={BTN} aria-label={`Move ${noun} ${selectedIndex + 1} later in the order`} disabled={selectedIndex >= draft.hotspots.length - 1} onClick={() => reorderHotspot(selected.id, 1)}>
                    Move later
                  </button>
                  <button type="button" className={`${BTN} text-rose-800`} aria-label={`Remove ${noun} ${selectedIndex + 1}`} onClick={() => removeHotspot(selected.id)}>
                    Remove
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor={`hs-label-${selected.id}`} className="block text-xs font-semibold text-slate-800 mb-1">
                  Label
                </label>
                <input
                  id={`hs-label-${selected.id}`}
                  type="text"
                  maxLength={HOTSPOT_LIMITS.label}
                  value={selected.label}
                  placeholder="e.g. Head of Gold"
                  onChange={(e) => patchHotspot(selected.id, { label: e.target.value })}
                  className={FIELD}
                />
              </div>
              <div>
                <label htmlFor={`hs-expl-${selected.id}`} className="block text-xs font-semibold text-slate-800 mb-1">
                  Explanation
                </label>
                <textarea
                  id={`hs-expl-${selected.id}`}
                  rows={5}
                  maxLength={HOTSPOT_LIMITS.explanation}
                  value={selected.explanation}
                  onChange={(e) => patchHotspot(selected.id, { explanation: e.target.value })}
                  aria-describedby={`hs-expl-count-${selected.id}`}
                  className={FIELD}
                />
                <p id={`hs-expl-count-${selected.id}`} className="mt-1 text-xs text-slate-600">
                  {selected.explanation.length}/{HOTSPOT_LIMITS.explanation}. A blank line starts a new paragraph.
                </p>
              </div>

              <ScriptureRefList
                itemLabel={`${Noun} ${selectedIndex + 1}`}
                idPrefix={`hs-sc-${selected.id}`}
                entries={selected.scripture}
                onChange={(scripture) => patchHotspot(selected.id, { scripture })}
                disabled={saving}
              />
              <ItemLevelsField
                idPrefix={`hs-lv-${selected.id}`}
                itemLabel={`${Noun} ${selectedIndex + 1}`}
                plural={`${noun}s`}
                value={selected.levels}
                onChange={(next) => patchHotspot(selected.id, { levels: next })}
                disabled={saving}
              />

              <details className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-800">Position (advanced): {placementSummary(selected)}</summary>
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-slate-600">
                    Clicking or dragging on the image is the easiest way to place it. These fields are for fine adjustment. Typing into a {noun} that is not placed yet places it, with 50% for the direction you did not type.
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label htmlFor={`hs-x-${selected.id}`} className="block text-xs font-semibold text-slate-800">Horizontal (% from left)</label>
                      <input id={`hs-x-${selected.id}`} type="number" min={0} max={100} step="any" value={percent(selected.x)} onChange={(e) => setAxis(selected, 'x', e.target.value)} className={`${FIELD} w-28`} />
                    </div>
                    <div>
                      <label htmlFor={`hs-y-${selected.id}`} className="block text-xs font-semibold text-slate-800">Vertical (% from top)</label>
                      <input id={`hs-y-${selected.id}`} type="number" min={0} max={100} step="any" value={percent(selected.y)} onChange={(e) => setAxis(selected, 'y', e.target.value)} className={`${FIELD} w-28`} />
                    </div>
                    <button type="button" className={BTN} onClick={() => setPosition(selected.id, 0.5, 0.5)}>
                      Place at centre
                    </button>
                  </div>
                  {selected.x !== null && selected.y !== null && (
                    <p className="text-xs text-slate-600">
                      Now {percentLabel(selected.x)} across and {percentLabel(selected.y)} down.
                    </p>
                  )}
                </div>
              </details>
            </fieldset>
          )}
          <p className="text-xs text-slate-700">A draft can be saved incomplete. {isMap ? 'Publishing needs the image description, and every marker you add must be placed, labelled and explained.' : 'Publishing needs the image description and at least one hotspot that is placed, labelled and explained.'}</p>
        </div>
      </div>

      <div className="space-y-4 border-t border-slate-100 pt-4">
        <div>
          <label htmlFor="hotspot-alt" className={LABEL}>
            Alternative text <span className="text-rose-700">(required)</span>
          </label>
          <textarea id="hotspot-alt" rows={2} maxLength={HOTSPOT_LIMITS.altText} value={draft.altText} disabled={saving} onChange={(e) => patch({ altText: e.target.value })} className={FIELD} />
          <p className="text-xs text-slate-700 mt-1">Describe the image as a whole for learners who cannot see it.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="hotspot-caption" className={LABEL}>Caption (optional)</label>
            <input id="hotspot-caption" type="text" maxLength={HOTSPOT_LIMITS.caption} value={draft.caption} disabled={saving} onChange={(e) => patch({ caption: e.target.value })} className={FIELD} />
          </div>
          <div>
            <label htmlFor="hotspot-source" className={LABEL}>Source or rights (optional)</label>
            <input id="hotspot-source" type="text" maxLength={HOTSPOT_LIMITS.source} value={draft.source} disabled={saving} onChange={(e) => patch({ source: e.target.value })} className={FIELD} />
          </div>
        </div>

        {mode === 'create' && (
          <fieldset disabled={saving}>
            <legend className={LABEL}>Show this {isMap ? 'map' : 'interactive image'} at</legend>
            <div className="flex flex-wrap gap-4">
              {lessonLevels.map((level) => (
                <label key={level} className="inline-flex items-center gap-2 text-sm text-slate-800 min-h-6">
                  <input type="checkbox" className="h-4 w-4 accent-amber-600" checked={levels.includes(level)} onChange={() => setLevels((c) => (c.includes(level) ? c.filter((l) => l !== level) : [...c, level]))} />
                  {LEVEL_NAMES[level] ?? level}
                </label>
              ))}
            </div>
            {levels.length === 0 && <p className="text-sm font-medium text-rose-700 mt-1">Choose at least one level.</p>}
          </fieldset>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
        <button type="button" onClick={requestClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
          Cancel
        </button>
        <button type="submit" disabled={!canSave} aria-busy={saving} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
          {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
          {mode === 'create' ? (isMap ? 'Add map to lesson' : 'Add interactive image') : isMap ? 'Save map' : 'Save interactive image'}
        </button>
      </div>
    </form>
  );
}

/** Adds or edits an interactive-image block without leaving the lesson. The form starts fresh each time it opens. */
export default function HotspotBlockDialog({ isOpen, onClose, ...rest }: Props) {
  const dirtyRef = useRef(false);
  const requestClose = () => {
    if (rest.saving) return;
    if (dirtyRef.current && !window.confirm('Discard your unsaved changes?')) return;
    dirtyRef.current = false;
    onClose();
  };
  return (
    <Modal
      isOpen={isOpen}
      onClose={requestClose}
      title={rest.variant === 'map' ? (rest.mode === 'create' ? 'Add a map or diagram' : 'Edit map or diagram') : rest.mode === 'create' ? 'Add an interactive image' : 'Edit interactive image'}
      description={rest.variant === 'map' ? 'A map or diagram from your Media Library, with optional numbered markers that show an explanation when chosen.' : 'An image with numbered hotspots; choosing one shows its explanation.'}
      maxWidth="5xl"
    >
      <Body {...rest} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Modal>
  );
}
