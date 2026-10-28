'use client';

import React, { useId, useState } from 'react';
import { QUIZ_LIMITS, blankOption, questionIssues } from '../../lib/quiz-draft';
import { moveItem } from '../../lib/quiz-order';
import type { QuizQuestion } from '../../lib/types';
import QuestionLevelsField from '../QuestionLevelsField';
import QuizMoveButtons from '../QuizMoveButtons';
import { QuestionScriptureField } from '../QuizQuestionExtras';
import Icon from './icons';

/**
 * The Quiz Builder's editor for ONE question (the one chosen in the list) and for the quiz's title and description. Every change is handed up as a change to the working copy; nothing here
 * sends anything. The rules are the quiz API's own: 2 to 6 answers, exactly one correct, the lengths it allows (quoted in the counters), at least one level. Removing the correct answer leaves
 * the question with NO correct answer until the author chooses one (the list and the Save button say so), so no answer is ever made correct on the author's behalf.
 */
const CARD = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs';
const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-amber-600 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 disabled:opacity-60';
const LABEL = 'block text-sm font-semibold text-slate-900';
const HINT = 'text-xs text-slate-700';

function Counter({ value, max }: { value: string; max: number }) {
  const length = value.length;
  return (
    <span className={`text-xs tabular-nums ${length >= max ? 'font-semibold text-rose-800' : 'text-slate-600'}`} aria-hidden="true">
      {length} / {max}
    </span>
  );
}

export function QuizDetailsForm({ title, description, disabled, onTitle, onDescription }: { title: string; description: string; disabled: boolean; onTitle: (value: string) => void; onDescription: (value: string) => void }) {
  const id = useId();
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Quiz details</h2>
        <p className={HINT}>The title and description learners see at the top of the quiz.</p>
      </div>
      <div className={`${CARD} space-y-4`}>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={`${id}-title`} className={LABEL}>
              Quiz title <span className="text-rose-700">*</span>
            </label>
            <Counter value={title} max={QUIZ_LIMITS.title} />
          </div>
          <input id={`${id}-title`} type="text" required maxLength={QUIZ_LIMITS.title} value={title} disabled={disabled} onChange={(event) => onTitle(event.target.value)} placeholder="e.g. Minor Prophets Comprehension Check" className={FIELD} />
          {!title.trim() && <p className="text-xs font-medium text-rose-800">A title is required before the quiz can be saved.</p>}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={`${id}-description`} className={LABEL}>
              Description <span className="font-normal text-slate-600">(optional)</span>
            </label>
            <Counter value={description} max={QUIZ_LIMITS.description} />
          </div>
          <textarea id={`${id}-description`} rows={3} maxLength={QUIZ_LIMITS.description} value={description} disabled={disabled} onChange={(event) => onDescription(event.target.value)} placeholder="A short description of this quiz..." className={FIELD} />
        </div>
      </div>
    </div>
  );
}

