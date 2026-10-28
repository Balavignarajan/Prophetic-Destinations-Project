'use client';

import React, { useEffect, useState } from 'react';
import { answerLetter, answerTextFieldId, isValidPoints, pointsFieldId, promptFieldId, questionIssues } from '../../lib/assessment-builder';
import { type EditorQuestion, LEVELS, LEVEL_LABEL, LIMITS, type Level } from '../../lib/assessments';
import { ConfirmDialog } from '../ui';
import Icon from '../quizzes/icons';

/**
 * The Assessment Question Builder's editor for ONE question: its text and its answers, each answer with the points it gives to each of the three learning levels. A placement assessment has no
 * right or wrong answer (so there is no correct-answer choice here, unlike a quiz): the points are the author's, whole numbers from 0 to 100, and nothing is pre-filled or calculated. Every change is
 * handed up to the working copy; nothing is sent until the assessment is saved. Messages appear beside the field they are about: always for text that is too long or points that are not a number, and
 * for fields left empty once a save has been tried.
 */
const CARD = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs';
const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-amber-600 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 disabled:bg-slate-50 disabled:opacity-60';
const FIELD_ERROR = 'border-rose-400 focus:border-rose-500 focus:ring-rose-300';
const LABEL = 'block text-sm font-semibold text-slate-900';
const SMALL_BTN = 'inline-flex items-center rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

function Counter({ length, max }: { length: number; max: number }) {
  return (
    <span className={`text-xs tabular-nums ${length > max ? 'font-semibold text-rose-800' : 'text-slate-600'}`} aria-hidden="true">
      {length} / {max}
    </span>
  );
}

const Message = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <p id={id} className="flex items-start gap-1 text-xs font-medium text-rose-800">
    <Icon name="alert" className="mt-px h-3.5 w-3.5" />
    <span>{children}</span>
  </p>
);

