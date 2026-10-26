'use client';

import React, { useState } from 'react';
import { readHotspotContent } from '../lib/hotspot-block';
import { restrictedLevelsText } from '../lib/item-levels';
import HotspotCanvas from './HotspotCanvas';
import HotspotChips from './HotspotChips';
import ScriptureEntriesView from './ScriptureEntriesView';

const NAV = 'px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

/**
 * An interactive-image block as the author or previewer sees it, built from the same pieces and the same saved positions as the editor and as the learner app: the WHOLE image (never
 * cropped, and kept short enough to fit on screen) with numbered markers placed on the picture as displayed, then the chosen hotspot's explanation panel with Previous / Next / Close.
 * Beside the picture when there is room (the block's own width decides, not the window's), under it otherwise. The choice of hotspot is only on screen: nothing here changes the content.
 * The hotspots shown are the ones passed in, which in the learner preview are already those of the previewed level. If the image cannot be shown, every label and explanation is listed instead,
 * so nothing is lost. With variant "map" it is the MAP block: an optional title, "marker" wording, and no complaint when there are no markers (a map may be just the image).
 */
export default function HotspotBlockView({ content, variant = 'interactive' }: { content: unknown; variant?: 'interactive' | 'map' }) {
  const isMap = variant === 'map';
  const noun = isMap ? 'marker' : 'hotspot';
  const Noun = isMap ? 'Marker' : 'Hotspot';
  const block = readHotspotContent(content);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!block.mediaId) return <span className="text-slate-600 italic font-sans text-xs">(No image chosen yet)</span>;
  const failed = status === 'failed';
  const index = block.hotspots.findIndex((h) => h.id === selectedId);
  const selected = index >= 0 ? block.hotspots[index] : null;
  const step = (delta: -1 | 1) => {
    const next = block.hotspots[index + delta];
    if (next) setSelectedId(next.id);
  };
  const paragraphs = selected ? selected.explanation.split(String.fromCharCode(10)).map((part) => part.trim()).filter((part) => part.length > 0) : [];

  return (
    <figure className="@container font-sans space-y-3">
      {isMap && block.title.trim() && <p className="text-base font-semibold text-slate-900 wrap-break-word">{block.title.trim()}</p>}
      <div className="grid gap-4 @2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] @2xl:items-start">
        <HotspotCanvas
          mediaId={block.mediaId}
          alt={block.altText}
          hotspots={block.hotspots}
          selectedId={selectedId}
          noun={noun}
          mode="view"
          maxHeightVh={60}
          onStatus={setStatus}
          onSelect={setSelectedId}
        />

        <div className="space-y-3">
          {failed && <p className="text-xs text-slate-700">The image could not be shown. The {noun}s are listed below.</p>}
          {block.hotspots.length === 0 ? (
            isMap ? null : <p className="text-xs text-slate-700">No hotspots yet.</p>
          ) : (
            <>
              <HotspotChips hotspots={block.hotspots} selectedId={selectedId} noun={noun} onSelect={setSelectedId} />
              {selected ? (
                <section aria-label={`${Noun} ${index + 1} explanation`} className="space-y-2 rounded-xl border border-amber-300 bg-amber-50/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                      {Noun} {index + 1} of {block.hotspots.length}
                    </p>
                    <div className="flex gap-1.5">
                      <button type="button" className={NAV} aria-label={`Previous ${noun}`} disabled={index === 0} onClick={() => step(-1)}>
                        Previous
                      </button>
                      <button type="button" className={NAV} aria-label={`Next ${noun}`} disabled={index >= block.hotspots.length - 1} onClick={() => step(1)}>
                        Next
                      </button>
                      <button type="button" className={NAV} aria-label={`Close ${noun} explanation`} onClick={() => setSelectedId(null)}>
                        Close
                      </button>
                    </div>
                  </div>
                  <h4 className="text-base font-semibold text-slate-900 wrap-break-word">{selected.label || <em className="font-normal text-slate-600">No label yet</em>}</h4>
                  {selected.x === null && <p className="text-xs font-medium text-amber-800">Not placed on the image yet.</p>}
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
              ) : (
                !failed && <p className="text-xs text-slate-700">Choose a numbered {noun} on the image, or one of the buttons above, to see its explanation.</p>
              )}
            </>
          )}
        </div>
      </div>

      {failed && block.hotspots.length > 0 && (
        <ol className="space-y-2">
          {block.hotspots.map((h, i) => (
            <li key={h.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
              <p className="text-sm font-medium text-slate-900 wrap-break-word">
                {i + 1}. {h.label || <em className="text-slate-600">No label yet</em>}
                {restrictedLevelsText(h.levels) && <span className="ml-2 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-800">Only at: {restrictedLevelsText(h.levels)}</span>}
              </p>
              <p className="mt-1 text-sm text-slate-800 whitespace-pre-line wrap-break-word">{h.explanation || 'No explanation yet.'}</p>
              <ScriptureEntriesView entries={h.scriptureRaw} />
            </li>
          ))}
        </ol>
      )}

      {block.caption && <figcaption className="text-sm text-slate-800">{block.caption}</figcaption>}
      {block.source && <p className="text-xs text-slate-600">Source: {block.source}</p>}
      {!block.altText && <p className="text-xs font-medium text-amber-800">No description yet: add alternative text before publishing.</p>}
    </figure>
  );
}
