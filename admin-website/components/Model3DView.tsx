'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { ViewerHotspot } from '../lib/glb-viewer';
import { formatBytes } from '../lib/image-block';
import { restrictedLevelsText } from '../lib/item-levels';
import { getMedia } from '../lib/media-api';
import { GLB_CONTENT_TYPE, model3DReadiness, readModel3D } from '../lib/model-3d';
import type { MediaAsset } from '../lib/types';
import CubeIcon from './CubeIcon';
import MediaImage from './MediaImage';
import Model3DViewer from './Model3DViewer';
import ScriptureEntriesView from './ScriptureEntriesView';

const NAV = 'px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

/** The chosen model file: loaded from the Media Library; null while it loads, 'missing' when it is gone. */
function useModelAsset(mediaId: string): MediaAsset | 'missing' | null {
  const [asset, setAsset] = useState<{ id: string; value: MediaAsset | 'missing' } | null>(null);
  useEffect(() => {
    if (!mediaId) return;
    let cancelled = false;
    getMedia(mediaId)
      .then((found) => !cancelled && setAsset({ id: mediaId, value: found }))
      .catch(() => !cancelled && setAsset({ id: mediaId, value: 'missing' }));
    return () => {
      cancelled = true;
    };
  }, [mediaId]);
  return asset && asset.id === mediaId ? asset.value : null;
}

/** The chosen model file, named, with its size and whether it is usable. A missing or wrong file is said plainly. */
function ModelFileLine({ asset }: { asset: MediaAsset | 'missing' | null }) {
  if (asset === null) return <p className="text-xs text-slate-700">Checking the model file…</p>;
  if (asset === 'missing') return <p className="text-xs font-medium text-rose-800">The model file is not in the Media Library any more.</p>;
  if (asset.contentType !== GLB_CONTENT_TYPE) return <p className="text-xs font-medium text-rose-800">{asset.originalFilename} is not a 3D model. Choose a GLB model.</p>;
  return (
    <p className="text-xs text-slate-800 break-all">
      <span className="font-semibold">{asset.originalFilename}</span> · {formatBytes(asset.sizeBytes)} · GLB model
    </p>
  );
}

/**
 * An Interactive 3D Model block for the author (the working view, the lesson preview and a reusable block). It shows the poster (or a cube), the title, the model's file, the description,
 * the hotspots and what is still missing before publishing, and a "View in 3D" button: the real model is NOT loaded until it is pressed, so a lesson with several models costs nothing until
 * one is opened, and only one is live at a time (opening another closes this one). The live view is the same viewer the editor uses, read-only (nothing can be placed or changed here),
 * and shows the hotspots as numbered markers on the model.
 *
 * The hotspots are the ones in the content it is given: in the learner preview that is already the previewed level's (the server leaves out the others), in the working view all of them,
 * with the levels each is reserved for. Choosing one (a marker, or its row) shows its explanation and Scripture exactly as the content has them, whether or not the 3D view is open.
 */
