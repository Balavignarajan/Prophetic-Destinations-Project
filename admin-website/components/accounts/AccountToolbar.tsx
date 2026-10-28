'use client';

import React, { useId } from 'react';
import { type AccountFilters, type RoleFilter, ROLES, ROLE_LABEL, SORT_LABEL, type SortKey, type StatusFilter, hasActiveFilters } from '../../lib/accounts';
import Icon from '../quizzes/icons';

/**
 * Search, filters and sort for the staff list, and the line that says how many accounts match. They work together over the complete list of accounts (the page loads every account before it
 * offers them), so a search never covers only a first page. Changing any of them changes nothing on the server.
 */
const SELECT = 'min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40';

export default function AccountToolbar({
  filters,
  onChange,
  onClear,
  shown,
  total,
  searchRef,
}: {
  filters: AccountFilters;
  onChange: (change: Partial<AccountFilters>) => void;
  onClear: () => void;
  shown: number;
  total: number;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const searchId = useId();
  const roleId = useId();
  const statusId = useId();
  const sortId = useId();
  const active = hasActiveFilters(filters);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-0 flex-1 basis-64">
          <label htmlFor={searchId} className="sr-only">
            Search staff by email
          </label>
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            value={filters.search}
            onChange={(event) => onChange({ search: event.target.value })}
            placeholder="Search staff by email..."
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
          <label htmlFor={roleId} className="text-xs font-semibold text-slate-700">
            Role
          </label>
          <select id={roleId} value={filters.role} onChange={(event) => onChange({ role: event.target.value as RoleFilter })} className={SELECT}>
            <option value="ALL">All Roles</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={statusId} className="text-xs font-semibold text-slate-700">
            Status
          </label>
          <select id={statusId} value={filters.status} onChange={(event) => onChange({ status: event.target.value as StatusFilter })} className={SELECT}>
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DISABLED">Disabled</option>
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
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-slate-700" aria-live="polite">
          {active ? `${shown} of ${total} staff ${total === 1 ? 'account' : 'accounts'}` : `${total} staff ${total === 1 ? 'account' : 'accounts'}`}
        </p>
        {active && (
          <button type="button" onClick={onClear} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