export default function AssessmentQuestionEditor({
  question,
  index,
  readOnly,
  disabled,
  attempted,
  setQuestion,
  setOption,
  addOption,
  removeOption,
  moveOption,
}: {
  question: EditorQuestion;
  /** 0-based place in the working copy. */
  index: number;
  readOnly: boolean;
  disabled: boolean;
  /** A save has been tried: empty required fields are then marked. */
  attempted: boolean;
  setQuestion: (qi: number, change: (q: EditorQuestion) => EditorQuestion) => void;
  setOption: (qi: number, oi: number, change: (o: EditorQuestion['options'][number]) => EditorQuestion['options'][number]) => void;
  addOption: (qi: number) => void;
  removeOption: (qi: number, oi: number) => void;
  moveOption: (qi: number, from: number, to: number) => void;
}) {
  const q = question;
  const number = index + 1;
  const locked = readOnly || disabled;
  const [deleting, setDeleting] = useState<number | null>(null);
  // The control the keyboard should land on once the change that asked for it has been drawn (a moved answer's own arrow, the new answer's text, the answer that took a deleted one's place).
  const [focusId, setFocusId] = useState<string | null>(null);
  const issues = questionIssues(q, index);

  const promptEmpty = q.prompt.trim() === '';
  const promptLong = q.prompt.trim().length > LIMITS.promptMax;

  useEffect(() => {
    if (!focusId) return;
    const wanted = document.getElementById(focusId) as HTMLButtonElement | null;
    // A moved answer that is now first or last has one arrow switched off: use the other one.
    const other = focusId.endsWith('-up') ? `${focusId.slice(0, -3)}-down` : focusId.endsWith('-down') ? `${focusId.slice(0, -5)}-up` : null;
    const fallback = other ? (document.getElementById(other) as HTMLButtonElement | null) : null;
    (wanted && !wanted.disabled ? wanted : (fallback && !fallback.disabled ? fallback : wanted))?.focus();
    setFocusId(null);
  }, [focusId]);

  const moveAnswer = (oi: number, delta: -1 | 1) => {
    moveOption(index, oi, oi + delta);
    setFocusId(`as-q${index}-o${oi + delta}-${delta < 0 ? 'up' : 'down'}`);
  };
  const addAnswer = () => {
    const at = q.options.length;
    addOption(index);
    setFocusId(answerTextFieldId(index, at));
  };
  const deleteAnswer = (oi: number) => {
    const remaining = q.options.length - 1;
    removeOption(index, oi);
    setFocusId(remaining > 0 ? answerTextFieldId(index, Math.min(oi, remaining - 1)) : `as-q${index}-add`);
  };

  return (
    <div id={`as-q${index}`} tabIndex={-1} className="space-y-5 focus:outline-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">Question {number}</p>
          <h3 className="text-lg font-semibold text-slate-900">{readOnly ? 'Question' : 'Edit question'}</h3>
        </div>
        {issues.length === 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900">
            <Icon name="check" className="h-3.5 w-3.5" />
            Complete
          </span>
        ) : (
          <ul aria-label="What this question still needs" className="flex flex-wrap gap-1.5">
            {issues.map((issue) => (
              <li key={issue.code}>
                <button
                  type="button"
                  onClick={() => document.getElementById(issue.fieldId)?.focus()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-900 hover:bg-rose-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
                  title="Go to the field"
                >
                  <Icon name="alert" className="h-3.5 w-3.5" />
                  {issue.short}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <section className={`${CARD} space-y-1.5`} aria-labelledby={`as-q${index}-label`}>
        <div className="flex items-baseline justify-between gap-3">
          <label id={`as-q${index}-label`} htmlFor={promptFieldId(index)} className={LABEL}>
            Question text <span className="text-rose-700">*</span>
          </label>
          <Counter length={q.prompt.trim().length} max={LIMITS.promptMax} />
        </div>
        <textarea
          id={promptFieldId(index)}
          rows={3}
          value={q.prompt}
          disabled={locked}
          aria-invalid={promptLong || (attempted && promptEmpty) || undefined}
          aria-describedby={promptLong || (attempted && promptEmpty) ? `as-q${index}-prompt-msg` : undefined}
          onChange={(event) => setQuestion(index, (x) => ({ ...x, prompt: event.target.value }))}
          placeholder="Write the question learners will see..."
          className={`${FIELD} ${promptLong || (attempted && promptEmpty) ? FIELD_ERROR : ''}`}
        />
        {promptLong && <Message id={`as-q${index}-prompt-msg`}>The question text can be at most {LIMITS.promptMax} characters.</Message>}
        {!promptLong && attempted && promptEmpty && <Message id={`as-q${index}-prompt-msg`}>The question text is required.</Message>}
      </section>

      <section className={`${CARD} space-y-3`} aria-labelledby={`as-q${index}-answers`}>
        <div>
          <h4 id={`as-q${index}-answers`} className={LABEL}>
            Answers and points
          </h4>
          <p className="text-xs text-slate-700">
            Each answer gives points to each of the three levels, as whole numbers from 0 to {LIMITS.pointsMax}. There is no right or wrong answer: the level with the highest total over a learner&rsquo;s answers is the one recommended.
            A question needs {LIMITS.optionsMin} to {LIMITS.optionsMax} answers.
          </p>
        </div>

        <ol className="space-y-3" aria-label={`Answers of question ${number}`}>
          {q.options.map((o, oi) => {
            const letter = answerLetter(oi);
            const textEmpty = o.text.trim() === '';
            const textLong = o.text.trim().length > LIMITS.optionTextMax;
            const textBad = textLong || (attempted && textEmpty);
            return (
              <li key={o.key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
                  <span aria-hidden="true" className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">
                    {letter}
                  </span>
                  <div className="min-w-0 flex-1 basis-40 space-y-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <label htmlFor={answerTextFieldId(index, oi)} className="text-xs font-semibold text-slate-800">
                        Answer {letter} <span className="text-rose-700">*</span>
                        <span className="sr-only"> of question {number}</span>
                      </label>
                      <Counter length={o.text.trim().length} max={LIMITS.optionTextMax} />
                    </div>
                    <input
                      id={answerTextFieldId(index, oi)}
                      type="text"
                      value={o.text}
                      disabled={locked}
                      placeholder={`Answer ${letter}`}
                      aria-invalid={textBad || undefined}
                      aria-describedby={textBad ? `${answerTextFieldId(index, oi)}-msg` : undefined}
                      onChange={(event) => setOption(index, oi, (x) => ({ ...x, text: event.target.value }))}
                      className={`${FIELD} ${textBad ? FIELD_ERROR : ''}`}
                    />
                    {textLong && <Message id={`${answerTextFieldId(index, oi)}-msg`}>The answer can be at most {LIMITS.optionTextMax} characters.</Message>}
                    {!textLong && attempted && textEmpty && <Message id={`${answerTextFieldId(index, oi)}-msg`}>The answer text is required.</Message>}
                  </div>
                  {!readOnly && (
                    <div className="flex w-full shrink-0 gap-1 pl-9 sm:mt-5 sm:w-auto sm:pl-0">
                      <button id={`as-q${index}-o${oi}-up`} type="button" className={SMALL_BTN} disabled={locked || oi === 0} onClick={() => moveAnswer(oi, -1)} aria-label={`Move answer ${letter} of question ${number} up`}>
                        ↑
                      </button>
                      <button id={`as-q${index}-o${oi}-down`} type="button" className={SMALL_BTN} disabled={locked || oi === q.options.length - 1} onClick={() => moveAnswer(oi, 1)} aria-label={`Move answer ${letter} of question ${number} down`}>
                        ↓
                      </button>
                      <button type="button" className={`${SMALL_BTN} text-rose-700`} disabled={locked} onClick={() => setDeleting(oi)} aria-label={`Delete answer ${letter} of question ${number}`}>
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                <fieldset disabled={locked} className="mt-3 min-w-0 sm:pl-9">
                  <legend className="mb-1.5 text-xs font-medium text-slate-700">
                    Points this answer gives <span className="sr-only">(answer {letter} of question {number})</span>
                    <span aria-hidden="true"> to each level</span>
                  </legend>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {LEVELS.map((level: Level) => {
                      const id = pointsFieldId(index, oi, level);
                      const raw = o.scores[level];
                      const bad = (raw.trim() !== '' && !isValidPoints(raw)) || (attempted && raw.trim() === '');
                      return (
                        <div key={level} className="min-w-0 space-y-1">
                          <label htmlFor={id} className="block truncate text-xs font-semibold text-slate-800" title={LEVEL_LABEL[level]}>
                            {LEVEL_LABEL[level]}
                            <span className="sr-only"> points for answer {letter} of question {number}, 0 to {LIMITS.pointsMax}</span>
                          </label>
                          <input
                            id={id}
                            inputMode="numeric"
                            value={raw}
                            placeholder={`0–${LIMITS.pointsMax}`}
                            aria-invalid={bad || undefined}
                            aria-describedby={bad ? `${id}-msg` : undefined}
                            onChange={(event) => setOption(index, oi, (x) => ({ ...x, scores: { ...x.scores, [level]: event.target.value } }))}
                            className={`${FIELD} text-right tabular-nums ${bad ? FIELD_ERROR : ''}`}
                          />
                          {bad && <Message id={`${id}-msg`}>{raw.trim() === '' ? `Enter 0 to ${LIMITS.pointsMax}.` : `Use a whole number from 0 to ${LIMITS.pointsMax}.`}</Message>}
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ol>

        {q.options.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-700">This question has no answers yet.</p>}

        {!readOnly && (
          <button id={`as-q${index}-add`} type="button" className={SMALL_BTN} disabled={locked || q.options.length >= LIMITS.optionsMax} onClick={addAnswer}>
            + Add answer {q.options.length >= LIMITS.optionsMax ? `(maximum ${LIMITS.optionsMax})` : ''}
          </button>
        )}
      </section>

      <ConfirmDialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting !== null) deleteAnswer(deleting);
          setDeleting(null);
        }}
        title="Delete this answer?"
        message="The answer and its points are removed from the editor. Nothing changes on the server until you save."
        confirmLabel="Delete answer"
        isDestructive
        safeFocus
      />
    </div>
  );
}
