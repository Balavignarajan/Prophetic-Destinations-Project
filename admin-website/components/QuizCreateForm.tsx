'use client';

import React, { useState } from 'react';
import { api } from '../lib/api';
import { moveItem, newLocalId } from '../lib/quiz-order';
import { questionPayload } from '../lib/quiz-question';
import type { QuizQuestion } from '../lib/types';
import { friendlyError } from '../lib/ui-messages';
import QuestionLevelsField from './QuestionLevelsField';
import QuizMoveButtons from './QuizMoveButtons';
import { OptionFeedbackInput, QuestionScriptureField } from './QuizQuestionExtras';

/**
 * The ONE quiz creation form: used by the Quizzes section ("Create Draft Quiz") and by the lesson editor (Add content, Quiz, Create new quiz), so both create
 * quizzes through the same fields, the same checks and the same API (POST /admin/quizzes). A new quiz is always a DRAFT; publishing stays in the Quizzes
 * section under its existing rules. Nothing here attaches a quiz to a lesson: the owner does that with the quiz it is handed after a successful save.
 */
export interface CreatedQuiz {
  id: string;
  title: string;
  description: string | null;
  version: number;
  questionCount: number;
}

interface Props {
  /** Called once, after the server created the quiz. */
  onCreated: (quiz: CreatedQuiz) => void;
  onCancel: () => void;
  submitLabel: string;
  /** Kept up to date with whether the form holds unsaved input, so the owner can ask before closing. */
  dirtyRef: React.MutableRefObject<boolean>;
  /** Makes element ids unique when the form is used in more than one place. */
  idPrefix: string;
}

const LABEL = 'block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5';
const FIELD = 'w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 disabled:opacity-60';

// The ids are only the form's own handles (they are not sent), unique so that a question or option keeps its identity when it is moved or others are removed.
const blankQuestion = (): QuizQuestion => ({
  id: newLocalId('q'),
  type: 'SINGLE_CHOICE',
  prompt: '',
  explanation: '',
  options: [
    { id: newLocalId('o'), text: '', correct: true },
    { id: newLocalId('o'), text: '', correct: false },
  ],
});

