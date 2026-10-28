'use client';

import React, { memo, useCallback } from 'react';
import type { SortHandle } from '../lib/pointer-sort';
import { HOME_LEVELS, type Visibility } from '../lib/home-visibility';
import type { HomeEntry } from '../lib/types';
import { CoursesBlock, EntryStateBadge, HomeEntryThumb, VisibilityBadge } from './HomeEntryParts';
import { type MenuItem, RowMenu } from './RowMenu';

interface Props {
  entry: HomeEntry;
  /** 0-based place in the list. */
  index: number;
  total: number;
  canWrite: boolean;
  /** An enable/disable or a delete is being saved: nothing in the list can be changed. */
  busy: boolean;
  /** The new order is being saved: until the answer comes, the arrangement cannot be changed and switching, editing and deleting wait. */
  ordering: boolean;
  /** This row's own switch is being saved. */
  pending: boolean;
  /** This row is the one being dragged. */
  dragging: boolean;
  /** Some row is being dragged: the others slide, so they animate. */
  sorting: boolean;
  /** How far this row is moved to make room for the dragged one. */
  shift: number;
  visibility: Visibility;
  fallbackCoverId: string | null;
  handle: SortHandle;
  registerRow: (id: string, element: HTMLElement | null) => void;
  onEdit: (entry: HomeEntry) => void;
  onToggle: (entry: HomeEntry) => void;
  onDelete: (entry: HomeEntry) => void;
  onMove: (index: number, direction: 'up' | 'down', via: 'handle' | 'menu') => void;
}

/**
 * One Home Entry in the list, laid out for scanning: on the left the drag handle, its place in the order, the picture and the title with its on/off switch; in the middle its courses (with
 * their publishing status); on the right what learners will see, Edit and a "More actions" menu (Enable/Disable, Move up, Move down, Delete). It wraps instead of clipping on narrow screens.
 *
 * ONLY the handle starts a drag (pointer events, see lib/pointer-sort.ts): the title, the badges, the course links, Edit and the menu are ordinary controls. The handle is also a keyboard control
 * (the up and down arrow keys move the entry), and the menu offers Move up and Move down, so ordering never needs a mouse. The row is memoised and gets only plain values and stable
 * callbacks, so a drag re-renders just the rows that slide.
 */
function HomeEntryRowImpl({ entry, index, total, canWrite, busy, ordering, pending, dragging, sorting, shift, visibility, fallbackCoverId, handle, registerRow, onEdit, onToggle, onDelete, onMove }: Props) {
  const setRef = useCallback((element: HTMLLIElement | null) => registerRow(entry.id, element), [registerRow, entry.id]);
  const changesLocked = busy || ordering;

  const menu: MenuItem[] = [
    {
      key: 'toggle',
      label: entry.isEnabled ? 'Disable' : 'Enable',
      hint: entry.isEnabled ? 'Learners stop seeing it. Nothing is deleted.' : 'Learners can see it again once it has an eligible course.',
      onSelect: () => onToggle(entry),
      disabled: changesLocked,
    },
    { key: 'up', label: 'Move up', hint: 'Not saved until you choose Save Order.', onSelect: () => onMove(index, 'up', 'menu'), disabled: changesLocked || index === 0 },
    { key: 'down', label: 'Move down', hint: 'Not saved until you choose Save Order.', onSelect: () => onMove(index, 'down', 'menu'), disabled: changesLocked || index === total - 1 },
    { key: 'delete', label: 'Delete…', hint: 'Removes the entry only. You are asked first.', onSelect: () => onDelete(entry), disabled: changesLocked, danger: true, dividerBefore: true },
  ];

  return (
    <li
      ref={setRef}
      data-entry-id={entry.id}
      style={shift ? { transform: `translateY(${shift}px)` } : undefined}
      className={`relative px-3 py-3 sm:px-4 ${index === 0 ? '' : 'border-t border-slate-100'} ${
        // The rows that make room slide; the dragged one follows the pointer exactly, so it never has the transition.
        sorting && !dragging ? 'transition-transform duration-150 ease-out motion-reduce:transition-none' : ''
      } ${
        dragging
          ? 'z-30 rounded-xl border-transparent bg-white shadow-xl ring-1 ring-amber-300'
          : `${index === 0 ? 'rounded-t-xl' : ''} ${index === total - 1 ? 'rounded-b-xl' : ''} ${entry.isEnabled ? 'bg-white' : 'bg-slate-50'}`
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-72 items-center gap-3">
          <div className="flex shrink-0 items-center gap-1">
            {canWrite ? (
              <button
                type="button"
                data-sort-id={entry.id}
                disabled={changesLocked}
                {...handle}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    onMove(index, 'up', 'handle');
                  } else if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    onMove(index, 'down', 'handle');
                  }
                }}
                aria-label={`Reorder ${entry.title}. Position ${index + 1} of ${total}. Drag it with the mouse or a finger, or press the up or down arrow key to move it. The new order is not saved until you choose Save Order.`}
                title="Drag to reorder"
                className={`inline-flex h-8 w-7 touch-none select-none items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${
                  dragging ? 'cursor-grabbing bg-slate-100 text-slate-800' : 'cursor-grab'
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <circle cx="7" cy="5" r="1.4" />
                  <circle cx="13" cy="5" r="1.4" />
                  <circle cx="7" cy="10" r="1.4" />
                  <circle cx="13" cy="10" r="1.4" />
                  <circle cx="7" cy="15" r="1.4" />
                  <circle cx="13" cy="15" r="1.4" />
                </svg>
              </button>
            ) : null}
            <span className="w-5 text-center text-xs font-semibold tabular-nums text-slate-600">
              <span className="sr-only">Position </span>
              {index + 1}
            </span>
          </div>
          <HomeEntryThumb mediaId={entry.imageMediaId} fallbackMediaId={fallbackCoverId} />
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold text-slate-900 wrap-break-word">{entry.title}</span>
              <EntryStateBadge enabled={entry.isEnabled} />
              {pending && (
                <span role="status" className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 motion-reduce:animate-none" aria-hidden="true" />
                  Updating…
                </span>
              )}
            </div>
            {entry.description && <p className="line-clamp-2 text-xs text-slate-600 wrap-break-word">{entry.description}</p>}
          </div>
        </div>

        <div className="min-w-0 flex-1 basis-56">
          <CoursesBlock entry={entry} />
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
          <VisibilityBadge visibility={visibility} selectedLevels={entry.visibleLevels ?? HOME_LEVELS} />
          {canWrite && (
            <>
              <button
                type="button"
                disabled={changesLocked}
                onClick={() => onEdit(entry)}
                aria-label={`Edit ${entry.title}`}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                Edit
              </button>
              <RowMenu label={`More actions for ${entry.title}`} items={menu} disabled={busy} ownerId={entry.id} />
            </>
          )}
        </div>
      </div>
    </li>
  );
}

export default memo(HomeEntryRowImpl);
