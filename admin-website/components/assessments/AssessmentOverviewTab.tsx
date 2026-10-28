'use client';

import React, { useMemo } from 'react';
import { questionIssues } from '../../lib/assessment-builder';
import { type AssessmentDetail, LIMITS, formatWhen } from '../../lib/assessments';
import { StatusBadge } from '../ui';
import Icon from '../quizzes/icons';
import type { AssessmentEditor } from './useAssessmentEditor';

/**
 * The "Overview" tab: the assessment's title and instructions (the only fields on this tab), then a readable summary of where it stands: its working-copy status and version, which published version
 * learners get, how many questions are complete, and what the scoring is set to. The summary reads the working copy being edited (so it follows unsaved edits) together with what the server says about
 * its status and publications; it changes nothing.
 */
const CARD = 'rounded-xl border border-slate-200 bg-white p-5 shadow-xs';
const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-500 focus:border-amber-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 disabled:bg-slate-50 disabled:opacity-60';
const FIELD_ERROR = 'border-rose-400 focus:border-rose-500 focus:ring-rose-300';
const LABEL = 'block text-sm font-semibold text-slate-900';

function Tile({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-slate-900">{children}</dd>
      {note && <p className="mt-0.5 text-xs text-slate-600">{note}</p>}
    </div>
  );
}

const LINK = 'font-medium text-slate-900 underline focus:outline-hidden focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-amber-500';

