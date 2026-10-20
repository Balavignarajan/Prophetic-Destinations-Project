'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';
import type { LearningLevel, QuizSummary } from '../lib/types';
import { Modal } from './ui';

interface Props {
  isOpen: boolean;
  mode: 'create' | 'edit';
  /** Levels the lesson is available at (a new block starts visible at all of them). */
  lessonLevels: LearningLevel[];
  /** The quiz the block currently points at (edit mode). */
  initialQuizId: string | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (quizId: string, levels: LearningLevel[]) => void;
}

const LABEL = 'block text-sm font-semibold text-slate-800 mb-1.5';
const LEVEL_NAMES: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

interface BodyProps extends Omit<Props, 'isOpen' | 'onClose'> {
  requestClose: () => void;
  dirtyRef: React.MutableRefObject<boolean>;
}

function Body({ mode, lessonLevels, initialQuizId, saving, error, onSave, requestClose, dirtyRef }: BodyProps) {
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<string | null>(initialQuizId);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    api
      .request<{ items: QuizSummary[] }>('/admin/quizzes?limit=100')
      .then((res) => !cancelled && setQuizzes(res.items))
      .catch(() => !cancelled && setLoadError('The quizzes could not be loaded. Check your connection and try again.'));
    return () => {
      cancelled = true;
    };
  }, [reload]);

  dirtyRef.current = selected !== initialQuizId;
  const canSave = !saving && selected !== null && (mode === 'edit' || levels.length > 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSave && selected) onSave(selected, levels);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
          {error} Your choice here is unchanged.
        </p>
      )}

      <p className="text-sm text-slate-700">
        The lesson shows the quiz you choose. Removing this block later does not delete the quiz, and the same quiz can be used in other lessons. When the
        lesson is published, a copy of the quiz as it is then is saved with it, so later edits to the quiz do not change a published lesson.
      </p>
      <p className="text-sm text-slate-700">
        Publishing the lesson includes the quiz's questions even if the quiz itself is still a Draft in the Quizzes section. (Whether a quiz must be
        published on its own first has not been decided.) Changing a quiz &mdash; including publishing or unpublishing it &mdash; after it was added means
        this block must be saved again, and the lesson approved again, before the lesson can be published.
      </p>

      <fieldset disabled={saving} className="space-y-2">
        <legend className={LABEL}>Quiz</legend>
        {loadError ? (
          <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
            {loadError}{' '}
            <button type="button" className="underline font-medium" onClick={() => setReload((n) => n + 1)}>
              Try again
            </button>
          </div>
        ) : quizzes === null ? (
          <p role="status" className="text-sm text-slate-700">
            Loading quizzes…
          </p>
        ) : quizzes.length === 0 ? (
          <p className="p-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-700">
            There are no quizzes yet.{' '}
            <Link href="/quizzes" className="underline font-medium">
              Create a quiz
            </Link>{' '}
            first, then come back to add it to this lesson.
          </p>
        ) : (
          <ul className="max-h-[40vh] overflow-y-auto space-y-2 pr-1">
            {quizzes.map((quiz) => (
              <li key={quiz.id}>
                <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${selected === quiz.id ? 'border-amber-600 bg-amber-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                  <input type="radio" name="quiz" className="mt-1 h-4 w-4 accent-amber-600" checked={selected === quiz.id} onChange={() => setSelected(quiz.id)} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900 break-words">{quiz.title}</span>
                    <span className="block text-xs text-slate-700">
                      {quiz.questionCount} {quiz.questionCount === 1 ? 'question' : 'questions'} · {quiz.status === 'PUBLISHED' ? 'published' : 'draft'}
                      {quiz.questionCount === 0 ? ' · needs questions before the lesson can be published' : ''}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {mode === 'create' && (
        <fieldset disabled={saving}>
          <legend className={LABEL}>Show this quiz at</legend>
          <div className="flex flex-wrap gap-4">
            {lessonLevels.map((level) => (
              <label key={level} className="inline-flex items-center gap-2 text-sm text-slate-800 min-h-6">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-amber-600"
                  checked={levels.includes(level)}
                  onChange={() => setLevels((current) => (current.includes(level) ? current.filter((l) => l !== level) : [...current, level]))}
                />
                {LEVEL_NAMES[level] ?? level}
              </label>
            ))}
          </div>
          {levels.length === 0 && <p className="text-sm font-medium text-rose-700 mt-1">Choose at least one level.</p>}
        </fieldset>
      )}

      <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
        <button type="button" onClick={requestClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSave}
          aria-busy={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
          {mode === 'create' ? 'Add quiz to lesson' : 'Save quiz choice'}
        </button>
      </div>
    </form>
  );
}

/** Adds a quiz block, or changes which quiz an existing block uses. The form starts fresh each time it opens. */
export default function QuizBlockDialog({ isOpen, onClose, ...rest }: Props) {
  const dirtyRef = useRef(false);
  const requestClose = () => {
    if (rest.saving) return;
    if (dirtyRef.current && !window.confirm('Discard your unsaved changes?')) return;
    dirtyRef.current = false;
    onClose();
  };
  return (
    <Modal
      isOpen={isOpen}
      onClose={requestClose}
      title={rest.mode === 'create' ? 'Add a quiz' : 'Change quiz'}
      description="Choose one of the quizzes from the Quizzes section."
      maxWidth="xl"
    >
      <Body {...rest} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Modal>
  );
}
