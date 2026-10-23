'use client';

import React, { useRef, useState } from 'react';
import {
  HOTSPOT_LIMITS,
  type HotspotContent,
  type HotspotDraft,
  buildHotspotContent,
  clampFraction,
  newHotspotId,
} from '../lib/hotspot-block';
import { hasEmptyLevelChoice } from '../lib/item-levels';
import { fillIfEmpty } from '../lib/media-api';
import type { LearningLevel, MediaAsset } from '../lib/types';
import ImageUploadPanel from './ImageUploadPanel';
import ItemLevelsField from './ItemLevelsField';
import MediaBrowser from './MediaBrowser';
import MediaImage from './MediaImage';
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imageStatus, setImageStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [notice, setNotice] = useState<string | null>(null);

  dirtyRef.current = JSON.stringify(buildHotspotContent(draft)) !== JSON.stringify(buildHotspotContent(start)) || (mode === 'create' && Boolean(draft.mediaId));

  const patch = (changes: Partial<HotspotContent>) => setDraft((d) => ({ ...d, ...changes }));
  const patchHotspot = (id: string, changes: Partial<HotspotDraft>) =>
    setDraft((d) => ({ ...d, hotspots: d.hotspots.map((h) => (h.id === id ? { ...h, ...changes } : h)) }));

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
  };
  const removeHotspot = (id: string) => {
    setDraft((d) => ({ ...d, hotspots: d.hotspots.filter((h) => h.id !== id) }));
    setSelectedId((current) => (current === id ? null : current));
  };
  const moveHotspot = (index: number, delta: -1 | 1) =>
    setDraft((d) => {
      const target = index + delta;
      if (target < 0 || target >= d.hotspots.length) return d;
      const next = [...d.hotspots];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, hotspots: next };
    });

  const placeFromPointer = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedId || saving) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    patchHotspot(selectedId, { x: clampFraction((e.clientX - rect.left) / rect.width), y: clampFraction((e.clientY - rect.top) / rect.height) });
  };

  const nudge = (h: HotspotDraft, e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = move[e.key];
    if (!delta || h.x === null || h.y === null) return;
    e.preventDefault();
    patchHotspot(h.id, { x: clampFraction(h.x + delta[0]), y: clampFraction(h.y + delta[1]) });
  };

  const setAxis = (h: HotspotDraft, axis: 'x' | 'y', raw: string) => {
    if (raw.trim() === '') return patchHotspot(h.id, { x: null, y: null });
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    const next = clampFraction(value / 100);
    patchHotspot(h.id, axis === 'x' ? { x: next, y: h.y ?? 0.5 } : { y: next, x: h.x ?? 0.5 });
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

  return (
    <form onSubmit={submit} className="space-y-5">
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

      {isMap && (
        <div>
          <label htmlFor="map-title" className={LABEL}>Title (optional)</label>
          <input id="map-title" type="text" maxLength={200} value={draft.title} disabled={saving} onChange={(e) => patch({ title: e.target.value })} className={FIELD} />
        </div>
      )}

      <div className="space-y-2">
        <div
          className={`relative w-full max-w-2xl ${selectedId ? 'cursor-crosshair' : ''}`}
          onClick={placeFromPointer}
          role="group"
          aria-label={`${isMap ? 'Map or diagram' : 'Image'} with ${noun} markers. Choose a ${noun} below, then click the image to place it, or use the position fields.`}
        >
          <MediaImage mediaId={draft.mediaId} alt={draft.altText || 'Selected image'} className="block w-full h-auto rounded-lg border border-slate-300" onStatus={setImageStatus} />
          {imageStatus === 'ready' &&
            draft.hotspots.map((h, index) =>
              h.x === null || h.y === null ? null : (
                <button
                  key={h.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(h.id);
                  }}
                  onKeyDown={(e) => nudge(h, e)}
                  aria-label={`${Noun} ${index + 1}: ${h.label || 'no label yet'}. Use the arrow keys to move it.`}
                  aria-pressed={selectedId === h.id}
                  style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 h-7 w-7 rounded-full border-2 text-xs font-bold focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${selectedId === h.id ? 'bg-amber-500 border-white text-slate-950' : 'bg-slate-900 border-white text-white'}`}
                >
                  {index + 1}
                </button>
              ),
            )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={BTN} onClick={() => setChoosing(true)} disabled={saving}>
            Replace image
          </button>
          <p className="text-xs text-slate-700">
            {selectedId ? `Click the image to place the selected ${noun}.` : `Select a ${noun} below, then click the image to place it. Positions stay on the same spot of the picture at any screen size.`}
          </p>
        </div>
      </div>

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

      <fieldset className="space-y-3" disabled={saving}>
        <legend className={LABEL}>{isMap ? 'Markers (optional)' : 'Hotspots'}</legend>
        {draft.hotspots.length === 0 ? (
          <p className="p-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-700">
            {isMap ? 'No markers. A map can be just the image; add a marker only if learners should tap a place to read an explanation.' : 'No hotspots yet. Add one, give it a label and an explanation, then place it on the image.'}
          </p>
        ) : (
          <ol className="space-y-3">
            {draft.hotspots.map((h, index) => (
              <li key={h.id} className={`rounded-lg border p-3 space-y-2 ${selectedId === h.id ? 'border-amber-600 bg-amber-50/50' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => setSelectedId(h.id)} aria-pressed={selectedId === h.id} className="flex items-center gap-2 text-sm font-semibold text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 rounded">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">{index + 1}</span>
                    {selectedId === h.id ? 'Selected' : 'Select'} {noun} {index + 1}
                    {h.x === null && <span className="text-xs font-medium text-amber-800">(not placed)</span>}
                  </button>
                  <div className="flex gap-2">
                    <button type="button" className={BTN} aria-label={`Move ${noun} ${index + 1} up`} disabled={index === 0} onClick={() => moveHotspot(index, -1)}>Up</button>
                    <button type="button" className={BTN} aria-label={`Move ${noun} ${index + 1} down`} disabled={index === draft.hotspots.length - 1} onClick={() => moveHotspot(index, 1)}>Down</button>
                    <button type="button" className={BTN} aria-label={`Remove ${noun} ${index + 1}`} onClick={() => removeHotspot(h.id)}>Remove</button>
                  </div>
                </div>
                <div>
                  <label htmlFor={`hs-label-${h.id}`} className="block text-xs font-semibold text-slate-800">Label {index + 1}</label>
                  <input id={`hs-label-${h.id}`} type="text" maxLength={HOTSPOT_LIMITS.label} value={h.label} onChange={(e) => patchHotspot(h.id, { label: e.target.value })} onFocus={() => setSelectedId(h.id)} className={FIELD} />
                </div>
                <div>
                  <label htmlFor={`hs-expl-${h.id}`} className="block text-xs font-semibold text-slate-800">Explanation {index + 1}</label>
                  <textarea id={`hs-expl-${h.id}`} rows={3} maxLength={HOTSPOT_LIMITS.explanation} value={h.explanation} onChange={(e) => patchHotspot(h.id, { explanation: e.target.value })} onFocus={() => setSelectedId(h.id)} className={FIELD} />
                </div>
                <ScriptureRefList
                  itemLabel={`${Noun} ${index + 1}`}
                  idPrefix={`hs-sc-${h.id}`}
                  entries={h.scripture}
                  onChange={(scripture) => patchHotspot(h.id, { scripture })}
                  disabled={saving}
                />
                <ItemLevelsField idPrefix={`hs-lv-${h.id}`} itemLabel={`${Noun} ${index + 1}`} plural={`${noun}s`} value={h.levels} onChange={(next) => patchHotspot(h.id, { levels: next })} disabled={saving} />
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label htmlFor={`hs-x-${h.id}`} className="block text-xs font-semibold text-slate-800">Horizontal position (% from left)</label>
                    <input id={`hs-x-${h.id}`} type="number" min={0} max={100} step={0.5} value={percent(h.x)} onChange={(e) => setAxis(h, 'x', e.target.value)} className={`${FIELD} w-28`} />
                  </div>
                  <div>
                    <label htmlFor={`hs-y-${h.id}`} className="block text-xs font-semibold text-slate-800">Vertical position (% from top)</label>
                    <input id={`hs-y-${h.id}`} type="number" min={0} max={100} step={0.5} value={percent(h.y)} onChange={(e) => setAxis(h, 'y', e.target.value)} className={`${FIELD} w-28`} />
                  </div>
                  <button type="button" className={BTN} onClick={() => patchHotspot(h.id, { x: 0.5, y: 0.5 })}>Place at centre</button>
                </div>
              </li>
            ))}
          </ol>
        )}
        <button type="button" className={BTN} disabled={draft.hotspots.length >= HOTSPOT_LIMITS.maxHotspots} onClick={addHotspot}>
          Add {noun}
        </button>
        {draft.hotspots.length >= HOTSPOT_LIMITS.maxHotspots && <p className="text-xs text-slate-700">At most {HOTSPOT_LIMITS.maxHotspots} {noun}s.</p>}
        <p className="text-xs text-slate-700">A draft can be saved incomplete. {isMap ? 'Publishing needs the image description, and every marker you add must be placed, labelled and explained.' : 'Publishing needs the image description and at least one hotspot that is placed, labelled and explained.'}</p>
      </fieldset>

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
      maxWidth="2xl"
    >
      <Body {...rest} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Modal>
  );
}
