'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ConsistencyReport } from '../../lib/types';
import { LoadingSpinner } from '../../components/ui';

export default function PublishingPage() {
  const { user } = useAuth();
  const [report, setReport] = useState<ConsistencyReport | null>(null);
  const [lastScannedAt, setLastScannedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifySnapshots, setVerifySnapshots] = useState(false);

  const fetchConsistency = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await api.request<ConsistencyReport>(
        `/admin/publishing/consistency?verifySnapshots=${verifySnapshots}&limit=100`
      );
      setReport(res);
      setLastScannedAt(new Date().toLocaleTimeString());
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to generate publication consistency report.');
    } finally {
      setLoading(false);
    }
  }, [verifySnapshots]);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchConsistency();
    }
  }, [user?.role, fetchConsistency]);

  if (user?.role !== 'ADMIN') {
    return (
      <div className="p-8 text-center bg-white border border-slate-200 rounded-xl">
        <h3 className="text-base font-semibold text-slate-800">
          Access Restricted
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Catalog publishing consistency audit is restricted to administrators only.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-serif text-2xl font-bold text-slate-900">
            Publishing Consistency & Integrity
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            System-wide catalog audit checking invariant consistency, hashes, and snapshot integrity.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={verifySnapshots}
              onChange={(e) => setVerifySnapshots(e.target.checked)}
              className="rounded-sm border-slate-300 text-slate-900 focus:ring-amber-500"
            />
            Verify Snapshot Hashes (Deep Scan)
          </label>

          <button
            onClick={fetchConsistency}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold bg-slate-950 hover:bg-slate-800 text-white rounded-lg shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Run Audit
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSpinner text="Running system consistency scan across published catalog..." />
      ) : report ? (
        <div className="space-y-6">
          {/* Consistency Badge / Metric Overview */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Global State Status
                </span>
                <div className="flex items-center gap-3 mt-1.5">
                  {report.consistent ? (
                    <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-sm font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      All Invariants Consistent
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-sm font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                      {report.issues.length} Consistency Issues Detected
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-xs text-slate-500">
                <div>
                  <div className="font-semibold text-slate-700 text-sm">{report.issues.length}</div>
                  <div>Issues Found</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-700 text-sm">{report.limitPerCheck}</div>
                  <div>Limit Per Check</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-700 text-sm">
                    {report.snapshotsVerified ? 'Deep Verified' : 'Fast Scan'}
                  </div>
                  <div>Snapshots</div>
                </div>
                <div>
                  <div className="font-mono text-slate-700 text-sm">{lastScannedAt || '—'}</div>
                  <div>Scan Timestamp</div>
                </div>
              </div>
            </div>

            {report.truncated && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                Notice: At least one invariant check reached its configured issue limit ({report.limitPerCheck}). Additional issues may exist.
              </div>
            )}
          </div>

          {/* Details / Findings */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-serif text-base font-bold text-slate-900">
                Audit Findings
              </h3>
              <span className="text-xs text-slate-500 font-medium">
                {report.issues.length} issue{report.issues.length === 1 ? '' : 's'} recorded
              </span>
            </div>

            {report.issues.length === 0 ? (
              <div className="p-8 bg-slate-50 border border-slate-200/80 rounded-xl text-center">
                <svg className="w-8 h-8 text-emerald-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-semibold text-slate-800">No Invariant Violations</p>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                  Every published course catalog, lesson snapshot, and learning-level resolution conforms strictly to canonical publishing integrity rules.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Invariant Code</th>
                      <th className="px-4 py-3">Lesson ID</th>
                      <th className="px-4 py-3">Publication ID</th>
                      <th className="px-4 py-3">Level</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {report.issues.map((issue, idx) => (
                      <tr key={`${issue.code}-${issue.lessonId}-${idx}`} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-semibold text-rose-700">
                          {issue.code}
                        </td>
                        <td className="px-4 py-3 text-slate-800 truncate max-w-xs" title={issue.lessonId}>
                          {issue.lessonId}
                        </td>
                        <td className="px-4 py-3 text-slate-500 truncate max-w-xs" title={issue.publicationId || ''}>
                          {issue.publicationId || '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-sans">
                          {issue.level || 'All'}
                        </td>
                        <td className="px-4 py-3 text-right font-sans">
                          <Link
                            href={`/lessons/${issue.lessonId}`}
                            className="text-amber-700 hover:text-amber-900 font-medium underline"
                          >
                            Inspect Lesson &rarr;
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
      ) : null}
    </div>
  );
}
