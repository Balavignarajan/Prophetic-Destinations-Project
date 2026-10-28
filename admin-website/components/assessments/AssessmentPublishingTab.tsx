'use client';

import React from 'react';
import type { FixTarget } from '../../lib/assessment-builder';
import type { PreviewIssue } from '../../lib/assessment-preview-scoring';
import type { AssessmentDetail } from '../../lib/assessments';
import Icon from '../quizzes/icons';
import { EventHistory, PublicationHistory, ValidationPanel, WorkflowPanel } from './AssessmentPanels';
import AssessmentPublishingStatus from './AssessmentPublishingStatus';

/**
 * The "Publishing" tab: everything about getting the assessment to learners, in the order it is read.
 *
 *  1. Where it stands: the WORKING COPY (status and version, unsaved edits) beside what is ACTIVE FOR LEARNERS (the immutable published version), never merged.
 *  2. Review and publishing: the workflow as the path it is (Draft, Ready for Review, Approved, Published), the next step and who may take it, and the actions the SERVER's `allowedActions` allow for the
 *     role and status, each behind its confirmation. Nothing here is a new state or transition.
 *  3. Publishing readiness: the server's checks of the SAVED copy and, when there are unsaved edits, the editor's own check of them, kept apart and labelled. The server decides again when publishing.
 *  4. History: every published version (active or superseded) and the workflow trail.
 *
 * Editing never changes a published version, saving never publishes, and only an Approved assessment can be published, for every role. While there are unsaved edits the workflow actions are paused,
 * because they act on the SAVED copy.
 */
const Section = ({ number, title, children }: { number: number; title: string; children: React.ReactNode }) => (
  <section aria-label={title} className="space-y-2">
    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
      <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
        {number}
      </span>
      {title}
    </p>
    {children}
  </section>
);

export default function AssessmentPublishingTab({
  detail,
  dirty,
  editorIssues,
  onChanged,
  onStale,
  onGoTo,
  onGoToTarget,
  onPreview,
}: {
  detail: AssessmentDetail | null;
  dirty: boolean;
  /** What the editor finds missing in the content as it is now. */
  editorIssues: PreviewIssue[];
  /** Called after the API confirmed a workflow transition. */
  onChanged: (message: string) => void;
  /** Called when the server refused because the assessment changed since the page loaded (409): the page reloads it. */
  onStale: () => void;
  onGoTo: (path?: string) => void;
  onGoToTarget: (target: FixTarget) => void;
  onPreview: () => void;
}) {
  if (!detail) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-sm font-semibold text-slate-900">Save the assessment first</p>
        <p className="mx-auto mt-1 max-w-xl text-xs text-slate-700">Review, approval and publishing become available once the assessment has been saved as a draft. Nothing reaches learners until it is approved and published.</p>
        <button type="button" onClick={onPreview} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
          <Icon name="phone" />
          Preview Assessment
        </button>
      </div>
    );
  }
  const refreshKey = `${detail.version}:${detail.status}:${detail.activePublication?.version ?? ''}:${detail.latestPublishedVersion ?? ''}`;
  return (
    <div className="space-y-6">
      <Section number={1} title="Where it stands">
        <AssessmentPublishingStatus detail={detail} dirty={dirty} />
      </Section>

      <Section number={2} title="Review and publishing">
        <WorkflowPanel detail={detail} dirty={dirty} onChanged={onChanged} onStale={onStale} />
        <p className="text-xs text-slate-700">
          Want to see it as a learner first?{' '}
          <button type="button" onClick={onPreview} className="font-medium text-slate-900 underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            Preview Assessment
          </button>
          . The preview changes nothing.
        </p>
      </Section>

      <Section number={3} title="Publishing readiness">
        <ValidationPanel assessmentId={detail.id} refreshKey={refreshKey} dirty={dirty} editorIssues={editorIssues} onGoTo={onGoTo} onGoToTarget={onGoToTarget} />
      </Section>

      <Section number={4} title="History">
        <div className="space-y-6">
          <PublicationHistory assessmentId={detail.id} refreshKey={refreshKey} />
          <EventHistory assessmentId={detail.id} refreshKey={refreshKey} />
        </div>
      </Section>
    </div>
  );
}
