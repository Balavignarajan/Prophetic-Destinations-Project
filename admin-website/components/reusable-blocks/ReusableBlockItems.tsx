'use client';

import React, { useState } from 'react';
import { friendlyBlockName } from '../../lib/block-catalog';
import { levelName, shortDate, versionsText } from '../../lib/reusable-blocks';
import type { ReusableBlockSummary } from '../../lib/types';
import { type MenuItem, RowMenu } from '../RowMenu';
import BlockCardPreview from './BlockCardPreview';
import BlockTypeIcon from './BlockTypeIcon';
import { useBlockContent } from './useBlockContent';

/**
 * One reusable block in the library, as a card (grid view) or a row (list view). Both show the same facts and offer the same three actions in a three-dot menu: Preview Block, Edit Block and
 * Delete Block (the last two only for staff who may change blocks). Opening the preview is ONE control per item (a button stretched over the whole card, so the card is easy to hit), and the menu sits
 * above it, so there are no clickable elements inside other clickable elements. Nothing here changes anything: choosing an action hands it to the page.
 */
interface ItemProps {
  item: ReusableBlockSummary;
  canWrite: boolean;
  /** The block being opened (its full content is being read). */
  busy: boolean;
  onPreview: (item: ReusableBlockSummary) => void;
  onEdit: (item: ReusableBlockSummary) => void;
  onDelete: (item: ReusableBlockSummary) => void;
}

const menuFor = ({ item, canWrite, onPreview, onEdit, onDelete }: ItemProps): MenuItem[] => [
  { key: 'preview', label: 'Preview Block', hint: 'See it as learners would in the app', onSelect: () => onPreview(item) },
  ...(canWrite
    ? [
        { key: 'edit', label: 'Edit Block', hint: 'Name, description and content', onSelect: () => onEdit(item) },
        { key: 'delete', label: 'Delete Block', hint: 'Removes it from the library only', onSelect: () => onDelete(item), danger: true, dividerBefore: true },
      ]
    : []),
];

/** The levels a block is visible at (the levels it was saved with), as small badges; "own version" says which levels carry their own text. */
export function LevelBadges({ levels }: { levels: ReusableBlockSummary['levels'] }) {
  if (levels.length === 0) return <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">No levels</span>;
  return (
    <ul aria-label="Learning levels" className="flex flex-wrap gap-1">
      {levels.map((entry) => (
        <li key={entry.level} className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-800">
          {levelName(entry.level)}
          {entry.hasVariant && <span className="sr-only"> (has its own version)</span>}
        </li>
      ))}
    </ul>
  );
}

export function ReusableBlockCard(props: ItemProps & { bookNames: Record<string, string> }) {
  const { item, busy, onPreview, bookNames } = props;
  const { ref, state, retry } = useBlockContent(item.id, item.version);
  const [menuOpen, setMenuOpen] = useState(false);
  const versions = versionsText(item.levels);
  return (
    <article ref={ref} className="group relative flex h-full flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-shadow hover:border-slate-300 hover:shadow-md motion-reduce:transition-none">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
          <BlockTypeIcon type={item.type} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900 wrap-break-word">{item.name}</h3>
          <p className="text-xs text-slate-700">{friendlyBlockName(item.type)}</p>
        </div>
        {/* Above the card's stretched Preview button; raised further while its menu is open so the menu is never covered by the next card's. */}
        <div className={`relative shrink-0 ${menuOpen ? 'z-30' : 'z-10'}`}>
          <RowMenu label={`More actions for ${item.name}`} items={menuFor(props)} disabled={busy} ownerId={item.id} onOpenChange={setMenuOpen} />
        </div>
      </div>

      {item.description && <p className="line-clamp-2 text-xs text-slate-700 wrap-break-word">{item.description}</p>}

      <div className="min-h-20 flex-1 rounded-lg bg-slate-50/70 p-3">
        <BlockCardPreview type={item.type} state={state} bookNames={bookNames} onRetry={retry} />
      </div>

      <div className="space-y-1.5">
        <LevelBadges levels={item.levels} />
        {versions && <p className="text-xs text-purple-800">{versions}</p>}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-700">Updated {shortDate(item.updatedAt)}</p>
        <button
          type="button"
          onClick={() => onPreview(item)}
          disabled={busy}
          aria-label={`Preview ${item.name}`}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 after:absolute after:inset-0 after:rounded-xl hover:bg-slate-50 disabled:opacity-60 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:after:ring-2 focus-visible:after:ring-amber-500"
        >
          {busy ? 'Opening…' : 'Preview'}
        </button>
      </div>
    </article>
  );
}

export function ReusableBlockRow(props: ItemProps) {
  const { item, busy, onPreview } = props;
  const versions = versionsText(item.levels);
  return (
    <li className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-slate-50/70">
      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
        <BlockTypeIcon type={item.type} className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-semibold text-slate-900 wrap-break-word">{item.name}</p>
        {item.description && <p className="line-clamp-1 text-xs text-slate-700 wrap-break-word">{item.description}</p>}
      </div>
      <p className="basis-36 text-sm text-slate-800">{friendlyBlockName(item.type)}</p>
      <div className="basis-48 space-y-1">
        <LevelBadges levels={item.levels} />
        {versions && <p className="text-xs text-purple-800">{versions}</p>}
      </div>
      <p className="basis-28 whitespace-nowrap text-xs text-slate-700">Updated {shortDate(item.updatedAt)}</p>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onPreview(item)}
          disabled={busy}
          aria-label={`Preview ${item.name}`}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          {busy ? 'Opening…' : 'Preview'}
        </button>
        <RowMenu label={`More actions for ${item.name}`} items={menuFor(props)} disabled={busy} ownerId={item.id} />
      </div>
    </li>
  );
}