export default function AssessmentOverviewTab({
  editor,
  detail,
  readOnly,
  issueCount,
  onPreview,
  onOpenTab,
}: {
  editor: AssessmentEditor;
  detail: AssessmentDetail | null;
  readOnly: boolean;
  /** How many things the editor finds missing before the working copy can be previewed or published. */
  issueCount: number;
  onPreview: () => void;
  onOpenTab: (tab: 'questions' | 'scoring' | 'publishing') => void;
}) {
  const { state, attempted } = editor;
  const disabled = readOnly || editor.saving;
  const title = state.title.trim();
  const complete = useMemo(() => state.questions.filter((q, qi) => questionIssues(q, qi).length === 0).length, [state.questions]);
  const total = state.questions.length;
  const s = state.scoring;
  const active = detail?.activePublication ?? null;

  return (
    <div className="space-y-6">
      <section className={`${CARD} space-y-4`} aria-labelledby="as-basics">
        <h2 id="as-basics" className="text-lg font-semibold text-slate-900">
          Details
        </h2>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="as-title" className={LABEL}>
              Title <span className="text-rose-700">*</span>
            </label>
            <span className={`text-xs tabular-nums ${title.length > LIMITS.titleMax ? 'font-semibold text-rose-800' : 'text-slate-600'}`} aria-hidden="true">
              {title.length} / {LIMITS.titleMax}
            </span>
          </div>
          <input
            id="as-title"
            value={state.title}
            disabled={disabled}
            maxLength={LIMITS.titleMax * 2}
            aria-invalid={(attempted && title === '') || title.length > LIMITS.titleMax || undefined}
            onChange={(event) => editor.patch({ title: event.target.value })}
            placeholder="e.g. Bible Prophecy Foundations"
            className={`${FIELD} ${(attempted && title === '') || title.length > LIMITS.titleMax ? FIELD_ERROR : ''}`}
          />
          {attempted && title === '' && <p className="text-xs font-medium text-rose-800">The title is required.</p>}
          {title.length > LIMITS.titleMax && <p className="text-xs font-medium text-rose-800">The title can be at most {LIMITS.titleMax} characters.</p>}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="as-description" className={LABEL}>
              Instructions <span className="font-normal text-slate-600">(optional)</span>
            </label>
            <span className={`text-xs tabular-nums ${state.description.trim().length > LIMITS.descriptionMax ? 'font-semibold text-rose-800' : 'text-slate-600'}`} aria-hidden="true">
              {state.description.trim().length} / {LIMITS.descriptionMax}
            </span>
          </div>
          <textarea id="as-description" rows={4} value={state.description} disabled={disabled} onChange={(event) => editor.patch({ description: event.target.value })} placeholder="Shown to learners before the first question." className={`${FIELD} ${state.description.trim().length > LIMITS.descriptionMax ? FIELD_ERROR : ''}`} />
          {state.description.trim().length > LIMITS.descriptionMax && <p className="text-xs font-medium text-rose-800">The instructions can be at most {LIMITS.descriptionMax} characters.</p>}
        </div>
      </section>

      <section aria-labelledby="as-ov-status" className="space-y-3">
        <h2 id="as-ov-status" className="text-lg font-semibold text-slate-900">
          Where it stands
        </h2>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Working copy">{detail ? <StatusBadge status={detail.status} /> : <span className="text-base">New, not saved yet</span>}</Tile>
          <Tile label="Working-copy version">{detail ? <span className="font-mono">v{detail.version}</span> : <span className="text-base">—</span>}</Tile>
          <Tile label="Questions" note={total > 0 ? `${complete} of ${total} complete` : undefined}>
            {total}
          </Tile>
          <Tile label="Last updated">
            <span className="text-base">{detail ? formatWhen(detail.updatedAt) : '—'}</span>
          </Tile>
        </dl>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className={`${CARD} space-y-1.5`}>
            <h3 className="text-sm font-semibold text-slate-900">Active for learners</h3>
            {active ? (
              <>
                <p className="flex items-center gap-2 text-sm text-slate-900">
                  <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">Published v{active.version}</span>
                  <span className="text-slate-700">since {formatWhen(active.publishedAt)}</span>
                </p>
                <p className="text-xs text-slate-700">Learners receive this immutable published version. Editing the working copy never changes it.</p>
              </>
            ) : (
              <p className="text-sm text-slate-700">
                {detail ? (detail.latestPublishedVersion !== null ? `Not active for learners (last published version: v${detail.latestPublishedVersion}).` : 'Not active for learners. This assessment has never been published.') : 'Not active for learners. A new assessment starts as a Draft.'}
              </p>
            )}
            {detail && (
              <p className="text-xs text-slate-700">
                Review, approval and the published versions are in{' '}
                <button type="button" onClick={() => onOpenTab('publishing')} className={LINK}>
                  Publishing
                </button>
                .
              </p>
            )}
          </div>

          <div className={`${CARD} space-y-1.5`}>
            <h3 className="text-sm font-semibold text-slate-900">Configuration</h3>
            <ul className="space-y-1 text-sm text-slate-800">
              <li className="flex items-center gap-1.5">
                <Icon name={s.enabled ? 'check' : 'alert'} className={`h-4 w-4 ${s.enabled ? 'text-emerald-700' : 'text-amber-700'}`} />
                {s.enabled ? 'Scoring is configured' : 'Scoring is not configured (needed before it can be published)'}
              </li>
              {s.enabled && (
                <>
                  <li className="pl-5.5 text-slate-700">Ties: {s.tieBreak === 'LOWER_LEVEL' ? 'recommend the lower level' : s.tieBreak === 'HIGHER_LEVEL' ? 'recommend the higher level' : 'not chosen yet'}</li>
                  <li className="pl-5.5 text-slate-700">Questions: {s.requireAll === 'yes' ? 'every question must be answered' : s.requireAll === 'no' ? 'learners may skip questions' : 'not chosen yet'}</li>
                </>
              )}
            </ul>
            <p className="text-xs text-slate-600">
              The scoring model is provisional. Change these in the{' '}
              <button type="button" onClick={() => onOpenTab('scoring')} className={LINK}>
                Scoring tab
              </button>
              .
            </p>
          </div>
        </div>

        <div className={`${CARD} flex flex-wrap items-center justify-between gap-3`}>
          <div className="min-w-0 flex-1 basis-72 space-y-0.5">
            <h3 className="text-sm font-semibold text-slate-900">See it as a learner</h3>
            <p className="text-xs text-slate-700">
              {issueCount === 0
                ? 'The preview plays the assessment in a phone, from this working copy including unsaved changes, and shows the suggested level it would give. Nothing is saved, sent or published.'
                : `${issueCount} ${issueCount === 1 ? 'thing needs' : 'things need'} attention before this can be previewed. The preview lists them and takes you to each one.`}
            </p>
            {total > 0 && complete < total && (
              <p className="text-xs text-slate-700">
                {total - complete} of {total} {total === 1 ? 'question is' : 'questions are'} incomplete; see{' '}
                <button type="button" onClick={() => onOpenTab('questions')} className={LINK}>
                  Questions
                </button>
                .
              </p>
            )}
          </div>
          <button type="button" onClick={onPreview} aria-haspopup="dialog" className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            <Icon name="phone" />
            Preview Assessment
          </button>
        </div>

        <p className="text-xs text-slate-700">
          This page edits the <strong>working copy</strong>. Learners receive an immutable <strong>published version</strong>; editing never changes it, and saving returns this copy to Draft.
          {readOnly && ' Your role can read but not change assessments.'}
        </p>
      </section>
    </div>
  );
}
