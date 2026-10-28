'use client';

import React, { useId, useRef } from 'react';
import type { QuizSummary } from '../../lib/types';
import { EmptyState, LoadingSpinner, StatusBadge } from '../ui';
import Icon from './icons';

/**
 * The Quiz Management catalog (left column): search, a status filter and the quizzes as cards, the selected one clearly marked.
 *
 * WHAT IS LOADED. The quiz list route has no search or status filter of its own (only `limit` up to 100 and `offset`), so the page loads the quizzes in pages of up to 100 and search and the status
 * filter run over what is loaded. While not every quiz is loaded the catalog says so ("N of TOTAL loaded"), offers "Load more", and shows no per-status counts, because a count of a partial list
 * would pass for a total. Once everything is loaded the counts are exact.
 */
export type StatusFilter = 'ALL' | 'DRAFT' | 'PUBLISHED';

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'DRAFT', label: 'Draft' },
  { id: 'PUBLISHED', label: 'Published' },
];

const dateOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

export default function QuizCatalog({
  quizzes,
  total,
  loading,
  loadingMore,
  error,
  activeId,
  search,
  status,
  canWrite,
  onSearch,
  onStatus,
  onSelect,
  onRetry,
  onLoadMore,
  onCreate,
}: {
  quizzes: QuizSummary[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  activeId: string | null;
  search: string;
  status: StatusFilter;
  canWrite: boolean;
  onSearch: (value: string) => void;
  onStatus: (status: StatusFilter) => void;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onCreate: () => void;
}) {
  const searchId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const term = search.trim().toLowerCase();
  const complete = quizzes.length >= total;
  const matches = quizzes.filter((q) => (status === 'ALL' || q.status === status) && (term === '' || q.title.toLowerCase().includes(term) || (q.description ?? '').toLowerCase().includes(term)));
  // Exact only when every quiz is loaded; each count respects the search, like the list.
  const searched = quizzes.filter((q) => term === '' || q.title.toLowerCase().includes(term) || (q.description ?? '').toLowerCase().includes(term));
  const countOf = (id: StatusFilter) => (id === 'ALL' ? searched.length : searched.filter((q) => q.status === id).length);
  const filtering = term !== '' || status !== 'ALL';

  const onKeys = (event: React.KeyboardEvent, index: number) => {
    const count = FILTERS.length;
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % count : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index + count - 1) % count : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    onStatus(FILTERS[next].id);
    refs.current[next]?.focus();
  };

  return (
    <section aria-labelledby={`${searchId}-heading`} className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${searchId}-heading`} className="text-xs font-semibold uppercase tracking-wider text-slate-600">
          Quizzes{' '}
          <span className="font-mono normal-case text-slate-500" aria-live="polite">
            ({complete ? matches.length : `${quizzes.length} of ${total} loaded`})
          </span>
        </h2>
      </div>

      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          Search quizzes by title or description
        </label>
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          id={searchId}
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search quizzes..."
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 placeholder-slate-500 focus:border-amber-600 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 [&::-webkit-search-cancel-button]:hidden"
        />
        {search && (
          <button type="button" onClick={() => onSearch('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            <Icon name="close" />
          </button>
        )}
      </div>

      <div role="radiogroup" aria-label="Filter by status" className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5">
        {FILTERS.map((filter, index) => (
          <button
            key={filter.id}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={status === filter.id}
            tabIndex={status === filter.id ? 0 : -1}
            onClick={() => onStatus(filter.id)}
            onKeyDown={(event) => onKeys(event, index)}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${status === filter.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-700 hover:text-slate-900'}`}
          >
            {filter.label}
            {complete && <span className="text-xs font-normal text-slate-600">{countOf(filter.id)}</span>}
          </button>
        ))}
      </div>

      {!complete && !error && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700">
          {quizzes.length} of {total} quizzes are loaded. Search and the status filter cover the loaded quizzes; load more to include the rest.
        </p>
      )}

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          <span>{error}</span>
          <button type="button" onClick={onRetry} className="shrink-0 rounded-lg border border-rose-300 bg-white px-3 py-1 text-sm font-medium hover:bg-rose-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            Try again
          </button>
        </div>
      )}

      {loading && quizzes.length === 0 ? (
        <LoadingSpinner text="Loading quizzes..." />
      ) : quizzes.length === 0 && !error ? (
        <EmptyState
          title="No quizzes yet"
          description="Quizzes you create appear here. A quiz can then be added to a lesson."
          action={
            canWrite ? (
              <button type="button" onClick={onCreate} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                <Icon name="plus" />
                Create Quiz
              </button>
            ) : undefined
          }
        />
      ) : matches.length === 0 && quizzes.length > 0 ? (
        <EmptyState
          title="No quizzes match"
          description={complete ? 'No quiz matches your search and filter.' : 'No loaded quiz matches your search and filter.'}
          action={
            filtering ? (
              <button
                type="button"
                onClick={() => {
                  onSearch('');
                  onStatus('ALL');
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                Clear search and filter
              </button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2" aria-busy={loading}>
          {matches.map((quiz) => {
            const active = quiz.id === activeId;
            return (
              <li key={quiz.id}>
                <button
                  type="button"
                  onClick={() => onSelect(quiz.id)}
                  aria-current={active ? 'true' : undefined}
                  aria-label={`${quiz.title}. ${quiz.status === 'PUBLISHED' ? 'Published' : 'Draft'}, ${quiz.questionCount} ${quiz.questionCount === 1 ? 'question' : 'questions'}, version ${quiz.version}`}
                  className={`block w-full rounded-xl border px-3.5 py-3 text-left transition focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 motion-reduce:transition-none ${active ? 'border-amber-500 bg-amber-50/70 shadow-xs ring-1 ring-amber-200' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 hover:shadow-xs'}`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="line-clamp-1 text-sm font-semibold text-slate-900">{quiz.title}</span>
                    <StatusBadge status={quiz.status} />
                  </span>
                  {quiz.description && <span className="mt-1 line-clamp-2 block text-xs text-slate-600">{quiz.description}</span>}
                  <span className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-slate-100 pt-2 text-[11px] text-slate-600">
                    <span>
                      {quiz.questionCount} {quiz.questionCount === 1 ? 'question' : 'questions'}
                    </span>
                    <span className="font-mono">v{quiz.version}</span>
                    <span>Updated {dateOf(quiz.updatedAt)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!complete && (
        <div className="text-center">
          <button type="button" onClick={onLoadMore} disabled={loadingMore} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            {loadingMore ? 'Loading…' : `Load more (${total - quizzes.length} left)`}
          </button>
        </div>
      )}
    </section>
  );
}
