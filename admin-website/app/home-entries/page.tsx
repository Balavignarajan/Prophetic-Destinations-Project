'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { courseCountText, homeEntryErrorMessage, isOrderConflict, moveItem, sameOrder } from '../../lib/home-entries';
import { type VisibilityData, entryVisibility, fallbackCoverId, fetchVisibility } from '../../lib/home-visibility';
import { rowShift, usePointerSort } from '../../lib/pointer-sort';
import type { HomeEntry } from '../../lib/types';
import HomeEntryDialog from '../../components/HomeEntryDialog';
import HomeEntryRow from '../../components/HomeEntryRow';
import HomePreviewDialog from '../../components/HomePreviewDialog';
import { ConfirmDialog, EmptyState, LoadingSpinner } from '../../components/ui';

/** How long "Undo" is offered after a new order has been saved. */
const UNDO_MS = 10_000;
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const CONFLICT_TEXT =
  'The Home Entry order was changed by someone else (or an entry was added or removed) while you were working, so your change was not saved and nobody else’s was overwritten. The list now shows the latest order. Check it and, if you still want the change, make it again.';

/** The one message area of the page: what is happening, what happened, or what went wrong. */
interface Notice {
  tone: 'saving' | 'success' | 'error';
  text: string;
  /** Offers "Try again" for a failure that trying again can fix. */
  retry?: () => void;
  /** Offers "Undo" for as long as the page still holds an order to go back to. */
  undoable?: boolean;
}

/** The entries arranged in the order of `ids` (unchanged when the two do not hold the same entries). */
function orderLike(items: HomeEntry[], ids: readonly string[]): HomeEntry[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const arranged = ids.map((id) => byId.get(id)).filter((item): item is HomeEntry => Boolean(item));
  return arranged.length === items.length ? arranged : items;
}

/** The entries as they are on screen, with the newest data of each from `fresh`. */
function refreshFrom(items: HomeEntry[], fresh: HomeEntry[]): HomeEntry[] {
  const byId = new Map(fresh.map((item) => [item.id, item]));
  return items.map((item) => byId.get(item.id) ?? item);
}

const NOTICE_TONES: Record<Notice['tone'], string> = {
  saving: 'border-slate-200 bg-white text-slate-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
};

/**
 * Home Entries: the topics on the learner Home screen (Daniel, Revelation, Bible History...). Administrators add, edit, reorder, enable, disable and delete them here with no change to the
 * mobile app. An entry holds no course of its own: courses are put into it from the course form, so an entry can exist with none. Deleting an entry takes its courses out of it and deletes
 * nothing else. Learners see an entry only while it is enabled AND at least one course in it is published with lessons at their level, which the server works out when the app asks; this page
 * asks the same server (lib/home-visibility.ts) for the badges and for "Preview Home", and repeats none of those rules.
 *
 * ORDERING. Drag a row by its handle (pointer events: mouse, finger or pen), press the up or down arrow key on the handle, or use Move up / Move down in the row's menu. Each change shows at
 * once and is saved at once with the existing order route (PUT /admin/home-entries/order, which sends the order wanted AND the order this page last saw, so the server refuses with 409 if the
 * list changed meanwhile). ONE request is in flight at a time: moves made while it runs are folded into the next request (built on what the server confirmed), so requests never overlap and an
 * older answer never replaces a newer arrangement. A failure puts the last confirmed order back and says so (with Try again when that can help); a conflict reloads the latest list and never
 * overwrites anyone. After a save, "Undo" (for ten seconds) sends the previous order through the same route, with the same conflict check.
 */
