'use client';

import React from 'react';
import { OPTION_FEEDBACK_MAX, QUESTION_SCRIPTURE_MAX } from '../lib/quiz-question';
import type { ScriptureEntryDraft } from '../lib/scripture-info';
import type { QuizScriptureEntry } from '../lib/types';
import ScriptureRefList from './ScriptureRefList';

/**
 * The optional Scripture reference of a quiz question: the same reference list the timeline and hotspot editors use (a picker that checks the passage against
 * the Scripture text installed on the server), limited to a few passages. Learners see it, with the text when it is installed, together with the feedback
 * after they check their answer. Passages already saved stay listed when the Scripture text is not installed; adding one needs it.
 */
export function QuestionScriptureField({
  idPrefix,
  questionLabel,
  value,
  onChange,
  disabled = false,
}: {
  idPrefix: string;
  /** "Question 3" etc., used in labels. */
  questionLabel: string;
  value: QuizScriptureEntry[] | null | undefined;
  onChange: (value: QuizScriptureEntry[] | null) => void;
  disabled?: boolean;
}) {
  const entries: ScriptureEntryDraft[] = (value ?? []).map((entry) => ({ reference: entry.reference, refresh: false }));
  return (
    <ScriptureRefList
      itemLabel={questionLabel}
      idPrefix={`${idPrefix}-sc`}
      title={`${questionLabel}: Scripture reference (optional)`}
      emptyMessage="No Scripture reference. When there is one, learners see it with the feedback after they check their answer."
      entries={entries}
      onChange={(next) => onChange(next.length === 0 ? null : next.map((entry) => ({ reference: entry.reference })))}
      disabled={disabled}
      max={QUESTION_SCRIPTURE_MAX}
      allowRefresh={false}
    />
  );
}

/** Optional feedback for one answer option, shown to learners after they check their answer, next to (never instead of) the question's explanation. */
export function OptionFeedbackInput({
  id,
  label,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  /** e.g. "Option 2 feedback, question 1" (for screen readers). */
  label: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        id={id}
        type="text"
        maxLength={OPTION_FEEDBACK_MAX}
        placeholder="Optional feedback when this option is chosen..."
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 disabled:opacity-60"
      />
    </>
  );
}