export default function QuestionEditor({
  question,
  index,
  disabled,
  update,
  announce,
}: {
  question: QuizQuestion;
  /** 0-based place in the working copy. */
  index: number;
  disabled: boolean;
  update: (id: string, change: (q: QuizQuestion) => QuizQuestion) => void;
  announce: (message: string) => void;
}) {
  const id = useId();
  const q = question;
  const number = index + 1;
  const set = (change: (current: QuizQuestion) => QuizQuestion) => update(q.id, change);
  const [openFeedback, setOpenFeedback] = useState<Record<string, boolean>>({});
  const [explanationOpen, setExplanationOpen] = useState((q.explanation ?? '').trim() !== '');
  const issues = questionIssues(q);
  const noCorrect = q.options.filter((o) => o.correct).length !== 1;

  const moveOption = (from: number, to: number) => {
    const moved = q.options[from];
    set((x) => ({ ...x, options: moveItem(x.options, from, to) }));
    announce(`Answer ${from + 1} of question ${number} moved to position ${to + 1}.${moved?.correct ? ' It is still the correct answer.' : ''} Not saved yet.`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">Question {number}</p>
          <h2 className="text-lg font-semibold text-slate-900">Edit question</h2>
        </div>
        {issues.length === 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900">
            <Icon name="check" className="h-3.5 w-3.5" />
            Complete
          </span>
        ) : (
          <ul aria-label="What this question still needs" className="flex flex-wrap gap-1.5">
            {issues.map((issue) => (
              <li key={issue.code} className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-900">
                <Icon name="alert" className="h-3.5 w-3.5" />
                {issue.short}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* A. The question */}
      <section className={`${CARD} space-y-1.5`} aria-labelledby={`${id}-q`}>
        <div className="flex items-baseline justify-between gap-3">
          <label id={`${id}-q`} htmlFor={`${id}-prompt`} className={LABEL}>
            Question text <span className="text-rose-700">*</span>
          </label>
          <Counter value={q.prompt} max={QUIZ_LIMITS.prompt} />
        </div>
        <textarea id={`${id}-prompt`} rows={4} maxLength={QUIZ_LIMITS.prompt} value={q.prompt} disabled={disabled} onChange={(event) => set((x) => ({ ...x, prompt: event.target.value }))} placeholder="Write the question learners will see..." className={FIELD} />
      </section>

      {/* B. The answers */}
      <section className={`${CARD} space-y-3`} aria-labelledby={`${id}-a`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id={`${id}-a`} className={LABEL}>
              Answer options
            </h3>
            <p className={HINT}>Select the one correct answer.</p>
          </div>
          <button
            type="button"
            disabled={disabled || q.options.length >= QUIZ_LIMITS.optionsMax}
            onClick={() => set((x) => ({ ...x, options: [...x.options, blankOption()] }))}
            title={q.options.length >= QUIZ_LIMITS.optionsMax ? `A question can have at most ${QUIZ_LIMITS.optionsMax} answers` : 'Add an answer'}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
            Add Option
          </button>
        </div>

        <ul className="space-y-2" aria-label={`Answers for question ${number}`}>
          {q.options.map((opt, oIndex) => {
            const feedbackShown = openFeedback[opt.id] ?? (opt.feedback ?? '').trim() !== '';
            return (
              <li key={opt.id} className={`rounded-lg border p-2.5 ${opt.correct ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="radio"
                    name={`${id}-correct`}
                    aria-label={`Option ${oIndex + 1} of question ${number} is the correct answer`}
                    checked={opt.correct}
                    disabled={disabled}
                    onChange={() => set((x) => ({ ...x, options: x.options.map((o, i) => ({ ...o, correct: i === oIndex })) }))}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  <label htmlFor={`${id}-o${oIndex}`} className="sr-only">
                    Answer {oIndex + 1} text, question {number}
                  </label>
                  <input
                    id={`${id}-o${oIndex}`}
                    type="text"
                    maxLength={QUIZ_LIMITS.optionText}
                    value={opt.text}
                    disabled={disabled}
                    placeholder={`Answer ${oIndex + 1}`}
                    onChange={(event) => set((x) => ({ ...x, options: x.options.map((o, i) => (i === oIndex ? { ...o, text: event.target.value } : o)) }))}
                    className={`${FIELD} min-w-40 flex-1 py-1.5`}
                  />
                  {opt.correct && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900">Correct</span>}
                  <QuizMoveButtons label={`answer ${oIndex + 1} of question ${number}`} index={oIndex} count={q.options.length} disabled={disabled} onMove={(to) => moveOption(oIndex, to)} />
                  <button
                    type="button"
                    aria-expanded={feedbackShown}
                    aria-controls={`${id}-fb${oIndex}`}
                    disabled={disabled}
                    onClick={() => setOpenFeedback((current) => ({ ...current, [opt.id]: !feedbackShown }))}
                    className="rounded-md px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
                  >
                    {feedbackShown ? 'Hide feedback' : (opt.feedback ?? '').trim() ? 'Feedback ✓' : 'Add feedback'}
                  </button>
                  {q.options.length > QUIZ_LIMITS.optionsMin && (
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`Remove option ${oIndex + 1} of question ${number}`}
                      title="Remove this answer"
                      onClick={() => {
                        set((x) => ({ ...x, options: x.options.filter((_, i) => i !== oIndex) }));
                        announce(opt.correct ? `Answer ${oIndex + 1} of question ${number} removed. It was the correct answer: choose another one.` : `Answer ${oIndex + 1} of question ${number} removed.`);
                      }}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-400"
                    >
                      <Icon name="close" />
                    </button>
                  )}
                </div>
                {feedbackShown && (
                  <div id={`${id}-fb${oIndex}`} className="mt-2 space-y-1 pl-6">
                    <div className="flex items-baseline justify-between gap-3">
                      <label htmlFor={`${id}-fbtext${oIndex}`} className="text-xs font-semibold text-slate-800">
                        Feedback for this answer (optional)
                      </label>
                      <Counter value={opt.feedback ?? ''} max={QUIZ_LIMITS.optionFeedback} />
                    </div>
                    <input
                      id={`${id}-fbtext${oIndex}`}
                      type="text"
                      maxLength={QUIZ_LIMITS.optionFeedback}
                      value={opt.feedback ?? ''}
                      disabled={disabled}
                      placeholder="Shown when a learner chooses this answer and checks it..."
                      onChange={(event) => set((x) => ({ ...x, options: x.options.map((o, i) => (i === oIndex ? { ...o, feedback: event.target.value } : o)) }))}
                      className={`${FIELD} py-1.5 text-xs`}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {noCorrect && (
          <p role="alert" className="flex items-center gap-1.5 text-sm font-medium text-rose-800">
            <Icon name="alert" />
            Select the one correct answer before saving.
          </p>
        )}
        {q.options.length >= QUIZ_LIMITS.optionsMax && <p className={HINT}>A question can have at most {QUIZ_LIMITS.optionsMax} answers.</p>}
      </section>

      {/* C. The explanation */}
      <section className={`${CARD} space-y-1.5`} aria-labelledby={`${id}-e`}>
        <div className="flex items-center justify-between gap-3">
          <h3 id={`${id}-e`} className={LABEL}>
            Explanation <span className="font-normal text-slate-600">(optional)</span>
          </h3>
          <button
            type="button"
            aria-expanded={explanationOpen}
            aria-controls={`${id}-expl`}
            onClick={() => setExplanationOpen((open) => !open)}
            className="rounded-md px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            {explanationOpen ? 'Hide' : (q.explanation ?? '').trim() ? 'Show' : 'Add explanation'}
          </button>
        </div>
        {explanationOpen && (
          <div id={`${id}-expl`} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={`${id}-explanation`} className={HINT}>
                Shown to learners after they check their answer.
              </label>
              <Counter value={q.explanation ?? ''} max={QUIZ_LIMITS.explanation} />
            </div>
            <textarea id={`${id}-explanation`} rows={3} maxLength={QUIZ_LIMITS.explanation} value={q.explanation ?? ''} disabled={disabled} onChange={(event) => set((x) => ({ ...x, explanation: event.target.value }))} placeholder="Explain why the correct answer is right..." className={FIELD} />
          </div>
        )}
      </section>

      {/* D. Scripture */}
      <section className={CARD} aria-label="Scripture references">
        <QuestionScriptureField idPrefix={`${id}-q`} questionLabel={`Question ${number}`} value={q.scripture} onChange={(scripture) => set((x) => ({ ...x, scripture }))} disabled={disabled} />
      </section>

      {/* E. Levels */}
      <section className={`${CARD} space-y-2`} aria-labelledby={`${id}-l`}>
        <h3 id={`${id}-l`} className={LABEL}>
          Visible to
        </h3>
        <QuestionLevelsField idPrefix={`${id}-lv`} questionLabel={`Question ${number}`} value={q.levels} onChange={(levels) => set((x) => ({ ...x, levels }))} disabled={disabled} />
      </section>
    </div>
  );
}
