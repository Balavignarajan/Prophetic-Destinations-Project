'use client';

import React, { useState } from 'react';
import { readHotspotContent } from '../lib/hotspot-block';
import MediaImage from './MediaImage';
import ScriptureEntriesView from './ScriptureEntriesView';

/**
 * An interactive-image block as the author or previewer sees it: the whole image with numbered markers placed on the picture as
 * displayed (positions are fractions of the image, so they follow it at any size), and a list below with each hotspot's
 * explanation. If the image cannot be shown, the list still carries every label and explanation. With variant "map" it is the MAP block:
 * an optional title, "marker" wording, and no complaint when there are no markers (a map may be just the image).
 */
export default function HotspotBlockView({ content, variant = 'interactive' }: { content: unknown; variant?: 'interactive' | 'map' }) {
  const isMap = variant === 'map';
  const noun = isMap ? 'marker' : 'hotspot';
  const block = readHotspotContent(content);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [selected, setSelected] = useState<string | null>(null);

  if (!block.mediaId) return <span className="text-slate-600 italic font-sans text-xs">(No image chosen yet)</span>;
  const showAll = status === 'failed';

  return (
    <figure className="font-sans space-y-3">
      {isMap && block.title.trim() && <p className="text-base font-semibold text-slate-900 break-words">{block.title.trim()}</p>}
      <div className="relative w-full max-w-2xl">
        <MediaImage mediaId={block.mediaId} alt={block.altText} className="block w-full h-auto rounded-lg border border-slate-200" onStatus={setStatus} />
        {status === 'ready' &&
          block.hotspots.map((h, index) =>
            h.x === null || h.y === null ? null : (
              <button
                key={h.id}
                type="button"
                onClick={() => setSelected((current) => (current === h.id ? null : h.id))}
                aria-label={`${isMap ? 'Marker' : 'Hotspot'} ${index + 1}: ${h.label || 'no label yet'}`}
                aria-pressed={selected === h.id}
                style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 h-7 w-7 rounded-full border-2 text-xs font-bold focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${selected === h.id ? 'bg-amber-500 border-white text-slate-950' : 'bg-slate-900 border-white text-white'}`}
              >
                {index + 1}
              </button>
            ),
          )}
      </div>
      {status === 'failed' && <p className="text-xs text-slate-700">The image could not be shown. The {noun}s are listed below.</p>}
      {block.caption && <figcaption className="text-sm text-slate-800">{block.caption}</figcaption>}
      {block.source && <p className="text-xs text-slate-600">Source: {block.source}</p>}
      {!block.altText && <p className="text-xs font-medium text-amber-800">No description yet: add alternative text before publishing.</p>}

      {block.hotspots.length === 0 ? (
        isMap ? null : <p className="text-xs text-slate-700">No hotspots yet.</p>
      ) : (
        <ol className="space-y-2">
          {block.hotspots.map((h, index) => {
            const open = showAll || selected === h.id;
            return (
              <li key={h.id} className="rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setSelected((current) => (current === h.id ? null : h.id))}
                  aria-expanded={open}
                  className="flex w-full items-start gap-2 p-2.5 text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 rounded-lg"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{index + 1}</span>
                  <span className="min-w-0 text-sm font-medium text-slate-900 break-words">
                    {h.label || <em className="text-slate-600">No label yet</em>}
                    {h.x === null && <span className="ml-2 text-xs font-medium text-amber-800">(not placed on the image yet)</span>}
                  </span>
                </button>
                {open && (
                  <div className="px-2.5 pb-2.5 pl-11">
                    <p className="text-sm text-slate-800 whitespace-pre-line break-words">{h.explanation || 'No explanation yet.'}</p>
                    <ScriptureEntriesView entries={h.scriptureRaw} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </figure>
  );
}
