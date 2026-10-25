'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';
import { entryOptionLabel, homeEntryErrorMessage } from '../lib/home-entries';
import type { HomeEntry } from '../lib/types';

interface Props {
  /** The Home Entry id the course belongs to, or null for none. */
  value: string | null;
  onChange: (homeEntryId: string | null) => void;
  disabled?: boolean;
  /** Makes the element id unique when the field is on a page with another copy of it. */
  id?: string;
}

const FIELD = 'w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 disabled:opacity-60';
const LINK = 'font-medium text-amber-900 underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

/**
 * "Home Entry (optional)" in the course forms: which learner Home topic the course is listed under. The options are the Home Entries that exist in the CMS right now (read from the
 * backend each time the form opens; nothing is built in), plus None for an ordinary course. Many courses may share one entry. Choosing an entry here is a classification, not a content
 * edit: it does not change the course's status or publication. If the list cannot be loaded the form still works: the course keeps its current entry, and the list can be reloaded.
 */
export default function CourseHomeEntryField({ value, onChange, disabled = false, id = 'course-home-entry' }: Props) {
  const [entries, setEntries] = useState<HomeEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .request<{ items: HomeEntry[] }>('/admin/home-entries')
      .then((res) => !cancelled && setEntries(res.items))
      .catch((err: unknown) => !cancelled && setError(homeEntryErrorMessage(err, 'Could not load the Home Entries.')));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const loading = entries === null && error === null;
  // The course's current entry is always an option, even before (or without) the list: the select never looks empty for a course that has one.
  const missingCurrent = value !== null && !(entries ?? []).some((entry) => entry.id === value);

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
        Home Entry (Optional)
      </label>
      <select
        id={id}
        value={value ?? ''}
        disabled={disabled || loading}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        aria-describedby={`${id}-help`}
        className={FIELD}
      >
        <option value="">{loading ? 'Loading Home Entries…' : 'None (ordinary course)'}</option>
        {missingCurrent && value !== null && <option value={value}>Current Home Entry</option>}
        {(entries ?? []).map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entryOptionLabel(entry)}
          </option>
        ))}
      </select>
      <p id={`${id}-help`} className="mt-1.5 text-xs text-slate-600">
        The topic on the learner Home screen this course is listed under. Learners see it there only once the course is published at their level; changing only this does not change the
        course&apos;s status or publication. Manage the list in{' '}
        <Link href="/home-entries" target="_blank" rel="noopener" className={LINK}>
          Home Entries (new tab)
        </Link>
        .
      </p>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-rose-800">
          {error}{' '}
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={LINK}>
            Try again
          </button>
        </p>
      )}
      {entries !== null && entries.length === 0 && (
        <p role="status" className="mt-1.5 text-xs text-slate-700">
          There are no Home Entries yet. Create one in Home Entries, then{' '}
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={LINK}>
            refresh this list
          </button>
          .
        </p>
      )}
    </div>
  );
}
