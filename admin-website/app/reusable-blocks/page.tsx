'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { IMPLEMENTED_BLOCKS, friendlyBlockName } from '../../lib/block-catalog';
import {
  TEMPLATE_DESCRIPTION_MAX,
  TEMPLATE_NAME_MAX,
  canEditContentInLibrary,
  levelName,
  levelsText,
  reusableErrorMessage,
  reusableTypeProblem,
  shortDate,
  versionsText,
} from '../../lib/reusable-blocks';
import type { ReusableBlock, ReusableBlockSummary } from '../../lib/types';
import ReusableBlockView from '../../components/ReusableBlockView';
import ReusableContentDialog from '../../components/ReusableContentDialog';
import { ConfirmDialog, EmptyState, LoadingSpinner, Modal } from '../../components/ui';

const PAGE_LIMIT = 100;
const FIELD = 'w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const LABEL = 'block text-sm font-semibold text-slate-800 mb-1.5';
const ROW_BUTTON = 'px-2.5 py-1 text-xs font-medium rounded-lg border focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50';

/** The block types that can be reusable blocks, for the type filter (everything the catalog knows except the types that cannot be). */
const FILTER_TYPES = IMPLEMENTED_BLOCKS.filter((block) => reusableTypeProblem(block.type) === null);

/**
 * Content Management > Reusable Blocks (CMS-014): the library of blocks saved from lessons. COPY-BASED: a reusable block is a template, inserting it into a lesson (from
 * the lesson editor) creates a new, independent block, and changing or deleting a template never changes a lesson that already holds a copy. Nothing here is published
 * or shown to learners.
 */
