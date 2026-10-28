'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { courseCountText, homeEntryErrorMessage, isOrderConflict, moveItem, sameMembers, sameOrder } from '../../lib/home-entries';
import { type VisibilityData, entryVisibility, fallbackCoverId, fetchVisibility } from '../../lib/home-visibility';
import { rowShift, usePointerSort } from '../../lib/pointer-sort';
import { useUnsavedGuard } from '../../lib/unsaved-guard';
import type { HomeEntry } from '../../lib/types';
import HomeEntryDialog from '../../components/HomeEntryDialog';
import HomeEntryRow from '../../components/HomeEntryRow';
import HomePreviewDialog from '../../components/HomePreviewDialog';
import { ConfirmDialog, EmptyState, LoadingSpinner, Modal } from '../../components/ui';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const CONFLICT_TEXT =
  'The Home Entry order was changed by someone else (or an entry was added or removed) after this page was loaded, so nothing was saved and nobody else’s change was overwritten. Your arrangement is still here, unsaved. To go on, reload the latest order (that replaces your arrangement) and arrange it again.';

/** The one message area of the page: what happened to an action. */
interface Notice {
  tone: 'success' | 'error';
  text: string;
}

/** The entries arranged in the order of `ids` (unchanged when the two do not hold the same entries). */
function orderLike(items: HomeEntry[], ids: readonly string[]): HomeEntry[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const arranged = ids.map((id) => byId.get(id)).filter((item): item is HomeEntry => Boolean(item));
  return arranged.length === items.length ? arranged : items;
}

const NOTICE_TONES: Record<Notice['tone'], string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
};

const BAR_BUTTON = 'rounded-lg px-4 py-2 text-sm font-medium focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

/**
 * Home Entries: the topics on the learner Home screen (Daniel, Revelation, Bible History...). Administrators add, edit, reorder, enable, disable and delete them here with no change to the
 * mobile app. An entry holds no course of its own: courses are put into it from the course form, so an entry can exist with none. Deleting an entry takes its courses out of it and deletes
 * nothing else. Learners see an entry only while it is enabled AND at least one course in it is published with lessons at their level, which the server works out when the app asks; this page
 * asks the same server (lib/home-visibility.ts) for the badges and for "Preview Home", and repeats none of those rules.
 *
 * ORDERING IS A DRAFT UNTIL IT IS SAVED. The page holds two things: `saved`, the list as the server last confirmed it, and `draftIds`, the arrangement on screen (null while it is the saved
 * one). Dragging a row by its handle (pointer events: mouse, finger or pen), pressing the up or down arrow key on the handle, or Move up / Move down in the row's menu change ONLY the draft;
 * the server hears nothing. Putting the entries back in the saved order clears the draft by itself. While the draft differs, a bar offers Reset (back to the saved order, no request) and
 * Save Order, which sends the whole draft with the existing route (PUT /admin/home-entries/order) together with the saved order as `previousEntryIds`, so the server refuses (409) if anyone
 * reordered, added or deleted an entry since. A failed save keeps the draft and can be repeated; a refusal keeps the draft too, but saving is held until the administrator reloads the latest
 * order, because the draft was built on a list that is no longer the server's. Leaving the page, and the actions that would reload the list under the draft, ask first.
 */
