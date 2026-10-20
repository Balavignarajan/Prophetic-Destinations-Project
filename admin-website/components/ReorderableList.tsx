'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { friendlyError } from '../lib/ui-messages';

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
}

/**
 * Drag-and-drop ordering of the items of one parent, saved with ONE explicit action. It keeps a local unsaved order, offers Save order / Cancel, sends the
 * complete list plus the order last seen, and on a stale-order conflict keeps what the user arranged and offers a reload instead of overwriting anyone.
 * Same behaviour as the course's direct-lesson list. Keyboard: arrow keys on the handle (announced); touch screens use the Up/Down buttons, because native
 * HTML5 drag is unreliable there. Saving changes order only; it never publishes anything.
 */
export default function ReorderableList<T extends { id: string }>({ items, canWrite, listLabel, itemLabel, renderItem, save, onSaved, onReload, savedNote, onPublish, publishLabel = 'Publish changes…' }: Props<T>) {
  const serverKey = items.map((i) => i.id).join(',');
  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [saved, setSaved] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const baseline = useRef(serverKey);

  // The server's list changed (reload, an item added or deleted): show it, and say so if unsaved changes had to be dropped.
  useEffect(() => {
    if (baseline.current === serverKey) return;
    const hadChanges = order.join(',') !== baseline.current;
    baseline.current = serverKey;
    setOrder(items.map((i) => i.id));
    if (hadChanges) setError('The list changed on the server, so your unsaved order was reset. Check the order and arrange it again.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const ordered = order.map((id) => byId.get(id)).filter((i): i is T => Boolean(i));
  const dirty = order.join(',') !== serverKey;

  const move = (from: number, to: number) => {
    if (saving || to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [id] = next.splice(from, 1);
    next.splice(to, 0, id);
    setOrder(next);
    setSaved(false);
    setError(null);
    setStale(false);
    const item = byId.get(id);
    setAnnounce(`${item ? itemLabel(item) : 'Item'} moved to position ${to + 1} of ${next.length}. Not saved yet.`);
  };

  const cancel = () => {
    if (saving) return;
    setOrder(items.map((i) => i.id));
    setError(null);
    setStale(false);
    setAnnounce('Order changes discarded.');
  };

  const doSave = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    setStale(false);
    try {
      const result = await save(order, items.map((i) => i.id));
      baseline.current = result.map((i) => i.id).join(',');
      setOrder(result.map((i) => i.id));
      onSaved(result);
      setSaved(true);
      setAnnounce('Order saved.');
    } catch (err: unknown) {
      // The arrangement stays on screen so nothing is lost; the admin can retry, or reload to see the current order.
      if ((err as { status?: number }).status === 409) {
        setStale(true);
        setError('The order was changed by someone else (or the list changed) after this page was loaded, so nothing was saved. Reload to see the current order, then arrange it again.');
      } else {
        setError(friendlyError(err, 'The order could not be saved. Your arrangement is still here; try again.'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>

      {(error || saved) && (
        <div role={error ? 'alert' : 'status'} className={`p-3 rounded-lg border text-sm flex flex-wrap items-center justify-between gap-2 ${error ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
          <span>{error ?? savedNote}</span>
          <span className="flex gap-2">
            {stale && <button type="button" onClick={onReload} className="px-3 py-1 text-xs font-semibold rounded-md border border-rose-300 hover:bg-rose-100">Reload</button>}
            {!error && onPublish && <button type="button" onClick={onPublish} className="px-3 py-1 text-xs font-semibold rounded-md border border-emerald-300 hover:bg-emerald-100">{publishLabel}</button>}
          </span>
        </div>
      )}

      <ul className="bg-white border border-slate-200 rounded-xl shadow-xs divide-y divide-slate-100 overflow-hidden" aria-label={listLabel} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverIndex(null); }}>
        {ordered.map((item, index) => (
          <li
            key={item.id}
            onDragOver={(e) => {
              if (!dragId || saving) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setOverIndex(index);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = order.indexOf(dragId ?? '');
              setDragId(null);
              setOverIndex(null);
              if (from >= 0) move(from, index);
            }}
            className={`flex items-start gap-3 px-4 py-4 hover:bg-slate-50/60 transition-colors ${dragId === item.id ? 'opacity-40' : ''} ${overIndex === index && dragId && dragId !== item.id ? 'border-t-2 border-amber-500' : 'border-t-2 border-transparent'}`}
          >
            <div className="flex flex-col items-center gap-1 shrink-0">
              <span className="w-7 h-7 rounded-md bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center border border-slate-200 font-mono">{index + 1}</span>
              {canWrite && (
                <>
                  <button
                    type="button"
                    draggable={!saving}
                    disabled={saving}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', item.id);
                      setDragId(item.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverIndex(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        move(index, index - 1);
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        move(index, index + 1);
                      }
                    }}
                    className="cursor-grab active:cursor-grabbing touch-none px-1 py-1 text-slate-500 hover:text-slate-800 disabled:opacity-30 rounded-xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
                    aria-label={`Drag handle for ${itemLabel(item)}, position ${index + 1} of ${ordered.length}. Drag it, or press the up or down arrow key to move it.`}
                    title="Drag to reorder"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <circle cx="7" cy="5" r="1.4" /><circle cx="13" cy="5" r="1.4" /><circle cx="7" cy="10" r="1.4" /><circle cx="13" cy="10" r="1.4" /><circle cx="7" cy="15" r="1.4" /><circle cx="13" cy="15" r="1.4" />
                    </svg>
                  </button>
                  <span className="flex">
                    <button type="button" aria-label={`Move ${itemLabel(item)} up`} disabled={saving || index === 0} onClick={() => move(index, index - 1)} className="p-0.5 text-slate-500 hover:text-slate-800 disabled:opacity-30">↑</button>
                    <button type="button" aria-label={`Move ${itemLabel(item)} down`} disabled={saving || index === ordered.length - 1} onClick={() => move(index, index + 1)} className="p-0.5 text-slate-500 hover:text-slate-800 disabled:opacity-30">↓</button>
                  </span>
                </>
              )}
            </div>
            <div className="flex-1 min-w-0">{renderItem(item, index)}</div>
          </li>
        ))}
      </ul>

      {canWrite && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {dirty && <span className="text-xs text-amber-800">Unsaved order changes</span>}
          <button type="button" onClick={cancel} disabled={!dirty || saving} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => void doSave()} disabled={!dirty || saving} aria-busy={saving} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50">
            {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
            {saving ? 'Saving…' : 'Save order'}
          </button>
        </div>
      )}
    </div>
  );
}