export default function ReusableBlocksPage() {
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';

  const [items, setItems] = useState<ReusableBlockSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const requestRef = useRef(0);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ReusableBlock | null>(null);

  // Rename / re-describe
  const [editTarget, setEditTarget] = useState<ReusableBlockSummary | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Shared content (the block's own editor)
  const [contentTarget, setContentTarget] = useState<ReusableBlock | null>(null);
  const [savingContent, setSavingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<ReusableBlockSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchList = useCallback(async () => {
    const mine = (requestRef.current += 1);
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
      if (search.trim()) params.set('q', search.trim());
      if (typeFilter) params.set('type', typeFilter);
      const res = await api.request<{ items: ReusableBlockSummary[]; total: number }>(`/admin/reusable-blocks?${params.toString()}`);
      if (mine !== requestRef.current) return; // a newer search is already running
      setItems(res.items);
      setTotal(res.total);
    } catch (err: unknown) {
      if (mine !== requestRef.current) return;
      const status = (err as { status?: number } | null)?.status;
      setError(
        `${reusableErrorMessage(err, 'Could not load the reusable blocks.')}${status !== undefined && status >= 500 ? ' If the reusable block library has never been opened on this system, its database update may not have been applied yet.' : ''}`,
      );
    } finally {
      if (mine === requestRef.current) setLoading(false);
    }
  }, [search, typeFilter]);

  // The list follows the search box a moment after typing stops.
  useEffect(() => {
    const timer = window.setTimeout(() => void fetchList(), search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [fetchList, search]);

  const detailsDirty = Boolean(editTarget && (editName !== editTarget.name || editDescription !== (editTarget.description ?? '')));
  useEffect(() => {
    if (!detailsDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [detailsDirty]);

  /** Reads the whole reusable block (with its content) from the server: the list never carries content. */
  const load = async (id: string): Promise<ReusableBlock | null> => {
    setBusyId(id);
    setError(null);
    try {
      return await api.request<ReusableBlock>(`/admin/reusable-blocks/${id}`);
    } catch (err: unknown) {
      setError(reusableErrorMessage(err, 'Could not open this reusable block.'));
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const openView = async (id: string) => {
    const found = await load(id);
    if (found) setViewing(found);
  };

  const openContentEditor = async (id: string) => {
    const found = await load(id);
    if (!found) return;
    setViewing(null);
    setContentError(null);
    setContentTarget(found);
  };

  const openEdit = (item: ReusableBlockSummary) => {
    setEditTarget(item);
    setEditName(item.name);
    setEditDescription(item.description ?? '');
    setDetailsError(null);
  };

  const closeEdit = () => {
    if (savingDetails) return;
    if (detailsDirty && !window.confirm('Discard your unsaved changes?')) return;
    setEditTarget(null);
  };

  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || savingDetails) return;
    setSavingDetails(true);
    setDetailsError(null);
    try {
      await api.request(`/admin/reusable-blocks/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, description: editDescription.trim() ? editDescription : null, version: editTarget.version }),
      });
      setEditTarget(null);
      setMessage('Reusable block updated. Lessons that already use a copy are not changed.');
      void fetchList();
    } catch (err: unknown) {
      setDetailsError(reusableErrorMessage(err, 'Could not save the changes.'));
    } finally {
      setSavingDetails(false);
    }
  };

  const saveContent = async (content: Record<string, unknown>) => {
    if (!contentTarget || savingContent) return;
    setSavingContent(true);
    setContentError(null);
    try {
      await api.request(`/admin/reusable-blocks/${contentTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sharedContent: content, version: contentTarget.version }),
      });
      setContentTarget(null);
      setMessage('Reusable block content updated. Lessons that already use a copy are not changed.');
      void fetchList();
    } catch (err: unknown) {
      setContentError(reusableErrorMessage(err, 'Could not save the content.'));
    } finally {
      setSavingContent(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await api.request(`/admin/reusable-blocks/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      setMessage('Reusable block deleted. Lessons that already use a copy are not changed.');
      void fetchList();
    } catch (err: unknown) {
      setDeleteTarget(null);
      setError(reusableErrorMessage(err, 'Could not delete the reusable block.'));
    } finally {
      setDeleting(false);
    }
  };

  const filtering = Boolean(search.trim() || typeFilter);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-serif font-bold text-slate-900">Reusable Blocks</h1>
        <p className="text-sm text-slate-700 mt-1 max-w-3xl">
          Blocks you saved from lessons, ready to use again. Inserting one into a lesson adds an <strong>independent copy</strong>: changing or deleting a reusable block never
          changes a lesson that already uses a copy, and editing a copy never changes the reusable block. To add one here, open a lesson and choose <em>Save as reusable block</em> on a
          block. Nothing here is published or shown to learners.
        </p>
      </header>

      {message && (
        <div role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between gap-3">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message" className="text-emerald-700 hover:text-emerald-900">
            &times;
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => void fetchList()} className="shrink-0 px-2.5 py-1 text-xs font-semibold rounded-md bg-white border border-rose-300 hover:bg-rose-100">
            Try again
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label htmlFor="rb-search" className="sr-only">
            Search reusable blocks by name
          </label>
          <input id="rb-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" autoComplete="off" className={FIELD} />
        </div>
        <div className="sm:w-64">
          <label htmlFor="rb-type" className="sr-only">
            Filter by block type
          </label>
          <select id="rb-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={FIELD}>
            <option value="">All block types</option>
            {FILTER_TYPES.map((block) => (
              <option key={block.type} value={block.type}>
                {block.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner text="Loading reusable blocks..." />
      ) : items.length === 0 ? (
        error ? null : (
          <EmptyState
            title={filtering ? 'No reusable blocks match' : 'No reusable blocks yet'}
            description={
              filtering
                ? 'Try a shorter word, or clear the search and the block type to see every reusable block.'
                : 'Open a lesson and choose Save as reusable block on a block you want to use again. It will appear here.'
            }
          />
        )
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm text-left">
            <caption className="sr-only">Reusable blocks, most recently changed first</caption>
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-600">
                <th scope="col" className="px-4 py-3 font-semibold">
                  Name
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Type
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Levels
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Updated
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const versions = versionsText(item.levels);
                return (
                  <tr key={item.id} className="border-b border-slate-100 last:border-b-0 align-top">
                    <th scope="row" className="px-4 py-3 font-medium text-slate-900">
                      {item.name}
                      {item.description && <span className="block text-xs font-normal text-slate-700 mt-0.5 max-w-md">{item.description}</span>}
                    </th>
                    <td className="px-4 py-3 text-slate-800">{friendlyBlockName(item.type)}</td>
                    <td className="px-4 py-3 text-slate-800">
                      {levelsText(item.levels)}
                      {versions && <span className="block text-xs text-purple-800">{versions}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{shortDate(item.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => void openView(item.id)}
                          aria-label={`View ${item.name}`}
                          className={`${ROW_BUTTON} text-slate-800 bg-white hover:bg-slate-50 border-slate-300`}
                        >
                          {busyId === item.id ? 'Opening…' : 'View'}
                        </button>
                        {canWrite && (
                          <>
                            <button type="button" onClick={() => openEdit(item)} aria-label={`Edit ${item.name}`} className={`${ROW_BUTTON} text-slate-800 bg-slate-100 hover:bg-slate-200 border-transparent`}>
                              Edit
                            </button>
                            <button type="button" onClick={() => setDeleteTarget(item)} aria-label={`Delete ${item.name}`} className={`${ROW_BUTTON} text-rose-800 bg-white hover:bg-rose-50 border-rose-200`}>
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {total > items.length && (
            <p className="px-4 py-3 text-xs text-slate-700 border-t border-slate-100">
              Showing the {items.length} most recently changed of {total}. Search by name to find the others.
            </p>
          )}
        </div>
      )}

      {/* View: the content as it reads in a lesson, and each level that has its own version. */}
      <Modal
        isOpen={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? 'Reusable block'}
        description={viewing ? `${friendlyBlockName(viewing.type)} · ${levelsText(viewing.levels)}` : undefined}
        maxWidth="2xl"
      >
        {viewing && (
          <div className="space-y-5">
            {viewing.description && <p className="text-sm text-slate-800">{viewing.description}</p>}
            <section aria-labelledby="rb-view-shared" className="space-y-2">
              <h4 id="rb-view-shared" className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Shared content
              </h4>
              <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-800 font-serif">
                <ReusableBlockView type={viewing.type} content={viewing.sharedContent} />
              </div>
            </section>
            {viewing.levels
              .filter((entry) => entry.content !== null)
              .map((entry) => (
                <section key={entry.level} aria-label={`${levelName(entry.level)} version`} className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-purple-800">{levelName(entry.level)} version</h4>
                  <div className="p-4 rounded-lg border border-purple-200 bg-purple-50/40 text-sm text-slate-800 font-serif">
                    <ReusableBlockView type={viewing.type} content={entry.content} />
                  </div>
                </section>
              ))}
            <p className="text-xs text-slate-700">
              Levels this block was visible at when it was saved: {levelsText(viewing.levels)}. When it is inserted into a lesson, only the levels that lesson is available at are used.
            </p>
            <div className="flex flex-wrap justify-end gap-3 pt-3 border-t border-slate-100">
              {canWrite && canEditContentInLibrary(viewing.type) && (
                <button type="button" onClick={() => void openContentEditor(viewing.id)} className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
                  Edit content
                </button>
              )}
              <button type="button" onClick={() => setViewing(null)} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg">
                Close
              </button>
            </div>
            {canWrite && !canEditContentInLibrary(viewing.type) && (
              <p className="text-xs text-slate-700">
                The content of this kind of block is changed in a lesson: edit the block there and save it as a new reusable block. The name and description can be changed here.
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Rename / re-describe. */}
      <Modal isOpen={editTarget !== null} onClose={closeEdit} title="Edit reusable block" description="The name and description shown in this library. The content is not changed here." maxWidth="lg">
        <form onSubmit={saveDetails} className="space-y-4">
          {detailsError && (
            <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
              {detailsError} What you typed here is unchanged.
            </p>
          )}
          <div>
            <label htmlFor="rb-edit-name" className={LABEL}>
              Name
            </label>
            <input id="rb-edit-name" type="text" maxLength={TEMPLATE_NAME_MAX} value={editName} disabled={savingDetails} onChange={(e) => setEditName(e.target.value)} className={FIELD} />
          </div>
          <div>
            <label htmlFor="rb-edit-description" className={LABEL}>
              Description (optional)
            </label>
            <textarea
              id="rb-edit-description"
              rows={3}
              maxLength={TEMPLATE_DESCRIPTION_MAX}
              value={editDescription}
              disabled={savingDetails}
              onChange={(e) => setEditDescription(e.target.value)}
              className={FIELD}
            />
          </div>
          {editTarget && (
            <p className="text-xs text-slate-700">
              {friendlyBlockName(editTarget.type)} · {levelsText(editTarget.levels)}. {canEditContentInLibrary(editTarget.type) ? 'To change its content, open View and choose Edit content.' : 'The content of this kind of block is changed in a lesson.'}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onClick={closeEdit} disabled={savingDetails} className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingDetails || !detailsDirty || !editName.trim()}
              aria-busy={savingDetails}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {savingDetails && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
              Save changes
            </button>
          </div>
        </form>
      </Modal>

      {/* The shared content, in the block's own editor. */}
      <ReusableContentDialog
        template={contentTarget}
        saving={savingContent}
        error={contentError}
        onClose={() => {
          if (!savingContent) setContentTarget(null);
        }}
        onSave={(content) => void saveContent(content)}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={() => void confirmDelete()}
        title="Delete reusable block"
        message={`Delete "${deleteTarget?.name ?? ''}"? Only this reusable block is removed. Lessons that already use a copy of it keep their copy, and images are not deleted.`}
        confirmLabel="Delete"
        isDestructive
        isLoading={deleting}
      />
    </div>
  );
}
