'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { courseCountText, entryNote, homeEntryErrorMessage } from '../../lib/home-entries';
import type { HomeEntry } from '../../lib/types';
import CoverThumb from '../../components/CoverThumb';
import HomeEntryDialog from '../../components/HomeEntryDialog';
import { ConfirmDialog, EmptyState, LoadingSpinner, StatusBadge } from '../../components/ui';

const ICON_BUTTON = 'px-2 py-1 text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-30 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';
const TEXT_BUTTON = 'px-2.5 py-1.5 text-xs font-medium rounded-md border focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50';

/**
 * Home Entries: the topics on the learner Home screen (Daniel, Revelation, Bible History...). Administrators add, edit, reorder, enable and disable and delete them here with no change
 * to the mobile app. An entry holds no course of its own: courses are put into it from the course form, so an entry can exist with none. Deleting an entry takes its courses out of it
 * and deletes nothing else. Learners see an entry only while it is enabled AND at least one course in it is published with lessons at their level, which the app works out when it asks.
 */
export default function HomeEntriesPage() {
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';

  const [entries, setEntries] = useState<HomeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  // Saving an order or a switch is one request at a time, so two quick clicks never send two orders built from the same list.
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<HomeEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HomeEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(!hasLoadedRef.current);
    setError(null);
    try {
      const list = await api.request<{ items: HomeEntry[] }>('/admin/home-entries');
      setEntries(list.items);
    } catch (err: unknown) {
      const status = (err as { status?: number } | null)?.status;
      setError(
        `${homeEntryErrorMessage(err, 'Could not load the Home Entries.')}${status !== undefined && status >= 500 ? ' If Home Entries have never been opened on this system, their database update may not have been applied yet.' : ''}`,
      );
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      await work();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const openAdd = () => {
    setMessage(null);
    setEditTarget(null);
    setDialogOpen(true);
  };

  const openEdit = (entry: HomeEntry) => {
    setMessage(null);
    setEditTarget(entry);
    setDialogOpen(true);
  };

  const closeDialog = () => setDialogOpen(false);

  const handleSaved = (saved: HomeEntry, created: boolean) => {
    setDialogOpen(false);
    setMessage(
      created
        ? `Added the Home Entry "${saved.title}". Assign courses to it by choosing it in the course form; learners see it once one of its courses is published at their level.`
        : `Saved "${saved.title}".`,
    );
    void load();
  };

  const move = (index: number, direction: 'up' | 'down') =>
    run(async () => {
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= entries.length) return;
      const previous = entries;
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      const moved = previous[index].title;
      setEntries(next); // shown at once; the saved order replaces it when the server answers
      try {
        const res = await api.request<{ items: HomeEntry[] }>('/admin/home-entries/order', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entryIds: next.map((e) => e.id), previousEntryIds: previous.map((e) => e.id) }),
        });
        setEntries(res.items);
        setMessage(`Moved "${moved}" ${direction}. The order is saved: learners see it on their next refresh of Home.`);
      } catch (err: unknown) {
        setActionError(`${homeEntryErrorMessage(err, 'Could not save the new order.')} The list below shows the saved order.`);
        await load();
      }
    });

  const toggle = (entry: HomeEntry) =>
    run(async () => {
      try {
        const saved = await api.request<HomeEntry>(`/admin/home-entries/${entry.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isEnabled: !entry.isEnabled, version: entry.version }),
        });
        setEntries((current) => current.map((item) => (item.id === saved.id ? saved : item)));
        setMessage(saved.isEnabled ? `"${saved.title}" is enabled again.` : `"${saved.title}" is disabled: learners no longer see it. Nothing is deleted and its courses stay assigned.`);
      } catch (err: unknown) {
        setActionError(homeEntryErrorMessage(err, `Could not ${entry.isEnabled ? 'disable' : 'enable'} this Home Entry.`));
        await load();
      }
    });

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError(null);
    try {
      await api.request(`/admin/home-entries/${deleteTarget.id}`, { method: 'DELETE' });
      setMessage(
        `Deleted the Home Entry "${deleteTarget.title}".${deleteTarget.courseCount > 0 ? ` Its ${courseCountText(deleteTarget.courseCount)} ${deleteTarget.courseCount === 1 ? 'is' : 'are'} no longer assigned to it, and none was deleted.` : ''}`,
      );
      setDeleteTarget(null);
      void load();
    } catch (err: unknown) {
      setActionError(homeEntryErrorMessage(err, 'Could not delete this Home Entry.'));
      setDeleteTarget(null);
      void load();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <div role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex justify-between gap-3">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message">
            &times;
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-serif text-2xl font-bold text-slate-900">Home Entries</h1>
          <p className="text-sm text-slate-500 mt-0.5">The topics on the learner Home screen. Create an entry here, then put courses in it from the course form.</p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={openAdd}
            disabled={loading || Boolean(error)}
            className="self-start sm:self-auto px-4 py-2.5 text-sm font-medium bg-slate-950 hover:bg-slate-800 text-white rounded-lg shadow-xs transition-colors flex items-center gap-2 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Home Entry
          </button>
        )}
      </div>

      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm space-y-1">
        <p className="font-semibold">What learners see</p>
        <p>
          Entries appear on the Home screen in the order below. A learner sees an entry only while it is <strong>enabled</strong> and at least one course in it is <strong>published</strong> with
          lessons at the learning level they have chosen; tapping it lists just those published courses. Draft and unpublished courses never appear, and an entry with no such course is hidden
          by itself. &quot;No courses assigned&quot; below is a note for you only. Order changes and edits reach learners on their next refresh of Home, with no publishing step.
        </p>
      </div>

      {actionError && (
        <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start justify-between gap-3">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss error message">
            &times;
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="px-3 py-1 text-xs font-semibold border border-rose-300 rounded-md hover:bg-rose-100">
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
              <button type="button" onClick={openAdd} className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg">
                Add the first Home Entry
              </button>
            ) : undefined
          }
        />
      ) : (
        <ol aria-label="Home Entries in the order learners see them" aria-busy={busy} className="bg-white border border-slate-200 rounded-xl shadow-xs divide-y divide-slate-100">
          {entries.map((entry, index) => {
            const note = entryNote(entry);
            return (
              <li key={entry.id} className={`flex flex-col lg:flex-row lg:items-center gap-3 px-4 py-4 ${entry.isEnabled ? '' : 'bg-slate-50/70'}`}>
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span aria-label={`Position ${index + 1}`} className="w-7 h-7 shrink-0 rounded-md bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center">
                    {index + 1}
                  </span>
                  <CoverThumb mediaId={entry.imageMediaId} />
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900 wrap-break-word">{entry.title}</span>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${entry.isEnabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-300'}`}
                      >
                        {entry.isEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                      <span className="text-xs font-medium text-slate-700">{entry.courseCount === 0 ? 'No courses assigned' : courseCountText(entry.courseCount)}</span>
                    </div>
                    {entry.description && <p className="text-xs text-slate-600 wrap-break-word">{entry.description}</p>}
                    {entry.courseCount > 0 && (
                      <ul aria-label={`Courses assigned to ${entry.title}`} className="flex flex-wrap gap-x-4 gap-y-1">
                        {entry.courses.map((course) => (
                          <li key={course.id} className="text-xs text-slate-700 flex items-center gap-1.5 min-w-0">
                            <Link href={`/courses/${course.id}`} className="font-medium text-slate-900 hover:text-amber-700 underline-offset-2 hover:underline wrap-break-word">
                              {course.title}
                            </Link>
                            <StatusBadge status={course.status} />
                          </li>
                        ))}
                      </ul>
                    )}
                    {note && <p className="text-xs font-medium text-amber-900">{note}</p>}
                  </div>
                </div>

                {canWrite && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button type="button" aria-label={`Move ${entry.title} up`} disabled={busy || index === 0} onClick={() => void move(index, 'up')} className={ICON_BUTTON}>
                      ↑
                    </button>
                    <button type="button" aria-label={`Move ${entry.title} down`} disabled={busy || index === entries.length - 1} onClick={() => void move(index, 'down')} className={ICON_BUTTON}>
                      ↓
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggle(entry)}
                      aria-label={`${entry.isEnabled ? 'Disable' : 'Enable'} ${entry.title}`}
                      className={`${TEXT_BUTTON} bg-white border-slate-300 text-slate-800 hover:bg-slate-50`}
                    >
                      {entry.isEnabled ? 'Disable' : 'Enable'}
                    </button>
                    <button type="button" disabled={busy} onClick={() => openEdit(entry)} aria-label={`Edit ${entry.title}`} className={`${TEXT_BUTTON} bg-slate-100 border-transparent text-slate-800 hover:bg-slate-200`}>
                      Edit
                    </button>
                    <button type="button" disabled={busy} onClick={() => setDeleteTarget(entry)} aria-label={`Delete ${entry.title}`} className={`${TEXT_BUTTON} bg-white border-rose-200 text-rose-700 hover:bg-rose-50`}>
                      Delete
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {busy && (
        <p role="status" className="text-xs text-slate-500">
          Saving...
        </p>
      )}

      <HomeEntryDialog isOpen={dialogOpen} entry={editTarget} entryCount={entries.length} onClose={closeDialog} onSaved={handleSaved} onReload={() => void load()} />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => (deleting ? undefined : setDeleteTarget(null))}
        onConfirm={() => void confirmDelete()}
        title="Delete Home Entry"
        message={`Delete the Home Entry "${deleteTarget?.title ?? ''}"? It is removed from the learner Home screen.${
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
