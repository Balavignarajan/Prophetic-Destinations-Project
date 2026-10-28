'use client';

import React from 'react';
import { type AssessmentStatus, STATUS_LABEL } from '../../lib/assessments';
import Icon from '../quizzes/icons';

/**
 * The four states an assessment's working copy moves through, drawn as the path they are: Draft, Ready for Review, Approved, Published. These are the backend's own states
 * (backend/src/modules/assessments/domain/assessment-workflow.ts) and nothing is added: no archive, no skipping a step (an assessment is published only from Approved, for every role) and no new
 * transition. The stepper only SHOWS the working copy's status; it does not move it, and saving never moves it forward.
 *
 * Done steps carry a check mark, the current one is labelled "Current" and called out with aria-current, and the rest say "Next" or "Later", so no step is told apart by colour alone.
 */
const STEPS: { status: AssessmentStatus; hint: string }[] = [
  { status: 'DRAFT', hint: 'Being written or revised' },
  { status: 'READY_FOR_REVIEW', hint: 'Waiting for a reviewer' },
  { status: 'APPROVED', hint: 'Approved, not yet published' },
  { status: 'PUBLISHED', hint: 'Published for learners' },
];

export default function AssessmentWorkflowSteps({ status }: { status: AssessmentStatus }) {
  const current = STEPS.findIndex((step) => step.status === status);
  return (
    <ol aria-label="Workflow progress of the working copy" className="grid gap-2 sm:grid-cols-4">
      {STEPS.map((step, index) => {
        const done = index < current;
        const here = index === current;
        const state = done ? 'Done' : here ? 'Current' : index === current + 1 ? 'Next' : 'Later';
        return (
          <li
            key={step.status}
            aria-current={here ? 'step' : undefined}
            className={`flex items-start gap-3 rounded-xl border p-3 sm:flex-col sm:gap-2 ${here ? 'border-slate-900 bg-slate-50 shadow-xs' : done ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}
          >
            <span
              aria-hidden="true"
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${here ? 'border-slate-900 bg-slate-900 text-white' : done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-600'}`}
            >
              {done ? <Icon name="check" className="h-4 w-4" /> : index + 1}
            </span>
            <div className="min-w-0">
              <p className={`text-sm ${here ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>{STATUS_LABEL[step.status]}</p>
              <p className="text-xs text-slate-700">{step.hint}</p>
              <p className={`mt-0.5 text-[11px] font-semibold uppercase tracking-wider ${here ? 'text-slate-900' : done ? 'text-emerald-800' : 'text-slate-600'}`}>{state}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
