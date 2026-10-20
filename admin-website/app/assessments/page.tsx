'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../lib/auth';
import { type AssessmentStatus, type AssessmentSummary, assessmentsApi, describeError, formatWhen } from '../../lib/assessments';
import { EmptyState, LoadingSpinner, StatusBadge } from '../../components/ui';

const STATUSES: AssessmentStatus[] = ['DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED'];

/**
 * The placement assessments. Staff author them here; the one that is ACTIVE (published) is the assessment the mobile app offers learners during onboarding.
 * Statuses and versions are shown exactly as the backend returns them: the working-copy version (what staff edit) is separate from the published version learners get.
 */
export default function AssessmentsPage() {
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';
  const [items, setItems] = useState<AssessmentSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AssessmentStatus | ''>('');
  const run = useRef(0);

  const load = useCallback(async () => {
    const mine = ++run.current;
    setError(null);
    try {
      const res = await assessmentsApi.list({ limit: 100, ...(status ? { status } : {}) });
      if (mine === run.current) {
        setItems(res.items);
        setTotal(res.total);
      }
    } catch (err: unknown) {
      if (mine === run.current) setError(describeError(err, 'The assessments could not be loaded.'));
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = items?.find((a) => a.activePublishedVersion !== null) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-serif text-2xl font-bold text-slate-900">Assessments</h1>
          <p className="text-sm text-slate-700 mt-0.5 max-w-2xl">
            The optional placement assessment that recommends a learning level. One assessment is active for learners at a time; publishing another replaces it.
          </p>
        </div>
        {canWrite && (
          <Link href="/assessments/new" className="px-4 py-2.5 text-sm font-medium bg-slate-950 hover:bg-slate-800 text-white rounded-lg shadow-xs self-start sm:self-auto">
            Create Assessment
          </Link>
        )}
      </div>

      {items && !status && (
        <p role="status" className={`text-sm rounded-lg border p-3 ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          {active ? <>Active for learners: <strong>{active.title}</strong>, published version {active.activePublishedVersion}.</> : <>No assessment is active. The app will not offer an assessment until one is published.</>}
        </p>
      )}

      <div className="flex items-center gap-2">
        <label htmlFor="as-status-filter" className="text-xs font-semibold uppercase tracking-wider text-slate-700">Status</label>
        <select id="as-status-filter" value={status} onChange={(e) => { setItems(null); setStatus(e.target.value as AssessmentStatus | ''); }} className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm">
          <option value="">All</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>)}
        </select>
      </div>

      <div aria-live="polite">
        {error ? (
          <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
            {error} <button type="button" className="underline font-medium" onClick={() => { setItems(null); void load(); }}>Try again</button>
          </div>
        ) : items === null ? (
          <LoadingSpinner text="Loading assessments..." />
        ) : items.length === 0 ? (
          <EmptyState
            title={status ? 'No assessments with this status' : 'No assessments yet'}
            description={status ? 'Choose another status.' : 'Create the first assessment to recommend a starting level to new learners.'}
            action={canWrite && !status ? <Link href="/assessments/new" className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg">Create Assessment</Link> : undefined}
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <caption className="sr-only">Assessments ({total})</caption>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-600 border-b border-slate-200">
                  <th scope="col" className="p-3 font-semibold">Assessment</th>
                  <th scope="col" className="p-3 font-semibold">Status</th>
                  <th scope="col" className="p-3 font-semibold">Working copy</th>
                  <th scope="col" className="p-3 font-semibold">Active for learners</th>
                  <th scope="col" className="p-3 font-semibold">Questions</th>
                  <th scope="col" className="p-3 font-semibold">Updated</th>
                  <th scope="col" className="p-3 font-semibold"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className="p-3">
                      <Link href={`/assessments/${a.id}`} className="font-semibold text-slate-900 hover:text-amber-700 break-words">{a.title}</Link>
                      {!a.scoringConfigured && <p className="text-xs text-amber-800 mt-0.5">Scoring not configured</p>}
                    </td>
                    <td className="p-3"><StatusBadge status={a.status} /></td>
                    <td className="p-3 font-mono text-xs text-slate-700">v{a.version}</td>
                    <td className="p-3">
                      {a.activePublishedVersion !== null ? <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">Published v{a.activePublishedVersion}</span> : <span className="text-slate-600">{a.latestPublishedVersion !== null ? `Not active (last v${a.latestPublishedVersion})` : 'Never published'}</span>}
                    </td>
                    <td className="p-3">{a.questionCount}</td>
                    <td className="p-3 text-slate-700">{formatWhen(a.updatedAt)}</td>
                    <td className="p-3 text-right">
                      <Link href={`/assessments/${a.id}`} className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">
                        {canWrite ? 'Open / Edit' : 'View'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
