'use client';

import React from 'react';
import type { CanvasHotspot } from './HotspotCanvas';

interface Props {
  hotspots: readonly CanvasHotspot[];
  selectedId: string | null;
  /** "hotspot" or "marker". */
  noun: string;
  onSelect: (id: string) => void;
}

/**
 * The numbered hotspots as a row of buttons: the keyboard- and screen-reader-friendly way to choose one (also when markers overlap on the picture). The chosen one is marked by a ring, a heavier
 * weight and a gold number as well as `aria-pressed`, so it does not depend on colour alone; one that is not placed on the picture yet says so.
 */
export default function HotspotChips({ hotspots, selectedId, noun, onSelect }: Props) {
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
  return (
    <ol aria-label={`${Noun}s in this image`} className="flex flex-wrap gap-2">
      {hotspots.map((h, index) => {
        const chosen = selectedId === h.id;
        return (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => onSelect(h.id)}
              aria-pressed={chosen}
              aria-label={`${Noun} ${index + 1}${h.label.trim() ? `: ${h.label.trim()}` : ''}${h.x === null ? ', not placed yet' : ''}${chosen ? ', selected' : ''}`}
              className={`inline-flex max-w-56 items-center gap-2 rounded-full border px-2 py-1 text-sm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${
                chosen ? 'border-amber-600 bg-amber-100 font-semibold text-slate-950 ring-2 ring-amber-400' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
              }`}
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${chosen ? 'bg-amber-400 text-slate-950' : 'bg-slate-900 text-white'}`}>{index + 1}</span>
              <span className="truncate">{h.label.trim() || 'No label yet'}</span>
              {h.x === null && (
                <span aria-hidden="true" className="shrink-0 rounded bg-amber-100 px-1 text-[11px] font-semibold text-amber-900">
                  Not placed
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
