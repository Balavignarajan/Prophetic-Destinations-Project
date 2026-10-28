'use client';

import React, { useId } from 'react';
import { FILTER_TYPES, type LibraryFilters, type LibrarySummary, RECENT_DAYS, SORT_LABEL, type SortKey, LIBRARY_LEVELS, hasActiveFilters } from '../../lib/reusable-library';
import { levelName } from '../../lib/reusable-blocks';
import type { LearningLevel } from '../../lib/types';
import Icon from '../quizzes/icons';

export type ViewMode = 'grid' | 'list';

function Card({ label, value, note }: { label: string; value: React.ReactNode; note: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs text-slate-600">{note}</p>
    </div>
  );
}

/** Four compact figures over the COMPLETE library (every block is loaded before they are shown), so none of them is a count of a first page. */
export function SummaryCards({ summary }: { summary: LibrarySummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Reusable block library summary">
      <Card label="Total Reusable Blocks" value={summary.total} note="In your library" />
      <Card label="Block Types in Use" value={summary.typesInUse} note={summary.typesInUse === 1 ? 'Kind of block saved' : 'Kinds of block saved'} />
      <Card label="Available for Beginner" value={summary.beginner} note={`Intermediate ${summary.intermediate} · Advanced ${summary.advanced}`} />
      <Card label="Recently Updated" value={summary.recent} note={`Changed in the last ${RECENT_DAYS} days`} />
    </div>
  );
}

const SELECT = 'min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40';

/**
 * Search, block type, learning level, sort and the grid / list switch, then the line that says how many blocks match. They all work together over the complete library and change nothing on the
 * server. A block matches a learning level when it is visible at that level (the levels it was saved with).
 */
export function LibraryToolbar({
  filters,
  onChange,
  onClear,
  shown,
  total,
  view,
  onView,
  searchRef,
}: {
  filters: LibraryFilters;
  onChange: (change: Partial<LibraryFilters>) => void;
  onClear: () => void;
  shown: number;
  total: number;
  view: ViewMode;
  onView: (view: ViewMode) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const searchId = useId();
  const typeId = useId();
  const levelId = useId();
  const sortId = useId();
  const active = hasActiveFilters(filters);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-0 flex-1 basis-64">
          <label htmlFor={searchId} className="sr-only">
            Search reusable blocks by name
          </label>
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            value={filters.search}
            onChange={(event) => onChange({ search: event.target.value })}
            placeholder="Search by name..."
            autoComplete="off"
            className="min-h-10 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 placeholder-slate-500 focus:border-amber-600 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 [&::-webkit-search-cancel-button]:hidden"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => {
                onChange({ search: '' });
                searchRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <Icon name="close" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={typeId} className="text-xs font-semibold text-slate-700">
            Block type
          </label>
          <select id={typeId} value={filters.type} onChange={(event) => onChange({ type: event.target.value })} className={SELECT}>
            <option value="">All Types</option>
            {FILTER_TYPES.map((block) => (
              <option key={block.type} value={block.type}>
                {block.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={levelId} className="text-xs font-semibold text-slate-700">
            Learning level
          </label>
          <select id={levelId} value={filters.level} onChange={(event) => onChange({ level: event.target.value as '' | LearningLevel })} className={SELECT}>
            <option value="">All Levels</option>
            {LIBRARY_LEVELS.map((level) => (
              <option key={level} value={level}>
                {levelName(level)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={sortId} className="text-xs font-semibold text-slate-700">
            Sort by
          </label>
          <select id={sortId} value={filters.sort} onChange={(event) => onChange({ sort: event.target.value as SortKey })} className={SELECT}>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABEL[key]}
              </option>
            ))}
          </select>
        </div>

        <div role="radiogroup" aria-label="Library view" className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5">
          {(['grid', 'list'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={view === mode}
              onClick={() => onView(mode)}
              className={`min-h-9 rounded-md px-3 py-1.5 text-sm font-medium focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${view === mode ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-700 hover:text-slate-900'}`}
            >
              {mode === 'grid' ? 'Grid' : 'List'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-slate-700" aria-live="polite">
          {active ? `${shown} of ${total} reusable ${total === 1 ? 'block' : 'blocks'}` : `${total} reusable ${total === 1 ? 'block' : 'blocks'}`}
        </p>
        {active && (
          <button type="button" onClick={onClear} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
}
