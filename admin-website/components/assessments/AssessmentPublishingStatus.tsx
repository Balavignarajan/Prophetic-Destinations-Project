'use client';

import React from 'react';
import { type AssessmentDetail, STATUS_LABEL, formatWhen } from '../../lib/assessments';
import { StatusBadge } from '../ui';

/**
 * The two things that are easy to mix up, side by side and never merged:
 *
 *  - the WORKING COPY: the version staff edit, review and approve. It has a workflow status and a version (the edit counter the server uses to refuse a stale save), and it may have unsaved edits in the
 *    editor that are not part of it yet.
 *  - ACTIVE FOR LEARNERS: the published version the mobile app gives learners. It is immutable (editing never changes it) and has its own version number (1, 2, ...), the order of publishing. It can be
 *    older than the working copy: a Draft working copy can sit beside an active published version.
 *
 * Everything shown is what the server returned for this assessment (`status`, `version`, `activePublication`, `latestPublishedVersion`) or the editor's own "unsaved changes" flag; nothing is derived or
 * invented. The sentence between them says what the two numbers mean together.
 */
const CARD = 'rounded-xl border bg-white p-5 shadow-xs';
const LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-slate-600';

export function relationSentence(detail: AssessmentDetail): string {
  const active = detail.activePublication;
  if (active && detail.status === 'PUBLISHED') return `The working copy is the published version learners receive now (published version ${active.version}). Editing it will return it to Draft, and learners will keep published version ${active.version}.`;
  if (active) return `The working copy (v${detail.version}) is ${STATUS_LABEL[detail.status]}, while learners still receive published version ${active.version}. Learners get a new version only when the working copy is approved and published.`;
  if (detail.latestPublishedVersion !== null) return `Learners receive nothing from this assessment now: published version ${detail.latestPublishedVersion} is no longer active. The working copy (v${detail.version}) is ${STATUS_LABEL[detail.status]}.`;
  return `This assessment has never been published, so learners receive nothing from it. The working copy (v${detail.version}) is ${STATUS_LABEL[detail.status]}.`;
}

export default function AssessmentPublishingStatus({ detail, dirty }: { detail: AssessmentDetail; dirty: boolean }) {
  const active = detail.activePublication;
  return (
    <div className="space-y-3">
      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="as-ps-working" className={`${CARD} space-y-2.5 border-slate-200`}>
          <p id="as-ps-working" className={LABEL}>
            Working copy
          </p>
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-900">
            <StatusBadge status={detail.status} />
            <span className="font-mono text-xs text-slate-700">latest saved v{detail.version}</span>
          </p>
          <p className="text-sm text-slate-800">The editable, reviewable version. Review, approval and publishing act on this saved copy.</p>
          <p className="text-xs text-slate-700">Last saved {formatWhen(detail.updatedAt)}.</p>
          {dirty && (
            <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950">
              <strong>Unsaved changes.</strong> The editor holds edits that are not part of saved v{detail.version}. Save or discard them before using the actions below.
            </p>
          )}
        </section>

        <section aria-labelledby="as-ps-active" className={`${CARD} space-y-2.5 ${active ? 'border-emerald-200' : 'border-slate-200'}`}>
          <p id="as-ps-active" className={LABEL}>
            Active for learners
          </p>
          {active ? (
            <>
              <p className="flex flex-wrap items-center gap-2 text-sm text-slate-900">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  Published version {active.version}
                </span>
                <span className="text-xs text-slate-700">Active · immutable</span>
              </p>
              <p className="text-sm text-slate-800">This is the assessment the mobile app offers learners now. Published {formatWhen(active.publishedAt)}.</p>
              <p className="text-xs text-slate-700">Editing the working copy never changes it.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-900">Not active</p>
              <p className="text-sm text-slate-800">{detail.latestPublishedVersion !== null ? `Learners do not receive this assessment. Its last published version was ${detail.latestPublishedVersion}.` : 'Learners do not receive this assessment. It has never been published.'}</p>
            </>
          )}
        </section>
      </div>
      <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">{relationSentence(detail)}</p>
    </div>
  );
}
