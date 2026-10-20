'use client';

import React from 'react';
import type { LearningLevel } from '../lib/types';

const LEVELS: LearningLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const NAMES: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

/** The levels a question is shown at, as the checkboxes show them: null/absent = every level. */
export const questionLevelSet = (levels: string[] | null | undefined): string[] => (levels === undefined || levels === null ? [...LEVELS] : levels);

/** What to save for the ticked levels: all three = null (every level, the default of questions that were never given a setting), otherwise the subset. */
export const levelsToSave = (ticked: string[]): string[] | null => (ticked.length === LEVELS.length ? null : LEVELS.filter((l) => ticked.includes(l)));

export const levelsText = (levels: string[] | null | undefined) => (!levels || levels.length === LEVELS.length ? 'every level' : levels.map((l) => NAMES[l] ?? l).join(', '));

interface Props {
  /** Makes the element ids unique per question. */
  idPrefix: string;
  /** "Question 3" etc., used in labels. */
  questionLabel: string;
  /** null/undefined = every level. An empty array is shown as an error (a question hidden everywhere is not allowed). */
  value: string[] | null | undefined;
  onChange: (levels: string[] | null) => void;
  disabled?: boolean;
}

/**
 * Per-question level visibility (QUIZ-002 / QUIZ-003). Learners at a level are given only the questions ticked for it. Questions that existed before this
 * setting have none and are shown at every level, so all boxes start ticked. This is separate from the quiz BLOCK's own level setting in the lesson: the
 * block decides whether a learner sees the quiz at all, the ticks decide which of its questions they get.
 */
export default function QuestionLevelsField({ idPrefix, questionLabel, value, onChange, disabled = false }: Props) {
  const ticked = questionLevelSet(value);
  const toggle = (level: string) => {
    const next = ticked.includes(level) ? ticked.filter((l) => l !== level) : [...ticked, level];
    // keep an empty selection visible as an error instead of silently turning it back into "every level"
    onChange(next.length === 0 ? [] : levelsToSave(next));
  };
  return (
    <fieldset disabled={disabled} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <legend className="px-1 text-[11px] font-semibold uppercase text-slate-600">{questionLabel}: show at these levels</legend>
      <div className="flex flex-wrap gap-4">
        {LEVELS.map((level) => (
          <label key={level} htmlFor={`${idPrefix}-${level}`} className="inline-flex items-center gap-2 text-sm text-slate-800 min-h-6">
            <input id={`${idPrefix}-${level}`} type="checkbox" className="h-4 w-4 accent-amber-600" checked={ticked.includes(level)} onChange={() => toggle(level)} />
            {NAMES[level]}
          </label>
        ))}
      </div>
      {ticked.length === 0 ? (
        <p role="alert" className="mt-1 text-xs font-medium text-rose-700">Choose at least one level for this question.</p>
      ) : (
        <p className="mt-1 text-[11px] text-slate-600">
          Learners at a level are given only the questions ticked for it. This is separate from the quiz block&rsquo;s own level setting in the lesson.
        </p>
      )}
    </fieldset>
  );
}
