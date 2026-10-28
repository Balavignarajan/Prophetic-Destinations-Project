'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { rowShift, usePointerSort } from '../lib/pointer-sort';
import { useDraftOrder } from '../lib/use-draft-order';
import OrderBar from './OrderBar';

interface Props<T extends { id: string }> {
  /** The items in the order the backend last returned them. */
  items: T[];
  canWrite: boolean;
  /** Accessible name of the list, e.g. "Modules, in order". */
  listLabel: string;
  /** What one item is called in screen-reader announcements. */
  itemLabel: (item: T) => string;
  /** The row's own content (title, badges, actions). The drag handle, number and move buttons are added around it. */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Saves the complete order. `previousIds` is the order this screen last saw, so the server can refuse (409) if it changed meanwhile. */
  save: (ids: string[], previousIds: string[]) => Promise<T[]>;
  /** Told the items the backend returned after a successful save. */
  onSaved: (items: T[]) => void;
  /** Reloads the parent page's data from the backend (after a stale-order conflict). */
  onReload: () => void;
  /** Shown after a successful save: what the saved order does and does not change yet. */
  savedNote: string;
  /** Opens the explicit publishing step, if the user may publish. Never called automatically. */
  onPublish?: () => void;
  publishLabel?: string;
  /** Which list this is ("modules"), for `guardUnsavedWork` on the page. */
  workScope?: string;
}

/**
 * A list whose order is arranged and then saved with ONE explicit action: Save Order. Drag a row by its handle (pointer events: mouse, finger or pen), press the up or down arrow key on the
 * handle, or use the small up and down buttons: all of them change only a DRAFT (lib/use-draft-order.ts), nothing is sent. While the draft differs from the saved order a bar offers Reset
 * (no request) and Save Order, which sends the complete list plus the order last seen; a refusal (409) keeps the arrangement and offers "Reload latest order" instead of overwriting anyone.
 * Leaving the page, and the page's own guarded actions, ask first (components/UnsavedGuardHost.tsx). Saving changes order only; it never publishes anything.
 */
export default function ReorderableList<T extends { id: string }>({ items, canWrite, listLabel, itemLabel, renderItem, save, onSaved, onReload, savedNote, onPublish, publishLabel = 'Publish changes…', workScope }: Props<T>) {
  const order = useDraftOrder<T>({ label: listLabel, scope: workScope, items, canWrite, itemLabel, save, onSaved, onReload });
  const ids = useMemo(() => order.ordered.map((item) => item.id), [order.ordered]);
  const { listRef, registerRow, handle, drag } = usePointerSort({ ids, disabled: !canWrite || order.saving, onMove: order.move });
  const total = order.ordered.length;

  // After a move by keyboard or button the row has been re-attached in its new place: put the keyboard back on the control that was used (or its neighbour when it is now at an end).
  const focusAfter = useRef<{ id: string; kind: 'handle' | 'up' | 'down' } | null>(null);
  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    const find = (kind: string) => document.querySelector<HTMLButtonElement>(`[data-reorder-${kind}="${target.id}"]`);
    const wanted = find(target.kind);
    (wanted && !wanted.disabled ? wanted : (find(target.kind === 'up' ? 'down' : 'up') ?? find('handle')))?.focus();
  }, [order.ordered]);

  const moveBy = (index: number, delta: -1 | 1, kind: 'handle' | 'up' | 'down') => {
    const item = order.ordered[index];
    if (item) focusAfter.current = { id: item.id, kind };
    order.move(index, index + delta);
  };

  return (
    <div className="space-y-3">
      <p role="status" aria-live="polite" className="sr-only">{order.announcement}</p>

      {order.saved && !order.dirty && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <span>{savedNote}</span>
          <span className="flex gap-2">
            {onPublish && <button type="button" onClick={onPublish} className="rounded-md border border-emerald-300 px-3 py-1 text-xs font-semibold hover:bg-emerald-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">{publishLabel}</button>}
            <button type="button" onClick={order.dismiss} aria-label="Dismiss message" className="rounded px-1.5 text-lg leading-none hover:bg-black/5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">&times;</button>
          </span>
        </div>
      )}

      {canWrite && total > 1 && <p className="text-xs text-slate-600">Drag entries to arrange them. Click Save Order to apply your changes.</p>}

      <ul
        ref={(element) => {
          listRef.current = element;
        }}
        aria-label={listLabel}
        aria-busy={order.saving}
        className={`relative rounded-xl border border-slate-200 bg-white shadow-xs ${drag ? 'cursor-grabbing select-none' : ''}`}
      >
        {order.ordered.map((item, index) => {
          const dragging = drag?.id === item.id;
          const shift = rowShift(drag, index);
          return (
            <li
              key={item.id}
              ref={(element) => registerRow(item.id, element)}
              style={shift ? { transform: `translateY(${shift}px)` } : undefined}
              className={`relative flex items-start gap-3 px-4 py-4 ${index === 0 ? '' : 'border-t border-slate-100'} ${drag && !dragging ? 'transition-transform duration-150 ease-out motion-reduce:transition-none' : ''} ${
                dragging ? 'z-30 rounded-xl border-transparent bg-white shadow-xl ring-1 ring-amber-300' : 'hover:bg-slate-50/60'
              }`}
            >
              <div className="flex shrink-0 flex-col items-center gap-1">
                <span className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-slate-100 font-mono text-xs font-bold text-slate-700">
                  <span className="sr-only">Position </span>
                  {index + 1}
                </span>
                {canWrite && (
                  <>
                    <button
                      type="button"
                      data-sort-id={item.id}
                      data-reorder-handle={item.id}
                      disabled={order.saving}
                      {...handle}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowUp') {
                          event.preventDefault();
                          moveBy(index, -1, 'handle');
                        } else if (event.key === 'ArrowDown') {
                          event.preventDefault();
                          moveBy(index, 1, 'handle');
                        }
                      }}
                      className={`touch-none select-none rounded-xs px-1 py-1 text-slate-500 hover:text-slate-800 disabled:opacity-30 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                      aria-label={`Drag handle for ${itemLabel(item)}, position ${index + 1} of ${total}. Drag it, or press the up or down arrow key to move it. The new order is not saved until you choose Save Order.`}
                      title="Drag to reorder"
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
                    <span className="flex">
                      <button type="button" data-reorder-up={item.id} aria-label={`Move ${itemLabel(item)} up`} disabled={order.saving || index === 0} onClick={() => moveBy(index, -1, 'up')} className="rounded p-0.5 text-slate-500 hover:text-slate-800 disabled:opacity-30 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                        ↑
                      </button>
                      <button type="button" data-reorder-down={item.id} aria-label={`Move ${itemLabel(item)} down`} disabled={order.saving || index === total - 1} onClick={() => moveBy(index, 1, 'down')} className="rounded p-0.5 text-slate-500 hover:text-slate-800 disabled:opacity-30 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                        ↓
                      </button>
                    </span>
                  </>
                )}
              </div>
              <div className="min-w-0 flex-1">{renderItem(item, index)}</div>
            </li>
          );
        })}
        {/* Where the dragged row will land. */}
        {drag && <li role="presentation" aria-hidden="true" style={{ top: drag.gapTop, height: drag.height }} className="pointer-events-none absolute inset-x-1 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/70" />}
      </ul>

      {canWrite && <OrderBar order={order} />}
    </div>
  );
}