export default function HomeEntriesPage() {
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';

  const [entries, setEntries] = useState<HomeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [vis, setVis] = useState<VisibilityData>({ status: 'loading' });
  const [infoOpen, setInfoOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // An order is being saved; a switch is being saved (the row's id); a delete is being saved.
  const [ordering, setOrdering] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [undo, setUndo] = useState<{ from: string[] } | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<HomeEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HomeEntry | null>(null);

  const infoId = useId();
  const hasLoadedRef = useRef(false);
  const loadSeq = useRef(0);
  const visSeq = useRef(0);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  // The order the server last confirmed, the order wanted next (null: none), whether a save is running, and whether an enable/disable or a delete is running.
  const confirmedRef = useRef<string[]>([]);
  const desiredRef = useRef<string[] | null>(null);
  const orderingRef = useRef(false);
  const busyRef = useRef(false);
  const summaryRef = useRef('');
  const isUndoRef = useRef(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestOrderRef = useRef<(next: string[], summary: string, spoken: string, isUndo?: boolean) => void>(() => undefined);
  // After a move the row has been re-attached in its new place: put the keyboard back on the control that was used.
  const pendingFocus = useRef<{ id: string; kind: 'handle' | 'more' } | null>(null);

  const clearUndo = useCallback(() => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = null;
    setUndo(null);
  }, []);
  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(!hasLoadedRef.current);
    setError(null);
    try {
      const list = await api.request<{ items: HomeEntry[] }>('/admin/home-entries');
      if (seq !== loadSeq.current) return; // a newer load is on its way
      confirmedRef.current = list.items.map((item) => item.id);
      desiredRef.current = null;
      setEntries(list.items);
    } catch (err: unknown) {
      if (seq !== loadSeq.current) return;
      const status = (err as { status?: number } | null)?.status;
      setError(
        `${homeEntryErrorMessage(err, 'Could not load the Home Entries.')}${status !== undefined && status >= 500 ? ' If Home Entries have never been opened on this system, their database update may not have been applied yet.' : ''}`,
      );
    } finally {
      if (seq === loadSeq.current) {
        hasLoadedRef.current = true;
        setLoading(false);
      }
    }
  }, []);

  /** Asks the server what learners see at each level (for the badges). Only the newest answer is used. */
  const loadVisibility = useCallback(async () => {
    const seq = ++visSeq.current;
    setVis({ status: 'loading' });
    try {
      const byLevel = await fetchVisibility();
      if (seq === visSeq.current) setVis({ status: 'ready', byLevel });
    } catch {
      if (seq === visSeq.current) setVis({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
    void loadVisibility();
  }, [load, loadVisibility]);

  // ------------------------------------------------------------------------------------------------------------------------------ ordering

  /** Sends the order wanted until the server has confirmed the latest one asked for. Called whenever something new is wanted; does nothing while a save is already running (it picks the new wish up). */
  const flushOrder = useCallback(async () => {
    if (orderingRef.current) return;
    orderingRef.current = true;
    setOrdering(true);
    setNotice({ tone: 'saving', text: 'Saving order…' });
    const startedFrom = confirmedRef.current;
    let succeeded = true;
    try {
      for (;;) {
        const target = desiredRef.current;
        if (!target || sameOrder(target, confirmedRef.current)) {
          desiredRef.current = null;
          break;
        }
        const previous = confirmedRef.current;
        let saved: { items: HomeEntry[] };
        try {
          saved = await api.request<{ items: HomeEntry[] }>('/admin/home-entries/order', {
            method: 'PUT',
            headers: JSON_HEADERS,
            body: JSON.stringify({ entryIds: target, previousEntryIds: previous }),
          });
        } catch (err: unknown) {
          succeeded = false;
          desiredRef.current = null;
          if (isOrderConflict(err)) {
            // Not what this page thought it was: show the latest and let the administrator decide. Nothing is retried and nothing of anyone else's is overwritten.
            setNotice({ tone: 'error', text: CONFLICT_TEXT });
            await load();
          } else {
            // Back to the last order the server confirmed; the arrangement can be tried again.
            setEntries((current) => orderLike(current, confirmedRef.current));
            setNotice({
              tone: 'error',
              text: `${homeEntryErrorMessage(err, 'Could not save the new order.')} The list shows the last saved order.`,
              retry: () => requestOrderRef.current(target, summaryRef.current, 'Saving the order again.'),
            });
          }
          break;
        }
        confirmedRef.current = saved.items.map((item) => item.id);
        if (desiredRef.current === target) {
          desiredRef.current = null;
          setEntries(saved.items);
        } else {
          // Something newer was asked for while this was saving: keep showing it, and take only the fresh data of each entry.
          setEntries((current) => refreshFrom(current, saved.items));
        }
      }
      if (succeeded) {
        const now = confirmedRef.current;
        if (isUndoRef.current) {
          setNotice({ tone: 'success', text: 'Previous order restored. Learners see it on their next refresh of Home.' });
        } else if (sameOrder(startedFrom, now)) {
          setNotice({ tone: 'success', text: 'Order saved.' });
        } else {
          setNotice({ tone: 'success', text: `Order saved. ${summaryRef.current} Learners see the new order on their next refresh of Home.`, undoable: true });
          setUndo({ from: startedFrom });
          if (undoTimer.current) clearTimeout(undoTimer.current);
          undoTimer.current = setTimeout(() => {
            undoTimer.current = null;
            setUndo(null);
          }, UNDO_MS);
        }
      }
    } finally {
      orderingRef.current = false;
      setOrdering(false);
    }
  }, [load]);

  /** Wants this order: shows it at once and saves it. Ignored while an enable/disable or a delete is running, and when it is the order already shown. */
  const requestOrder = useCallback(
    (next: string[], summary: string, spoken: string, isUndo = false) => {
      if (busyRef.current) return;
      if (sameOrder(next, entriesRef.current.map((entry) => entry.id))) return;
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = null;
      setUndo(null);
      desiredRef.current = next;
      summaryRef.current = summary;
      isUndoRef.current = isUndo;
      setEntries((current) => orderLike(current, next));
      setAnnouncement(spoken);
      void flushOrder();
    },
    [flushOrder],
  );
  requestOrderRef.current = requestOrder;

  const reorderTo = useCallback(
    (from: number, to: number, via: 'drag' | 'handle' | 'menu') => {
      const current = entriesRef.current;
      const entry = current[from];
      if (!entry || to < 0 || to >= current.length || from === to) return;
      pendingFocus.current = { id: entry.id, kind: via === 'menu' ? 'more' : 'handle' };
      requestOrder(
        moveItem(
          current.map((item) => item.id),
          from,
          to,
        ),
        `“${entry.title}” is now at position ${to + 1}.`,
        `${entry.title} moved to position ${to + 1} of ${current.length}. Saving.`,
      );
    },
    [requestOrder],
  );
  const onMove = useCallback((index: number, direction: 'up' | 'down', via: 'handle' | 'menu') => reorderTo(index, direction === 'up' ? index - 1 : index + 1, via), [reorderTo]);
  const onSortMove = useCallback((from: number, to: number) => reorderTo(from, to, 'drag'), [reorderTo]);

  const undoOrder = () => {
    if (!undo) return;
    const ids = entries.map((entry) => entry.id);
    const from = undo.from;
    clearUndo();
    if (from.length !== ids.length || !from.every((id) => ids.includes(id))) return; // the entries changed since: there is nothing sound to go back to
    requestOrder(from, 'Previous order restored.', 'Restoring the previous order.', true);
  };

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const selector = target.kind === 'handle' ? `[data-sort-id="${target.id}"]` : `[data-menu-owner="${target.id}"]`;
    document.querySelector<HTMLElement>(selector)?.focus();
  }, [entries]);

  const ids = useMemo(() => entries.map((entry) => entry.id), [entries]);
  const { listRef, registerRow, handle, drag } = usePointerSort({ ids, disabled: switchingId !== null || deleting, onMove: onSortMove });

  // ------------------------------------------------------------------------------------------------------------------------------ the other actions

  const openAdd = () => {
    if (orderingRef.current || busyRef.current) return;
    setNotice(null);
    clearUndo();
    setEditTarget(null);
    setDialogOpen(true);
  };

  const openEdit = useCallback(
    (entry: HomeEntry) => {
      if (orderingRef.current || busyRef.current) return;
      setNotice(null);
      clearUndo();
      setEditTarget(entry);
      setDialogOpen(true);
    },
    [clearUndo],
  );

  const handleSaved = (saved: HomeEntry, created: boolean) => {
    setDialogOpen(false);
    clearUndo();
    setNotice({
      tone: 'success',
      text: created
        ? `Added the Home Entry "${saved.title}". Assign courses to it by choosing it in the course form; learners see it once one of its courses is published at their level.`
        : `Saved "${saved.title}".`,
    });
    void load();
    void loadVisibility();
  };

  const toggle = useCallback(
    async (entry: HomeEntry) => {
      if (busyRef.current || orderingRef.current) return;
      busyRef.current = true;
      setSwitchingId(entry.id);
      setNotice(null);
      clearUndo();
      try {
        const saved = await api.request<HomeEntry>(`/admin/home-entries/${entry.id}`, {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify({ isEnabled: !entry.isEnabled, version: entry.version }),
        });
        setEntries((current) => current.map((item) => (item.id === saved.id ? saved : item)));
        setNotice({
          tone: 'success',
          text: saved.isEnabled
            ? `"${saved.title}" is enabled again. Learners see it once it has a published course with lessons at their level; the badge on its row shows where.`
            : `"${saved.title}" is disabled: learners no longer see it. Nothing is deleted and its courses stay assigned.`,
        });
        void loadVisibility();
      } catch (err: unknown) {
        // The row was not changed on screen, so there is nothing to put back; the latest list is fetched in case someone else changed it.
        setNotice({ tone: 'error', text: `${homeEntryErrorMessage(err, `Could not ${entry.isEnabled ? 'disable' : 'enable'} this Home Entry.`)} It was left as it was.` });
        await load();
      } finally {
        busyRef.current = false;
        setSwitchingId(null);
      }
    },
    [clearUndo, load, loadVisibility],
  );

  const askDelete = useCallback((entry: HomeEntry) => {
    if (busyRef.current || orderingRef.current) return;
    setDeleteTarget(entry);
  }, []);

  const confirmDelete = async () => {
    if (!deleteTarget || busyRef.current || orderingRef.current) return;
    busyRef.current = true;
    setDeleting(true);
    setNotice(null);
    clearUndo();
    try {
      await api.request(`/admin/home-entries/${deleteTarget.id}`, { method: 'DELETE' });
      setNotice({
        tone: 'success',
        text: `Deleted the Home Entry "${deleteTarget.title}".${deleteTarget.courseCount > 0 ? ` Its ${courseCountText(deleteTarget.courseCount)} ${deleteTarget.courseCount === 1 ? 'is' : 'are'} no longer assigned to it, and none was deleted.` : ''} The other entries keep their order.`,
      });
      setDeleteTarget(null);
      void load();
      void loadVisibility();
    } catch (err: unknown) {
      setNotice({ tone: 'error', text: homeEntryErrorMessage(err, 'Could not delete this Home Entry.') });
      setDeleteTarget(null);
      void load();
    } finally {
      busyRef.current = false;
      setDeleting(false);
    }
  };

  // ------------------------------------------------------------------------------------------------------------------------------ what each row shows

  const rowData = useMemo(
    () => new Map(entries.map((entry) => [entry.id, { visibility: entryVisibility(entry, vis), cover: fallbackCoverId(entry.id, vis) }])),
    [entries, vis],
  );

  const busy = switchingId !== null || deleting;
  const listDisabled = loading || Boolean(error);

  return (
    <div className="space-y-5">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {notice && (
        <div role={notice.tone === 'error' ? 'alert' : 'status'} className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border p-3 text-sm ${NOTICE_TONES[notice.tone]}`}>
          <span className="flex min-w-0 items-center gap-2">
            {notice.tone === 'saving' && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 motion-reduce:animate-none" aria-hidden="true" />}
            <span>{notice.text}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {notice.undoable && undo && (
              <button type="button" onClick={undoOrder} className="rounded-md border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                Undo
              </button>
            )}
            {notice.retry && (
              <button type="button" onClick={notice.retry} className="rounded-md border border-rose-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-rose-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                Try again
              </button>
            )}
            {notice.tone !== 'saving' && (
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" className="rounded px-1.5 text-lg leading-none hover:bg-black/5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                &times;
              </button>
            )}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-slate-900">Home Entries</h1>
          <p className="mt-0.5 text-sm text-slate-600">Organize the topics learners see on their Home screen.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            disabled={listDisabled}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
              <path d="M11 18.5h2" />
            </svg>
            Preview Home
          </button>
          {canWrite && (
            <button
              type="button"
              onClick={openAdd}
              disabled={listDisabled || ordering || busy}
              className="flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-slate-800 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Home Entry
            </button>
          )}
        </div>
      </div>

      <section aria-label="How Home Entries reach learners" className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-sm text-amber-950">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p>Home Entries appear on the learner&rsquo;s Home screen when enabled and linked to eligible published courses.</p>
          <button
            type="button"
            aria-expanded={infoOpen}
            aria-controls={infoId}
            onClick={() => setInfoOpen((open) => !open)}
            className="inline-flex items-center gap-1 rounded text-xs font-semibold text-amber-900 underline-offset-2 hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            How visibility works
            <svg className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${infoOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9.5l6 6 6-6" />
            </svg>
          </button>
        </div>
        {infoOpen && (
          <ul id={infoId} className="mt-2 list-disc space-y-1 pl-5 text-[13px]">
            <li>The entry must be <strong>enabled</strong>.</li>
            <li>At least one course assigned to it must be <strong>published</strong> and eligible.</li>
            <li>That course needs <strong>published lessons at the learner&rsquo;s selected level</strong>, so an entry can be visible at some levels and not others. The badge on each row shows which.</li>
            <li>Draft courses (and any course that is not published) are never visible. Tapping an entry lists just its published courses.</li>
            <li>An entry with no eligible course is hidden by itself; &ldquo;No courses assigned&rdquo; is a note for you only.</li>
            <li>Order changes, edits and switching an entry on or off reach learners on their <strong>next refresh of Home</strong>, with no publishing step.</li>
          </ul>
        )}
      </section>

      {vis.status === 'error' && !listDisabled && (
        <p role="status" className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
          What learners see could not be checked just now, so the visibility badges are not shown. The entries themselves are fine.
          <button type="button" onClick={() => void loadVisibility()} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-semibold hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            Check again
          </button>
        </p>
      )}

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="rounded-md border border-rose-300 px-3 py-1 text-xs font-semibold hover:bg-rose-100">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <LoadingSpinner text="Loading Home Entries..." />
      ) : error ? null : entries.length === 0 ? (
        <EmptyState
          title="No Home Entries yet"
          description="Without any, the learner Home screen shows no topics. Add an entry, then choose it in the course form for each course that belongs to it."
          action={
            canWrite ? (
              <button type="button" onClick={openAdd} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500">
                Add the first Home Entry
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {canWrite && entries.length > 1 && (
            <p className="text-xs text-slate-600">
              Drag a row by its handle to reorder; the new order is saved at once. With the keyboard, focus the handle and press the up or down arrow key, or use Move up / Move down in the row&rsquo;s menu.
            </p>
          )}
          <ol
            ref={(element) => {
              listRef.current = element;
            }}
            aria-label="Home Entries in the order learners see them"
            aria-busy={ordering}
            className={`relative rounded-xl border border-slate-200 bg-white shadow-xs ${drag ? 'cursor-grabbing select-none' : ''}`}
          >
            {entries.map((entry, index) => {
              const data = rowData.get(entry.id);
              return (
                <HomeEntryRow
                  key={entry.id}
                  entry={entry}
                  index={index}
                  total={entries.length}
                  canWrite={canWrite}
                  busy={busy}
                  ordering={ordering}
                  pending={switchingId === entry.id}
                  dragging={drag?.id === entry.id}
                  sorting={drag !== null}
                  shift={rowShift(drag, index)}
                  visibility={data?.visibility ?? { kind: 'checking' }}
                  fallbackCoverId={data?.cover ?? null}
                  handle={handle}
                  registerRow={registerRow}
                  onEdit={openEdit}
                  onToggle={toggle}
                  onDelete={askDelete}
                  onMove={onMove}
                />
              );
            })}
            {/* Where the dragged row will land. */}
            {drag && <li role="presentation" aria-hidden="true" style={{ top: drag.gapTop, height: drag.height }} className="pointer-events-none absolute inset-x-1 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/70" />}
          </ol>
        </div>
      )}

      <HomeEntryDialog isOpen={dialogOpen} entry={editTarget} entryCount={entries.length} onClose={() => setDialogOpen(false)} onSaved={handleSaved} onReload={() => void load()} />

      {previewOpen && <HomePreviewDialog entries={entries} onClose={() => setPreviewOpen(false)} />}

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => (deleting ? undefined : setDeleteTarget(null))}
        onConfirm={() => void confirmDelete()}
        title="Delete Home Entry"
        message={`Delete the Home Entry "${deleteTarget?.title ?? ''}"? It is removed from the learner Home screen and the other entries keep their order.${
          deleteTarget && deleteTarget.courseCount > 0
            ? ` Its ${courseCountText(deleteTarget.courseCount)} will be taken out of it (they become ordinary courses). No course, lesson, image or learner progress is deleted, and published content stays as it is.`
            : ' No course, lesson, image or learner progress is deleted.'
        } This cannot be undone; to hide the entry only for now, use Disable instead.`}
        confirmLabel="Delete Home Entry"
        isDestructive
        isLoading={deleting}
      />
    </div>
  );
}
