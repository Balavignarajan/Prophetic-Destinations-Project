'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../lib/auth';
import { type AssessmentStatus, type AssessmentSummary, assessmentsApi, describeError } from '../../lib/assessments';
import { ActiveSummary, AssessmentCard, OverviewCards } from '../../components/assessments/AssessmentCards';
import { EmptyState, LoadingSpinner } from '../../components/ui';
import Icon from '../../components/quizzes/icons';

/** The assessment list route takes up to 100 a page (backend ListAssessmentsQueryDto). */
const PAGE = 100;

type Filter = 'ALL' | AssessmentStatus;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'DRAFT', label: 'Draft' },
  { id: 'READY_FOR_REVIEW', label: 'Ready for Review' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'PUBLISHED', label: 'Published' },
];

/**
 * The placement assessments. Staff author them here; the one that is ACTIVE (published) is the assessment the mobile app offers learners during onboarding.
 *
 * The page loads the assessments once (the list route's own pages of up to 100) and search and the status filter run over what is loaded, so changing the filter asks the server for nothing. The
 * total the server reports is always exact; the other counts (drafts, awaiting approval, per-status) are exact only once every assessment is loaded, and are shown as "at least" until then, with
 * "Load more". Statuses and versions are shown exactly as the backend returns them: the working-copy status and version (what staff edit) are separate from the published version learners get.
 */
export default function AssessmentsPage() {
  const { user } = useAuth();
  const searchId = useId();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';
  const [items, setItems] = useState<AssessmentSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Filter>('ALL');
  const run = useRef(0);
  const radios = useRef<(HTMLButtonElement | null)[]>([]);

  const load = useCallback(async () => {
    const mine = ++run.current;
    setError(null);
    try {
      const res = await assessmentsApi.list({ limit: PAGE });
      if (mine === run.current) {
        setItems(res.items);
        setTotal(res.total);
      }
    } catch (err: unknown) {
      if (mine === run.current) setError(describeError(err, 'The assessments could not be loaded.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!items) return;
    const mine = run.current;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await assessmentsApi.list({ limit: PAGE, offset: items.length });
      if (mine !== run.current) return;
      setItems((current) => [...(current ?? []), ...res.items.filter((a) => !(current ?? []).some((c) => c.id === a.id))]);
      setTotal(res.total);
    } catch (err: unknown) {
      if (mine === run.current) setError(describeError(err, 'More assessments could not be loaded.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const loaded = items ?? [];
  const complete = items !== null && loaded.length >= total;
  const active = loaded.find((a) => a.activePublishedVersion !== null) ?? null;
  const term = search.trim().toLowerCase();
  const searched = loaded.filter((a) => term === '' || a.title.toLowerCase().includes(term));
  const matches = searched.filter((a) => status === 'ALL' || a.status === status);
  const countOf = (id: Filter) => (id === 'ALL' ? searched.length : searched.filter((a) => a.status === id).length);
  const counts = {
    complete,
    loaded: loaded.length,
    total,
    drafts: loaded.filter((a) => a.status === 'DRAFT').length,
    awaiting: loaded.filter((a) => a.status === 'READY_FOR_REVIEW').length,
  };

  const onKeys = (event: React.KeyboardEvent, index: number) => {
    const count = FILTERS.length;
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % count : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index + count - 1) % count : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    setStatus(FILTERS[next].id);
    radios.current[next]?.focus();
  };

  const createLink = canWrite ? (
    <Link href="/assessments/new" className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
      <Icon name="plus" />
      Create Assessment
    </Link>
  ) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-slate-900">Assessments</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-slate-700">Manage placement assessments that help learners discover their recommended learning level.</p>
        </div>
        {createLink && <div className="self-start sm:self-auto">{createLink}</div>}
      </div>

      <p className="flex items-start gap-2 text-sm text-slate-700">
        <Icon name="info" className="mt-0.5 h-4 w-4 text-slate-500" />
        <span>Only one assessment can be active for learners at a time. Publishing a new assessment replaces the previous active version.</span>
      </p>
      {!canWrite && <p className="text-xs text-slate-600">Your role can view assessments but not create or edit them.</p>}

      {error && items !== null && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <span>{error}</span>
          <button type="button" className="shrink-0 rounded-lg border border-rose-300 bg-white px-3 py-1 font-medium hover:bg-rose-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500" onClick={() => void loadMore()}>
            Try again
          </button>
        </div>
      )}

      {items === null && !error ? (
        <LoadingSpinner text="Loading assessments..." />
      ) : items === null ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}{' '}
          <button type="button" className="font-medium underline" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <OverviewCards counts={counts} active={active} />
          <ActiveSummary active={active} complete={complete} canWrite={canWrite} />

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1 basis-64">
              <label htmlFor={searchId} className="sr-only">
                Search assessments by title
              </label>
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                id={searchId}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search assessments by title..."
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 placeholder-slate-500 focus:border-amber-600 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 [&::-webkit-search-cancel-button]:hidden"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                  <Icon name="close" />
                </button>
              )}
            </div>
            <div role="radiogroup" aria-label="Filter by working-copy status" className="inline-flex flex-wrap rounded-lg border border-slate-300 bg-slate-100 p-0.5">
              {FILTERS.map((filter, index) => (
                <button
                  key={filter.id}
                  ref={(element) => {
                    radios.current[index] = element;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={status === filter.id}
                  tabIndex={status === filter.id ? 0 : -1}
                  onClick={() => setStatus(filter.id)}
                  onKeyDown={(event) => onKeys(event, index)}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${status === filter.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-700 hover:text-slate-900'}`}
                >
                  {filter.label}
                  {complete && <span className="text-xs font-normal text-slate-600">{countOf(filter.id)}</span>}
                </button>
              ))}
            </div>
          </div>

          <p className="text-sm text-slate-700" aria-live="polite">
            {complete ? `${matches.length} ${matches.length === 1 ? 'assessment' : 'assessments'}` : `${matches.length} of the ${loaded.length} loaded assessments (${total} in all)`}
            {term !== '' && ` matching “${search.trim()}”`}
            {status !== 'ALL' && ` · ${FILTERS.find((f) => f.id === status)?.label}`}
          </p>
          {!complete && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700">
              Search and the status filter cover the {loaded.length} assessments loaded so far, not all {total}. Load more to include the rest.
            </p>
          )}

          {loaded.length === 0 ? (
            <EmptyState title="No assessments yet" description="Create the first assessment to recommend a starting level to new learners." action={createLink ?? undefined} />
          ) : matches.length === 0 ? (
            <EmptyState
              title={term !== '' ? 'No assessments match your search' : 'No assessments with this status'}
              description={term !== '' ? `No assessment title contains “${search.trim()}”${status !== 'ALL' ? ' with this status' : ''}.` : 'Choose another status.'}
              action={
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setStatus('ALL');
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  Clear search and filter
                </button>
              }
            />
          ) : (
            <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2" aria-label="Assessments">
              {matches.map((a) => (
                <li key={a.id}>
                  <AssessmentCard assessment={a} canWrite={canWrite} />
                </li>
              ))}
            </ul>
          )}

          {!complete && (
            <div className="text-center">
              <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                {loadingMore ? 'Loading…' : `Load more (${total - loaded.length} left)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
