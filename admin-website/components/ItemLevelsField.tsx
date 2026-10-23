'use client';

import React from 'react';
import { ITEM_LEVELS, ITEM_LEVEL_NAMES, itemLevelsToSave } from '../lib/item-levels';

interface Props {
  /** Makes the element ids unique per item. */
  idPrefix: string;
  /** "Hotspot 2", "Event 3" ...: used in labels. */
  itemLabel: string;
  /** What the learner gets, for the help text: "hotspots", "markers", "events". */
  plural: string;
  /** null/undefined = every level. An empty array is shown as an error (an item hidden at every level is not allowed). */
  value: string[] | null | undefined;
  onChange: (levels: string[] | null) => void;
  disabled?: boolean;
}

/**
 * Per-item level visibility (CMS-016, CMS-017). Learners at a level are given only the items ticked for it. Items that existed before this setting have none and
 * are shown at every level, so every box starts ticked. This is separate from the block's own level setting in the lesson: the block decides whether a learner
 * sees it at all, the ticks decide which of its items they get.
 */
export default function ItemLevelsField({ idPrefix, itemLabel, plural, value, onChange, disabled = false }: Props) {
  const ticked = value === undefined || value === null ? [...ITEM_LEVELS] : value;
  const toggle = (level: string) => {
    const next = ticked.includes(level) ? ticked.filter((l) => l !== level) : [...ticked, level];
    // an empty selection stays visible as an error instead of silently turning back into "every level"
    onChange(next.length === 0 ? [] : itemLevelsToSave(next));
  };
  return (
    <fieldset disabled={disabled} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <legend className="px-1 text-[11px] font-semibold uppercase text-slate-600">{itemLabel}: show at these levels</legend>
      <div className="flex flex-wrap gap-4">
        {ITEM_LEVELS.map((level) => (
          <label key={level} htmlFor={`${idPrefix}-${level}`} className="inline-flex items-center gap-2 text-sm text-slate-800 min-h-6">
            <input id={`${idPrefix}-${level}`} type="checkbox" className="h-4 w-4 accent-amber-600" checked={ticked.includes(level)} onChange={() => toggle(level)} />
            {ITEM_LEVEL_NAMES[level]}
          </label>
        ))}
      </div>
      {ticked.length === 0 ? (
        <p role="alert" className="mt-1 text-xs font-medium text-rose-700">Choose at least one level for {itemLabel.toLowerCase()}.</p>
      ) : (
        <p className="mt-1 text-[11px] text-slate-600">
          Learners at a level are given only the {plural} ticked for it. This is separate from the block&rsquo;s own level setting in the lesson; leave every box ticked to show it
          wherever the block is shown.
        </p>
      )}
    </fieldset>
  );
}
