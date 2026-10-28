'use client';

import React from 'react';
import Link from 'next/link';
import { type AssessmentSummary, formatWhen } from '../../lib/assessments';
import { StatusBadge } from '../ui';
import Icon from '../quizzes/icons';

/**
 * The presentation of the Assessments listing: the four overview cards, the compact "active for learners" summary and one card per assessment. They show what the list route returns and nothing
 * else (no request of their own). WORKING COPY AND LEARNERS ARE TWO SEPARATE THINGS and are always shown separately: the status badge and version are the editable working copy; "Active for
 * learners" is the immutable published version the app gives learners, which can be older than the working copy (a Draft working copy can sit beside an active published version).
 */
export interface Counts {
  /** True when every assessment is loaded, so the counts below are exact; otherwise they are counts among the loaded ones and are shown as "at least". */
  complete: boolean;
  loaded: number;
  total: number;
  drafts: number;
  awaiting: number;
}

function Stat({ label, value, note, tone = 'plain' }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: 'plain' | 'active' | 'idle' }) {
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-xs ${tone === 'active' ? 'border-emerald-200' : 'border-slate-200'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-600">{note}</p>}
    </div>
  );
}

export function OverviewCards({ counts, active }: { counts: Counts; active: AssessmentSummary | null }) {
  const approx = (n: number) => (counts.complete ? String(n) : `${n}+`);
  const partialNote = counts.complete ? undefined : `Among the ${counts.loaded} loaded`;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Assessments overview">
      <Stat label="Total Assessments" value={counts.total} />
      <Stat
        label="Active for Learners"
        tone={active ? 'active' : 'idle'}
        value={active ? <span className="text-base">Yes</span> : counts.complete ? <span className="text-base text-slate-700">None</span> : <span className="text-base text-slate-700">Not found yet</span>}
        note={active ? <span className="line-clamp-1">{active.title}</span> : counts.complete ? 'Nothing is offered to learners' : 'Load more to check the rest'}
      />
      <Stat label="Drafts" value={approx(counts.drafts)} note={partialNote ?? 'Working copy is a Draft'} />
      <Stat label="Awaiting Approval" value={approx(counts.awaiting)} note={partialNote ?? 'Ready for review'} />
    </div>
  );
}

export function ActiveSummary({ active, complete, canWrite }: { active: AssessmentSummary | null; complete: boolean; canWrite: boolean }) {
  if (active) {
    return (
      <section aria-label="Active for learners" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
        <p className="text-sm text-slate-900">
          <span className="font-semibold text-emerald-900">Active for learners:</span> {active.title} <span aria-hidden="true">&mdash;</span> <span className="font-medium">Published version {active.activePublishedVersion}</span>
        </p>
        <Link href={`/assessments/${active.id}`} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
          {canWrite ? 'Open' : 'View'}
          <Icon name="chevron" className="h-3 w-3" />
        </Link>
      </section>
    );
  }
  return (
    <section aria-label="Active for learners" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
      {complete ? (
        <>
          <span className="font-semibold text-slate-900">No assessment is active.</span> The app will not offer an assessment until one is published.
        </>
      ) : (
        <>No active assessment was found among the assessments loaded so far. Load more to check the rest.</>
      )}
    </section>
  );
}

export function AssessmentCard({ assessment: a, canWrite }: { assessment: AssessmentSummary; canWrite: boolean }) {
  const isActive = a.activePublishedVersion !== null;
  return (
    <article className={`relative flex h-full flex-col rounded-xl border bg-white p-4 shadow-xs transition hover:shadow-md motion-reduce:transition-none ${isActive ? 'border-emerald-200' : 'border-slate-200'}`}>
      {isActive && <span aria-hidden="true" className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-emerald-500" />}
      <h3 className="text-base font-semibold text-slate-900 wrap-break-word">
        <Link href={`/assessments/${a.id}`} className="hover:text-amber-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
          {a.title}
        </Link>
      </h3>

      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <dt className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Working copy</dt>
          <dd className="flex items-center gap-2">
            <StatusBadge status={a.status} />
            <span className="font-mono text-xs text-slate-700">v{a.version}</span>
          </dd>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <dt className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Learners</dt>
          <dd>
            {isActive ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                Active · Published v{a.activePublishedVersion}
              </span>
            ) : (
              <span className="text-xs text-slate-700">{a.latestPublishedVersion !== null ? `Not active (last published v${a.latestPublishedVersion})` : 'Not active · never published'}</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-700">
        <span>
          <strong className="font-semibold text-slate-900">{a.questionCount}</strong> {a.questionCount === 1 ? 'question' : 'questions'}
        </span>
        <span>Updated {formatWhen(a.updatedAt)}</span>
        {!a.scoringConfigured && (
          <span className="inline-flex items-center gap-1 font-medium text-amber-900">
            <Icon name="alert" className="h-3.5 w-3.5" />
            Scoring not configured
          </span>
        )}
      </div>

      <div className="mt-auto pt-4">
        <Link href={`/assessments/${a.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
          {canWrite ? 'Open Assessment' : 'View Assessment'}
          <Icon name="chevron" className="h-3 w-3" />
        </Link>
      </div>
    </article>
  );
}