export default function QuizCreateForm({ onCreated, onCancel, submitLabel, dirtyRef, idPrefix }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<QuizQuestion[]>(() => [blankQuestion()]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read out by screen readers after each move (the order is stored with the quiz when it is created).
  const [announce, setAnnounce] = useState('');

  dirtyRef.current = Boolean(
    title.trim() ||
      description.trim() ||
      questions.some((q) => q.prompt.trim() || (q.explanation ?? '').trim() || q.levels !== undefined || (q.scripture?.length ?? 0) > 0 || q.options.some((o) => o.text.trim() || (o.feedback ?? '').trim())),
  );

  const setQuestion = (index: number, change: (q: QuizQuestion) => QuizQuestion) => setQuestions((list) => list.map((q, i) => (i === index ? change(q) : q)));

  // A move only changes the order in the list: each question or option keeps all of its own content, including which option is the correct one (a flag on the option).
  const moveQuestion = (from: number, to: number) => {
    setQuestions((list) => moveItem(list, from, to));
    setAnnounce(`Question ${from + 1} moved to position ${to + 1} of ${questions.length}. Not saved yet.`);
  };
  const moveOption = (qIndex: number, from: number, to: number) => {
    const moved = questions[qIndex]?.options[from];
    setQuestion(qIndex, (x) => ({ ...x, options: moveItem(x.options, from, to) }));
    setAnnounce(`Option ${from + 1} of question ${qIndex + 1} moved to position ${to + 1}.${moved?.correct ? ' It is still the correct answer.' : ''} Not saved yet.`);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    setError(null);
    for (const q of questions) {
      if (!q.prompt.trim()) return setError('Every question must have a prompt.');
      if (q.levels && q.levels.length === 0) return setError('Every question needs at least one level.');
      if (q.options.length < 2 || q.options.length > 6) return setError('Each question must have between 2 and 6 options.');
      if (q.options.filter((o) => o.correct).length !== 1) return setError('Each question must have exactly one correct option.');
      if (q.options.some((o) => !o.text.trim())) return setError('Option text cannot be empty.');
    }
    setCreating(true);
    try {
      const created = await api.request<{ id: string; title: string; description: string | null; version: number; questions: unknown[] }>('/admin/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          questions: questions.map(questionPayload),
        }),
      });
      dirtyRef.current = false;
      onCreated({ id: created.id, title: created.title, description: created.description, version: created.version, questionCount: created.questions.length });
    } catch (err: unknown) {
      // everything typed stays; nothing was created
      setError(friendlyError(err, 'Failed to create the quiz.'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>
      {error && (
        <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          {error} What you typed here is unchanged.
        </div>
      )}

      <div>
        <label htmlFor={`${idPrefix}-title`} className={LABEL}>Quiz title *</label>
        <input id={`${idPrefix}-title`} type="text" required value={title} disabled={creating} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Minor Prophets Comprehension Check" className={FIELD} />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-description`} className={LABEL}>Description (optional)</label>
        <input id={`${idPrefix}-description`} type="text" value={description} disabled={creating} onChange={(e) => setDescription(e.target.value)} placeholder="Brief assessment description..." className={FIELD} />
      </div>

      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">Questions builder</span>
          <button type="button" disabled={creating} onClick={() => setQuestions((list) => [...list, blankQuestion()])} className="text-xs font-semibold text-amber-700 hover:text-amber-800 disabled:opacity-50">
            + Add Question
          </button>
        </div>
        {questions.length > 1 && <p className="text-[11px] text-slate-600">Use the arrows to change the order of questions and of each question&rsquo;s options. The order is saved with the quiz.</p>}

        {questions.map((q, qIndex) => (
          <div key={q.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 font-mono">Question #{qIndex + 1}</span>
              <div className="flex items-center gap-3">
                <QuizMoveButtons label={`question ${qIndex + 1}`} index={qIndex} count={questions.length} disabled={creating} onMove={(to) => moveQuestion(qIndex, to)} />
                {questions.length > 1 && (
                  <button type="button" disabled={creating} onClick={() => setQuestions((list) => list.filter((_, i) => i !== qIndex))} className="text-xs text-rose-600 hover:underline" aria-label={`Remove question ${qIndex + 1}`}>
                    Remove
                  </button>
                )}
              </div>
            </div>

            <label htmlFor={`${idPrefix}-q${qIndex}-prompt`} className="sr-only">Question {qIndex + 1} prompt</label>
            <input id={`${idPrefix}-q${qIndex}-prompt`} type="text" required placeholder="Question prompt..." value={q.prompt} disabled={creating} onChange={(e) => setQuestion(qIndex, (x) => ({ ...x, prompt: e.target.value }))} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm disabled:opacity-60" />

            <label htmlFor={`${idPrefix}-q${qIndex}-expl`} className="sr-only">Question {qIndex + 1} explanation (optional)</label>
            <input id={`${idPrefix}-q${qIndex}-expl`} type="text" placeholder="Optional answer explanation..." value={q.explanation || ''} disabled={creating} onChange={(e) => setQuestion(qIndex, (x) => ({ ...x, explanation: e.target.value }))} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs disabled:opacity-60" />

            <QuestionLevelsField idPrefix={`${idPrefix}-q${qIndex}`} questionLabel={`Question ${qIndex + 1}`} value={q.levels} onChange={(levels) => setQuestion(qIndex, (x) => ({ ...x, levels }))} disabled={creating} />

            <QuestionScriptureField idPrefix={`${idPrefix}-q${qIndex}`} questionLabel={`Question ${qIndex + 1}`} value={q.scripture} onChange={(scripture) => setQuestion(qIndex, (x) => ({ ...x, scripture }))} disabled={creating} />

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase">Options (select the single correct option)</span>
                {q.options.length < 6 && (
                  <button type="button" disabled={creating} onClick={() => setQuestion(qIndex, (x) => ({ ...x, options: [...x.options, { id: newLocalId('o'), text: '', correct: false }] }))} className="text-[11px] font-semibold text-amber-700 hover:underline">
                    + Add Option
                  </button>
                )}
              </div>
              {q.options.map((opt, oIndex) => (
                <div key={opt.id} className="space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`${idPrefix}-correct-${qIndex}`}
                    aria-label={`Option ${oIndex + 1} of question ${qIndex + 1} is the correct answer`}
                    checked={opt.correct}
                    disabled={creating}
                    onChange={() => setQuestion(qIndex, (x) => ({ ...x, options: x.options.map((o, i) => ({ ...o, correct: i === oIndex })) }))}
                    className="w-4 h-4 text-emerald-600"
                  />
                  <input
                    type="text"
                    required
                    aria-label={`Option ${oIndex + 1} text, question ${qIndex + 1}`}
                    placeholder={`Option ${oIndex + 1}`}
                    value={opt.text}
                    disabled={creating}
                    onChange={(e) => setQuestion(qIndex, (x) => ({ ...x, options: x.options.map((o, i) => (i === oIndex ? { ...o, text: e.target.value } : o)) }))}
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs disabled:opacity-60"
                  />
                  <QuizMoveButtons label={`option ${oIndex + 1} of question ${qIndex + 1}`} index={oIndex} count={q.options.length} disabled={creating} onMove={(to) => moveOption(qIndex, oIndex, to)} />
                  {q.options.length > 2 && (
                    <button
                      type="button"
                      disabled={creating}
                      aria-label={`Remove option ${oIndex + 1} of question ${qIndex + 1}`}
                      onClick={() =>
                        setQuestion(qIndex, (x) => {
                          const options = x.options.filter((_, i) => i !== oIndex);
                          // removing the correct option leaves the first one correct, as before
                          if (opt.correct && options.length > 0) options[0] = { ...options[0], correct: true };
                          return { ...x, options };
                        })
                      }
                      className="text-slate-400 hover:text-rose-600 text-xs px-1"
                    >
                      &times;
                    </button>
                  )}
                </div>
                <div className="pl-6">
                  <OptionFeedbackInput
                    id={`${idPrefix}-q${qIndex}-o${oIndex}-fb`}
                    label={`Option ${oIndex + 1} feedback (optional), question ${qIndex + 1}`}
                    value={opt.feedback}
                    disabled={creating}
                    onChange={(feedback) => setQuestion(qIndex, (x) => ({ ...x, options: x.options.map((o, i) => (i === oIndex ? { ...o, feedback } : o)) }))}
                  />
                </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
        <button type="button" onClick={onCancel} disabled={creating} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
          Cancel
        </button>
        <button type="submit" disabled={creating} aria-busy={creating} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50">
          {creating && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
