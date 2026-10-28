'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { DEFAULT_FILTERS, type LibraryFilters, fetchAllReusableBlocks, filterLibrary, hasActiveFilters, summarizeLibrary } from '../../lib/reusable-library';
import { reusableErrorMessage } from '../../lib/reusable-blocks';
import { useScriptureInfo } from '../../lib/scripture-info';
import type { ReusableBlock, ReusableBlockSummary } from '../../lib/types';
import BlockPreviewDialog from '../../components/reusable-blocks/BlockPreviewDialog';
import DeleteReusableDialog from '../../components/reusable-blocks/DeleteReusableDialog';
import ReusableBlockEditDialog from '../../components/reusable-blocks/ReusableBlockEditDialog';
import { ReusableBlockCard, ReusableBlockRow } from '../../components/reusable-blocks/ReusableBlockItems';
import { LibraryToolbar, SummaryCards, type ViewMode } from '../../components/reusable-blocks/ReusableToolbar';
import { forgetBlock } from '../../components/reusable-blocks/useBlockContent';
import Icon from '../../components/quizzes/icons';
import { EmptyState, LoadingSpinner } from '../../components/ui';

const VIEW_KEY = 'pd_reusable_blocks_view';

/**
 * Content Management > Reusable Blocks (CMS-014): the library of blocks saved from lessons. COPY-BASED: a reusable block is a template, inserting it into a lesson (from the lesson editor) creates a
 * new, independent block, and changing or deleting a template never changes a lesson that already holds a copy. Nothing here is published or shown to learners.
 *
 * The screen loads EVERY block (the list route pages at 100) before it shows the summary cards, so the figures, the search, the block type and learning level filters and the sort always cover the
 * complete library. There is no "Create" button on purpose: a reusable block is made from a block that already exists in a lesson ("Save as reusable block" in the lesson editor), and the server has no
 * other way to create one. The content of each card is read lazily, as the card comes into view (see useBlockContent).
 */
