'use client';

import React, { useMemo, useState } from 'react';
import type { ViewerHotspot } from '../lib/glb-viewer';
import { restrictedLevelsText } from '../lib/item-levels';
import { GLB_CONTENT_TYPE, model3DReadiness, readModel3D } from '../lib/model-3d';
import { describeModelFile, useModelAsset } from '../lib/use-model-asset';
import CubeIcon from './CubeIcon';
import MediaImage from './MediaImage';
import Icon from './Model3DIcons';
import Model3DViewer from './Model3DViewer';
import ScriptureEntriesView from './ScriptureEntriesView';

const NAV = 'inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

/**
 * An Interactive 3D Model block for the author (the working view, the lesson preview and a reusable block). It shows the poster (or a dark stage with a cube), the title, the model's file, the
 * description, the hotspots and what is still missing before publishing, and a "View in 3D" button: the real model is NOT loaded until it is pressed, so a lesson with several models costs
 * nothing until one is opened, and only one is live at a time (opening another closes this one). The live view is the same stage the editor uses, read-only (nothing can be placed or changed
 * here): the model on its dark stage with a toolbar (Reset view, Focus on the chosen hotspot, Help, Close) and the hotspots as numbered markers.
 *
 * The hotspots are the ones in the content it is given: in the learner preview that is already the previewed level's (the server leaves out the others), in the working view all of them,
 * with the levels each is reserved for. Choosing one (a marker, or its chip) shows its explanation and Scripture exactly as the content has them, whether or not the 3D view is open.
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
  const file = describeModelFile(c.mediaId, asset);
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
    <figure className="font-sans space-y-3">
      {live && c.mediaId ? (
        <Model3DViewer key={c.mediaId} mediaId={c.mediaId} title={c.title} asset={asset} hotspots={markers} hotspotTotal={c.hotspots.length} selectedId={selectedId} onSelectHotspot={setSelectedId} onClose={() => setLive(false)} heightClass="h-96" />
      ) : c.posterMediaId ? (
        <div className="overflow-hidden rounded-xl border border-slate-700 bg-[#0d121f]">
          <MediaImage mediaId={c.posterMediaId} alt={c.title ? `Poster for ${c.title}` : 'Poster for the 3D model'} className="block h-auto max-h-72 w-full" fit="contain" />
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-xl border border-slate-700 bg-[#0d121f] text-amber-300/80">
          <CubeIcon className="h-14 w-14" />
        </div>
      )}
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-amber-300">
          <CubeIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">Interactive 3D model</p>
          {c.title && <h4 className="text-base font-semibold text-slate-900 wrap-break-word">{c.title}</h4>}
          <p className={`text-xs break-all ${file.problem ? 'font-medium text-rose-800' : 'text-slate-700'}`}>{file.text}</p>
        </div>
        {usable && !live && (
          <button
            type="button"
            onClick={() => setLive(true)}
            className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
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
              const isSelected = h.id === selectedId;
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(isSelected ? null : h.id)}
                    aria-pressed={isSelected}
                    aria-label={`Hotspot ${i + 1}: ${h.label.trim() || 'untitled'}${h.position ? '' : ', not placed yet'}${restricted ? `, shown at ${restricted}` : ''}`}
                    className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs font-medium focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${isSelected ? 'border-amber-500 bg-amber-50 text-slate-900 ring-1 ring-amber-200' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${h.position ? 'bg-amber-400 text-slate-900' : 'border border-dashed border-slate-400 bg-white text-slate-600'}`}
                    >
                      {i + 1}
                    </span>
                    <span>{h.label.trim() || 'Untitled'}</span>
                    {restricted && <span className="text-[10px] text-slate-600">· {restricted}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
          {selected && (
            <section aria-label={`Hotspot ${index + 1} explanation`} className="space-y-2 rounded-xl border border-amber-300 border-l-4 border-l-amber-500 bg-white p-3 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900">
                  Hotspot {index + 1} of {c.hotspots.length}
                </p>
                <div className="flex gap-1.5">
                  <button type="button" className={NAV} aria-label="Previous hotspot" disabled={index === 0} onClick={() => step(-1)}>
                    <Icon name="up" className="h-3.5 w-3.5 -rotate-90" />
                    Previous
                  </button>
                  <button type="button" className={NAV} aria-label="Next hotspot" disabled={index >= c.hotspots.length - 1} onClick={() => step(1)}>
                    Next
                    <Icon name="up" className="h-3.5 w-3.5 rotate-90" />
                  </button>
                  <button type="button" className={NAV} aria-label="Close hotspot explanation" onClick={() => setSelectedId(null)}>
                    <Icon name="close" className="h-3.5 w-3.5" />
                    Close
                  </button>
                </div>
              </div>
              <h4 className="text-base font-semibold text-slate-900 wrap-break-word">{selected.label || <em className="font-normal text-slate-600">No label yet</em>}</h4>
              {!selected.position && <p className="text-xs font-medium text-amber-800">Not placed on the model yet.</p>}
              {restrictedLevelsText(selected.levels) && (
                <p>
                  <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-800">Only at: {restrictedLevelsText(selected.levels)}</span>
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