export function Model3DView({ content }: { content: unknown }) {
  const c = readModel3D(content);
  const asset = useModelAsset(c.mediaId);
  const [live, setLive] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const markerKey = c.hotspots.map((h) => `${h.id}:${h.position ? `${h.position.x},${h.position.y},${h.position.z}` : '-'}`).join('|');
  const markers = useMemo<ViewerHotspot[]>(
    () => c.hotspots.flatMap((h, index) => (h.position ? [{ id: h.id, position: [h.position.x, h.position.y, h.position.z] as [number, number, number], number: index + 1 }] : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markerKey],
  );
  if (!c.title && !c.mediaId && !c.posterMediaId && !c.description && c.hotspots.length === 0) return <span className="text-slate-600 italic font-sans text-xs">(No 3D model chosen yet)</span>;
  const needs = model3DReadiness(c);
  const usable = asset !== null && asset !== 'missing' && asset.contentType === GLB_CONTENT_TYPE;
  const index = c.hotspots.findIndex((h) => h.id === selectedId);
  const selected = index >= 0 ? c.hotspots[index] : null;
  const step = (delta: -1 | 1) => {
    const next = c.hotspots[index + delta];
    if (next) setSelectedId(next.id);
  };
  const paragraphs = selected
    ? selected.explanation
        .split(String.fromCharCode(10))
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
    : [];
  return (
    <figure className="font-sans space-y-2">
      {live && c.mediaId ? (
        <Model3DViewer key={c.mediaId} mediaId={c.mediaId} title={c.title} showFileInfo={false} onClose={() => setLive(false)} hotspots={markers} selectedId={selectedId} onSelectHotspot={setSelectedId} />
      ) : c.posterMediaId ? (
        <MediaImage mediaId={c.posterMediaId} alt={c.title ? `Poster for ${c.title}` : 'Poster for the 3D model'} className="block w-full h-auto max-h-64 rounded-lg border border-slate-200" fit="contain" />
      ) : (
        <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-500">
          <CubeIcon className="h-14 w-14" />
        </div>
      )}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
        <span className="mt-0.5 shrink-0 text-amber-800">
          <CubeIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          {c.title && <h4 className="text-base font-semibold text-slate-900 wrap-break-word">{c.title}</h4>}
          {c.mediaId ? <ModelFileLine asset={asset} /> : <p className="text-xs text-slate-700">No model file chosen yet.</p>}
        </div>
        {usable && !live && (
          <button
            type="button"
            onClick={() => setLive(true)}
            className="shrink-0 px-3 py-1.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            View in 3D
          </button>
        )}
      </div>
      {c.description && <p className="text-sm text-slate-800 whitespace-pre-line wrap-break-word">{c.description}</p>}

      {c.hotspots.length > 0 && (
        <section aria-label="Hotspots" className="space-y-2">
          <ol className="flex flex-wrap gap-1.5">
            {c.hotspots.map((h, i) => {
              const restricted = restrictedLevelsText(h.levels);
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(h.id === selectedId ? null : h.id)}
                    aria-pressed={h.id === selectedId}
                    aria-label={`Hotspot ${i + 1}: ${h.label.trim() || 'untitled'}${h.position ? '' : ', not placed yet'}${restricted ? `, shown at ${restricted}` : ''}`}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${h.id === selectedId ? 'border-amber-600 bg-amber-100 text-slate-900' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`}
                  >
                    <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-slate-900">{i + 1}</span>
                    <span>{h.label.trim() || 'Untitled'}</span>
                    {restricted && <span className="text-[10px] text-slate-600">· {restricted}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
          {selected && (
            <section aria-label={`Hotspot ${index + 1} explanation`} className="space-y-2 rounded-xl border border-amber-300 bg-amber-50/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                  Hotspot {index + 1} of {c.hotspots.length}
                </p>
                <div className="flex gap-1.5">
                  <button type="button" className={NAV} aria-label="Previous hotspot" disabled={index === 0} onClick={() => step(-1)}>
                    Previous
                  </button>
                  <button type="button" className={NAV} aria-label="Next hotspot" disabled={index >= c.hotspots.length - 1} onClick={() => step(1)}>
                    Next
                  </button>
                  <button type="button" className={NAV} aria-label="Close hotspot explanation" onClick={() => setSelectedId(null)}>
                    Close
                  </button>
                </div>
              </div>
              <h4 className="text-base font-semibold text-slate-900 wrap-break-word">{selected.label || <em className="font-normal text-slate-600">No label yet</em>}</h4>
              {!selected.position && <p className="text-xs font-medium text-amber-800">Not placed on the model yet.</p>}
              {restrictedLevelsText(selected.levels) && (
                <p>
                  <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-800">Only at: {restrictedLevelsText(selected.levels)}</span>
                </p>
              )}
              {paragraphs.length === 0 ? (
                <p className="text-sm text-slate-700">No explanation yet.</p>
              ) : (
                paragraphs.map((paragraph, i) => (
                  <p key={i} className="text-sm leading-relaxed text-slate-800 wrap-break-word">
                    {paragraph}
                  </p>
                ))
              )}
              <ScriptureEntriesView entries={selected.scriptureRaw} />
            </section>
          )}
        </section>
      )}

      {needs.length > 0 && <p className="text-xs font-medium text-amber-800">Before the lesson can be published: {needs.join(' ')}</p>}
    </figure>
  );
}