export default function ReusableBlocksPage() {
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';
  const scripture = useScriptureInfo();

  const [items, setItems] = useState<ReusableBlockSummary[]>([]);
  const [complete, setComplete] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [view, setView] = useState<ViewMode>('grid');
  const [infoOpen, setInfoOpen] = useState(false);

  const [previewing, setPreviewing] = useState<ReusableBlockSummary | null>(null);
  const [editing, setEditing] = useState<ReusableBlock | null>(null);
  const [deleting, setDeleting] = useState<ReusableBlockSummary | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const run = useRef(0);

  const load = useCallback(async (silent = false) => {
    const mine = ++run.current;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetchAllReusableBlocks();
      if (mine !== run.current) return;
      setItems(res.items);
      setComplete(res.complete);
      setError(null);
    } catch (err: unknown) {
      if (mine !== run.current) return;
      // A quiet refresh that fails leaves what is on screen; a load the person asked for reports.
      if (!silent) {
        const status = (err as { status?: number } | null)?.status;
        setError(
          `${reusableErrorMessage(err, 'Could not load the reusable blocks.')}${status !== undefined && status >= 500 ? ' If the reusable block library has never been opened on this system, its database update may not have been applied yet.' : ''}`,
        );
      }
    } finally {
      if (mine === run.current && !silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The chosen view is remembered in this browser (a per-person convenience; the page works without it).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === 'grid' || saved === 'list') setView(saved);
    } catch {
      // storage unavailable: the default view stays
    }
  }, []);
  const chooseView = (next: ViewMode) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // not remembered; nothing else depends on it
    }
  };

  const summary = useMemo(() => summarizeLibrary(items), [items]);
  const visible = useMemo(() => filterLibrary(items, filters), [items, filters]);
  const filtering = hasActiveFilters(filters);
  const clearFilters = () => setFilters((f) => ({ ...DEFAULT_FILTERS, sort: f.sort }));

  /** Reads the whole block (with its content) for the editor: the list never carries content. */
  const openEdit = async (item: ReusableBlockSummary) => {
    if (openingId) return;
    setOpeningId(item.id);
    setError(null);
    try {
      setEditing(await api.request<ReusableBlock>(`/admin/reusable-blocks/${item.id}`));
    } catch (err: unknown) {
      setError(reusableErrorMessage(err, 'Could not open this reusable block.'));
    } finally {
      setOpeningId(null);
    }
  };

  const onChanged = (updated: ReusableBlock, what: 'details' | 'content') => {
    forgetBlock(updated.id);
    setMessage(what === 'details' ? 'Reusable block updated. Lessons that already use a copy are not changed.' : 'Reusable block content updated. Lessons that already use a copy are not changed.');
    if (what === 'details') setEditing(null);
    void load(true);
  };

  const onDeleted = (block: ReusableBlockSummary) => {
    forgetBlock(block.id);
    setDeleting(null);
    setItems((list) => list.filter((item) => item.id !== block.id));
    setMessage(`"${block.name}" was deleted from the library. Lessons that already use a copy are not changed.`);
    void load(true);
    // The card that opened the dialog is gone: keyboard focus goes to the results instead of nowhere.
    window.requestAnimationFrame(() => resultsRef.current?.focus());
  };

  const empty = !loading && !error && items.length === 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1 border-b border-slate-200 pb-5">
        <h1 className="font-serif text-2xl font-bold text-slate-900">Reusable Blocks</h1>
        <p className="text-sm text-slate-700">Create, organize and reuse content across your lessons.</p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <button
          type="button"
          aria-expanded={infoOpen}
          aria-controls="rb-how"
          onClick={() => setInfoOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <span className="flex items-center gap-2">
            <Icon name="info" className="h-4 w-4 text-amber-800" />
            How reusable blocks work
          </span>
          <Icon name={infoOpen ? 'up' : 'down'} />
        </button>
        {infoOpen && (
          <div id="rb-how" className="space-y-3 border-t border-slate-100 px-4 py-4 text-sm text-slate-800">
            <ol className="grid gap-3 sm:grid-cols-3">
              {[
                ['Save a block from a lesson', 'In the lesson editor, choose Save as reusable block on a block you want to use again.'],
                ['Find it in your library', 'It appears here, ready to search, preview and organize.'],
                ['Insert it into another lesson', 'Add content to a lesson and choose the library. The lesson gets an independent copy.'],
              ].map(([title, text], index) => (
                <li key={title} className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <span>
                    <span className="block font-semibold text-slate-900">{title}</span>
                    <span className="block text-xs text-slate-700">{text}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-slate-700">
              Changing or deleting a reusable block never changes a lesson that already uses a copy, and editing a copy never changes the reusable block. Nothing here is published or shown to learners.
            </p>
          </div>
        )}
      </section>

      {message && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <span className="min-w-0 wrap-break-word">{message}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message" className="shrink-0 rounded p-1 hover:bg-white/60 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            <Icon name="close" />
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="shrink-0 rounded-md border border-rose-300 bg-white px-2.5 py-1 text-xs font-semibold hover:bg-rose-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            Try again
          </button>
        </div>
      )}

      {loading && items.length === 0 ? (
        <LoadingSpinner text="Loading reusable blocks..." />
      ) : empty ? (
        <EmptyState
          title="No reusable blocks yet"
          description="Save a block from a lesson to reuse it in other lessons."
          action={
            <Link href="/lessons" className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
              Go to Lessons
            </Link>
          }
        />
      ) : items.length > 0 ? (
        <>
          <SummaryCards summary={summary} />
          {!complete && (
            <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              Only {items.length} reusable blocks could be loaded, so the figures, search and filters below cover those, not the whole library.{' '}
              <button type="button" onClick={() => void load()} className="font-medium underline">
                Try again
              </button>
            </p>
          )}

          <section aria-labelledby="rb-results-h" className="space-y-4">
            <h2 id="rb-results-h" ref={resultsRef} tabIndex={-1} className="sr-only focus:outline-hidden">
              Reusable blocks
            </h2>
            <LibraryToolbar
              filters={filters}
              onChange={(change) => setFilters((f) => ({ ...f, ...change }))}
              onClear={clearFilters}
              shown={visible.length}
              total={items.length}
              view={view}
              onView={chooseView}
              searchRef={searchRef}
            />

            {visible.length === 0 ? (
              <EmptyState
                title="No matching blocks"
                description="Try changing your search or filters."
                action={
                  filtering ? (
                    <button type="button" onClick={clearFilters} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                      Clear Filters
                    </button>
                  ) : undefined
                }
              />
            ) : view === 'grid' ? (
              <ul aria-label="Reusable blocks" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-4">
                {visible.map((item) => (
                  <li key={item.id} className="min-w-0">
                    <ReusableBlockCard item={item} canWrite={canWrite} busy={openingId === item.id} bookNames={scripture.bookNames} onPreview={setPreviewing} onEdit={(entry) => void openEdit(entry)} onDelete={setDeleting} />
                  </li>
                ))}
              </ul>
            ) : (
              <ul aria-label="Reusable blocks" className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-xs">
                {visible.map((item) => (
                  <ReusableBlockRow key={item.id} item={item} canWrite={canWrite} busy={openingId === item.id} onPreview={setPreviewing} onEdit={(entry) => void openEdit(entry)} onDelete={setDeleting} />
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      {previewing && (
        <BlockPreviewDialog
          id={previewing.id}
          name={previewing.name}
          canWrite={canWrite}
          onClose={() => setPreviewing(null)}
          onEdit={(block) => {
            setPreviewing(null);
            setEditing(block);
          }}
        />
      )}

      {editing && <ReusableBlockEditDialog key={editing.id} block={editing} onClose={() => setEditing(null)} onChanged={onChanged} />}

      {deleting && <DeleteReusableDialog block={deleting} onClose={() => setDeleting(null)} onDeleted={onDeleted} />}
    </div>
  );
}