export default function HomeEntriesPage() {
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';

  // The list as the server last confirmed it, and the arrangement on screen (null: the saved one). `draftIds` is only ever set to an order that differs from the saved one.
  const [saved, setSaved] = useState<HomeEntry[]>([]);
  const [draftIds, setDraftIds] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [vis, setVis] = useState<VisibilityData>({ status: 'loading' });
  const [infoOpen, setInfoOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // An order is being saved; the draft was built on a list the server has since changed; why the last save did not happen; an enable/disable (the row's id) or a delete is being saved.
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // An action that would reload the list under an unsaved order, waiting for the administrator to say what happens to the order first.
  const [heldAction, setHeldAction] = useState<{ label: string; run: () => void } | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<HomeEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HomeEntry | null>(null);

  const infoId = useId();
  const hasLoadedRef = useRef(false);
  const loadSeq = useRef(0);
  const visSeq = useRef(0);
  const savedRef = useRef<HomeEntry[]>([]);
  const draftRef = useRef<string[] | null>(null);
  const savingRef = useRef(false);
  const busyRef = useRef(false);
  // After a move the row has been re-attached in its new place: put the keyboard back on the control that was used. After Save or Reset the bar is gone: focus goes to the list.
  const pendingFocus = useRef<{ id: string; kind: 'handle' | 'more' } | null>(null);
  const focusListRef = useRef(false);

  const commitSaved = useCallback((items: HomeEntry[]) => {
    savedRef.current = items;
    setSaved(items);
  }, []);
  const commitDraft = useCallback((ids: string[] | null) => {
    draftRef.current = ids;
    setDraftIds(ids);
  }, []);

  const entries = useMemo(() => (draftIds ? orderLike(saved, draftIds) : saved), [saved, draftIds]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const dirty = draftIds !== null;

  const load = useCallback(
    async (options?: { discardDraft?: boolean }) => {
      const seq = ++loadSeq.current;
      setLoading(!hasLoadedRef.current);
      setError(null);
      try {
        const list = await api.request<{ items: HomeEntry[] }>('/admin/home-entries');
        if (seq !== loadSeq.current) return; // a newer load is on its way
        const latest = list.items.map((item) => item.id);
        const before = savedRef.current.map((item) => item.id);
        const draft = draftRef.current;
        commitSaved(list.items);
        if (!draft || options?.discardDraft) {
          commitDraft(null);
          setStale(false);
          setOrderError(null);
        } else if (!sameMembers(draft, latest)) {
          // Entries were added or removed meanwhile: the arrangement no longer fits the list, and merging it would be a guess.
          commitDraft(null);
          setStale(false);
          setOrderError(null);
          setNotice({ tone: 'error', text: 'Entries were added or removed by someone else, so your unsaved order could not be kept. The list now shows the latest order.' });
        } else if (sameOrder(draft, latest)) {
          // Someone saved exactly this arrangement.
          commitDraft(null);
          setStale(false);
          setOrderError(null);
        } else if (!sameOrder(before, latest)) {
          // The same entries, but the server's order moved under the draft: keep the draft, hold saving.
          setStale(true);
          setOrderError(CONFLICT_TEXT);
        }
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
    },
    [commitDraft, commitSaved],
  );

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

  // ------------------------------------------------------------------------------------------------------------------------------ ordering (a draft until Save Order)

  /** Changes the draft only: no request. Back to the saved order means no draft at all. */
  const applyDraft = useCallback(
    (next: string[]) => {
      const savedIds = savedRef.current.map((item) => item.id);
      commitDraft(sameOrder(next, savedIds) ? null : next);
    },
    [commitDraft],
  );

  const reorderTo = useCallback(
    (from: number, to: number, via: 'drag' | 'handle' | 'menu') => {
      if (savingRef.current || busyRef.current) return;
      const current = entriesRef.current;
      const entry = current[from];
      if (!entry || to < 0 || to >= current.length || from === to) return;
      pendingFocus.current = { id: entry.id, kind: via === 'menu' ? 'more' : 'handle' };
      const next = moveItem(
        current.map((item) => item.id),
        from,
        to,
      );
      applyDraft(next);
      const changed = !sameOrder(
        next,
        savedRef.current.map((item) => item.id),
      );
      setAnnouncement(
        changed
          ? `${entry.title} moved to position ${to + 1} of ${current.length}. The order has unsaved changes. Choose Save Order to apply them.`
          : `${entry.title} moved to position ${to + 1} of ${current.length}. This is the saved order again, so there is nothing to save.`,
      );
    },
    [applyDraft],
  );
  const onMove = useCallback((index: number, direction: 'up' | 'down', via: 'handle' | 'menu') => reorderTo(index, direction === 'up' ? index - 1 : index + 1, via), [reorderTo]);
  const onSortMove = useCallback((from: number, to: number) => reorderTo(from, to, 'drag'), [reorderTo]);

  /** Sends the whole draft, with the order the server last confirmed so it can refuse if that has changed. Returns whether the order is now saved. */
  const saveOrder = useCallback(async (): Promise<boolean> => {
    const draft = draftRef.current;
    if (!draft || savingRef.current || busyRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setOrderError(null);
    setNotice(null);
    try {
      const result = await api.request<{ items: HomeEntry[] }>('/admin/home-entries/order', {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ entryIds: draft, previousEntryIds: savedRef.current.map((item) => item.id) }),
      });
      commitSaved(result.items);
      commitDraft(null);
      setStale(false);
      focusListRef.current = true;
      setNotice({ tone: 'success', text: 'Order saved successfully. Learners see the new order on their next refresh of Home.' });
      setAnnouncement('Order saved successfully.');
      return true;
    } catch (err: unknown) {
      // The draft stays exactly as it was. A refusal means the list changed under it (saving is held until it is reloaded); anything else can simply be tried again.
      if (isOrderConflict(err)) {
        setStale(true);
        setOrderError(CONFLICT_TEXT);
      } else {
        setOrderError(`${homeEntryErrorMessage(err, 'Could not save the order.')} Your arrangement is still here and nothing was changed for learners. Choose Save Order to try again.`);
      }
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [commitDraft, commitSaved]);

  /** Discards the unsaved arrangement and shows the saved order again. Makes no request; no entry's content is touched. */
  const resetOrder = useCallback(() => {
    if (savingRef.current) return;
    focusListRef.current = true;
    commitDraft(null);
    setOrderError(null);
    setAnnouncement('Unsaved order changes discarded. The saved order is shown.');
  }, [commitDraft]);

  /** After a refusal: fetch the server's current order. Replaces the administrator's arrangement, so it asks first. */
  const reloadLatest = useCallback(async () => {
    if (savingRef.current) return;
    if (draftRef.current && !window.confirm('Reload the latest order? Your unsaved arrangement will be discarded.')) return;
    setNotice(null);
    await load({ discardDraft: true });
    setAnnouncement('The latest order has been loaded.');
  }, [load]);

  /** Runs `run` now, or, when an unsaved order would be lost by it, asks first (Save Order, discard it, or cancel). */
  const guardAction = useCallback((label: string, run: () => void) => {
    if (draftRef.current === null) {
      run();
      return;
    }
    setHeldAction({ label, run });
  }, []);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const selector = target.kind === 'handle' ? `[data-sort-id="${target.id}"]` : `[data-menu-owner="${target.id}"]`;
    document.querySelector<HTMLElement>(selector)?.focus();
  }, [entries]);

  const ids = useMemo(() => entries.map((entry) => entry.id), [entries]);
  const { listRef, registerRow, handle, drag } = usePointerSort({ ids, disabled: switchingId !== null || deleting || saving, onMove: onSortMove });

  useEffect(() => {
    if (!focusListRef.current || draftIds !== null) return;
    focusListRef.current = false;
    listRef.current?.focus();
  }, [draftIds, listRef]);

  const guard = useUnsavedGuard(dirty);

  // ------------------------------------------------------------------------------------------------------------------------------ the other actions

  const openAdd = () => {
    guardAction('Adding a Home Entry', () => {
      if (savingRef.current || busyRef.current) return;
      setNotice(null);
      setEditTarget(null);
      setDialogOpen(true);
    });
  };

  // Editing changes one entry's content, not the list's membership or order, so it never touches an unsaved order (the entry is updated in place below).
  const openEdit = useCallback((entry: HomeEntry) => {
    if (savingRef.current || busyRef.current) return;
    setNotice(null);
    setEditTarget(entry);
    setDialogOpen(true);
  }, []);

  const handleSaved = (updated: HomeEntry, created: boolean) => {
    setDialogOpen(false);
    setNotice({
      tone: 'success',
      text: created
        ? `Added the Home Entry "${updated.title}". Assign courses to it by choosing it in the course form; learners see it once one of its courses is published at their level.`
        : `Saved "${updated.title}".`,
    });
    if (created) void load();
    else commitSaved(savedRef.current.map((item) => (item.id === updated.id ? updated : item)));
    void loadVisibility();
  };

  // Switching an entry on or off changes that entry only: the saved list is updated in place and an unsaved order stays as it is.
  const toggle = useCallback(
    async (entry: HomeEntry) => {
      if (busyRef.current || savingRef.current) return;
      busyRef.current = true;
      setSwitchingId(entry.id);
      setNotice(null);
      try {
        const updated = await api.request<HomeEntry>(`/admin/home-entries/${entry.id}`, {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify({ isEnabled: !entry.isEnabled, version: entry.version }),
        });
        commitSaved(savedRef.current.map((item) => (item.id === updated.id ? updated : item)));
        setNotice({
          tone: 'success',
          text: updated.isEnabled
            ? `"${updated.title}" is enabled again. Learners see it once it has a published course with lessons at their level; the badge on its row shows where.`
            : `"${updated.title}" is disabled: learners no longer see it. Nothing is deleted and its courses stay assigned.`,
        });
        void loadVisibility();
      } catch (err: unknown) {
        // The row was not changed on screen, so there is nothing to put back; the latest list is fetched in case someone else changed it (an unsaved order is kept when it still fits).
        setNotice({ tone: 'error', text: `${homeEntryErrorMessage(err, `Could not ${entry.isEnabled ? 'disable' : 'enable'} this Home Entry.`)} It was left as it was.` });
        await load();
      } finally {
        busyRef.current = false;
        setSwitchingId(null);
      }
    },
    [commitSaved, load, loadVisibility],
  );

  // Deleting removes an entry from the list, which an unsaved order cannot survive: ask about the order first.
  const askDelete = useCallback(
    (entry: HomeEntry) => {
      if (busyRef.current || savingRef.current) return;
      guardAction('Deleting a Home Entry', () => setDeleteTarget(entry));
    },
    [guardAction],
  );

  const confirmDelete = async () => {
    if (!deleteTarget || busyRef.current || savingRef.current) return;
    busyRef.current = true;
    setDeleting(true);
    setNotice(null);
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
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`sticky top-2 z-30 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border p-3 text-sm shadow-xs ${NOTICE_TONES[notice.tone]}`}
        >
          <span className="min-w-0">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" className="shrink-0 rounded px-1.5 text-lg leading-none hover:bg-black/5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            &times;
          </button>
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
              disabled={listDisabled || saving || busy}
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
            <li>A new order only reaches learners after you choose <strong>Save Order</strong>, on their <strong>next refresh of Home</strong>. Edits and switching an entry on or off reach them the same way, with no publishing step.</li>
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
          {canWrite && entries.length > 1 && <p className="text-xs text-slate-600">Drag entries to arrange them. Click Save Order to apply your changes.</p>}
          <ol
            ref={(element) => {
              listRef.current = element;
            }}
            tabIndex={-1}
            aria-label="Home Entries in the order learners see them"
            aria-busy={saving}
            className={`relative rounded-xl border border-slate-200 bg-white shadow-xs outline-none ${drag ? 'cursor-grabbing select-none' : ''}`}
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
                  ordering={saving}
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

          {canWrite && (dirty || stale) && (
            <div role="region" aria-label="Unsaved order changes" className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-lg">
              <div className="min-w-0 flex-1 basis-64 space-y-0.5 text-amber-950">
                <p className="text-sm font-semibold">{dirty ? 'Unsaved order changes' : 'This list is out of date'}</p>
                {saving ? (
                  <p role="status" className="flex items-center gap-2 text-xs">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-300 border-t-amber-800 motion-reduce:animate-none" aria-hidden="true" />
                    Saving order…
                  </p>
                ) : orderError ? (
                  <p role="alert" className="text-xs font-medium text-rose-800">
                    {orderError}
                  </p>
                ) : (
                  <p className="text-xs">Learners keep seeing the saved order until you choose Save Order.</p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {stale && (
                  <button type="button" onClick={() => void reloadLatest()} disabled={saving} className={`${BAR_BUTTON} border border-rose-300 bg-white text-rose-900 hover:bg-rose-50 disabled:opacity-50`}>
                    Reload latest order
                  </button>
                )}
                {dirty && (
                  <>
                    <button type="button" onClick={resetOrder} disabled={saving} className={`${BAR_BUTTON} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50`}>
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveOrder()}
                      disabled={stale}
                      aria-busy={saving}
                      aria-disabled={saving || stale}
                      className={`${BAR_BUTTON} flex items-center gap-2 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 ${saving ? 'cursor-wait opacity-80' : ''}`}
                    >
                      Save Order
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <HomeEntryDialog isOpen={dialogOpen} entry={editTarget} entryCount={entries.length} onClose={() => setDialogOpen(false)} onSaved={handleSaved} onReload={() => void load()} />

      {previewOpen && <HomePreviewDialog entries={saved} unsavedOrder={dirty} onClose={() => setPreviewOpen(false)} />}

      {heldAction && (
        <Modal isOpen onClose={() => setHeldAction(null)} title="You have unsaved order changes" description="Choose what happens to the new order first." maxWidth="md">
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-slate-700">
              {heldAction.label} changes which entries are in the list, and the list is then reloaded from the server, so the new order you have arranged would be lost. Save it first, discard it, or cancel and keep arranging.
            </p>
            {stale && <p className="text-sm font-medium text-rose-800">The order cannot be saved because someone else changed the list. Discard your arrangement to go on, or cancel and reload the latest order.</p>}
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setHeldAction(null)} className={`${BAR_BUTTON} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const action = heldAction;
                  setHeldAction(null);
                  resetOrder();
                  action.run();
                }}
                className={`${BAR_BUTTON} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
              >
                Discard order and continue
              </button>
              <button
                type="button"
                disabled={stale}
                onClick={() => {
                  const action = heldAction;
                  setHeldAction(null);
                  void saveOrder().then((ok) => {
                    if (ok) action.run();
                  });
                }}
                className={`${BAR_BUTTON} bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50`}
              >
                Save Order and continue
              </button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={guard.held !== null}
        onClose={guard.stay}
        onConfirm={guard.leave}
        title="Leave without saving the order?"
        message="You have unsaved order changes. If you leave now they are lost, and learners keep seeing the saved order. Stay on this page to choose Save Order or Reset."
        confirmLabel="Leave and discard"
        cancelLabel="Stay on this page"
        isDestructive
      />

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
