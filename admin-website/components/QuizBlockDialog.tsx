'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';
import type { LearningLevel, QuizSummary } from '../lib/types';
import { Modal } from './ui';
import QuizCreateForm, { type CreatedQuiz } from './QuizCreateForm';

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
  /** Whether the "Create new quiz" form holds unsaved input. */
  createDirtyRef: React.MutableRefObject<boolean>;
}

function Body({ mode, lessonLevels, initialQuizId, saving, error, onSave, requestClose, dirtyRef, createDirtyRef }: BodyProps) {
  const [source, setSource] = useState<'existing' | 'create'>('existing');
  // the quiz made in this dialog, if any: it stays selected, and stays a saved Draft even if attaching it fails
  const [created, setCreated] = useState<CreatedQuiz | null>(null);
  const [formKey, setFormKey] = useState(0);
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

  const handleCreated = (quiz: CreatedQuiz) => {
    const now = new Date().toISOString();
    setCreated(quiz);
    // listed at once, without waiting for a reload; a reload (which includes it) follows
    setQuizzes((list) => [
      { id: quiz.id, title: quiz.title, description: quiz.description, status: 'DRAFT', version: quiz.version, questionCount: quiz.questionCount, createdAt: now, updatedAt: now, publishedAt: null },
      ...(list ?? []).filter((q) => q.id !== quiz.id),
    ]);
    setSelected(quiz.id);
    setSource('existing');
    setFormKey((n) => n + 1);
    setReload((n) => n + 1);
  };

  const leaveCreate = () => {
    if (createDirtyRef.current && !window.confirm('Discard the quiz you were writing?')) return;
    createDirtyRef.current = false;
    setFormKey((n) => n + 1);
    setSource('existing');
  };
  const canSave = !saving && selected !== null && (mode === 'edit' || levels.length > 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSave && selected) onSave(selected, levels);
  };

  const sourceButton = (value: 'existing' | 'create', label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={source === value}
      disabled={saving}
      onClick={() => setSource(value)}
      className={`flex-1 px-3 py-2 text-sm font-medium rounded-md focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50 ${source === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-700 hover:bg-white/60'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label="Where the quiz comes from" className="flex gap-1 p-1 rounded-lg bg-slate-100">
        {sourceButton('existing', 'Choose Existing Quiz')}
        {sourceButton('create', 'Create New Quiz')}
      </div>

      {/* Create New Quiz: kept mounted while hidden so nothing typed is lost when switching back and forth */}
      <div hidden={source !== 'create'} className="space-y-4">
        <p className="text-sm text-slate-700">
          The new quiz is saved in the Quizzes section as a <strong>Draft</strong>, then selected here so you can choose its levels and add it to this lesson. Your
          lesson content and anything you are editing on this page are not touched.
        </p>
        <QuizCreateForm key={formKey} idPrefix="lesson-new-quiz" submitLabel="Save quiz and select it" dirtyRef={createDirtyRef} onCancel={leaveCreate} onCreated={handleCreated} />
      </div>

      <form onSubmit={submit} hidden={source !== 'existing'} className="space-y-5">
      {created && (
        <p role="status" className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-sm text-emerald-900">
          Quiz &ldquo;{created.title}&rdquo; was created as a Draft and is selected below. {error ? 'It is saved in the Quizzes section but is not in this lesson yet.' : 'Choose its levels and add it to the lesson.'}
        </p>
      )}
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
          {error}{' '}
          {created && selected === created.id
            ? 'The new quiz was kept: it is a Draft in the Quizzes section. Select "Add quiz to lesson" to try again, or close this window and add it later with Choose Existing Quiz.'
            : 'Your choice here is unchanged.'}
        </p>
      )}

      <p className="text-sm text-slate-700">
        The lesson shows the quiz you choose. Removing this block later does not delete the quiz, and the same quiz can be used in other lessons. When the
        lesson is published, a copy of the quiz as it is then is saved with it, so later edits to the quiz do not change a published lesson.
      </p>
      <p className="text-sm text-slate-700">
        Publishing the lesson includes the quiz's questions even if the quiz itself is still a Draft in the Quizzes section. (Whether a quiz must be
        published on its own first has not been decided.) Changing a quiz &mdash; including publishing or unpublishing it &mdash; after it was added means
        this block must be saved again, and the lesson reviewed again (editors and reviewers; administrators can publish directly), before the lesson can be published.
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
            There are no quizzes yet. Use{' '}
            <button type="button" className="underline font-medium" onClick={() => setSource('create')}>
              Create New Quiz
            </button>{' '}
            above, or manage quizzes in the{' '}
            <Link href="/quizzes" className="underline font-medium">
              Quizzes section
            </Link>
            .
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
    </div>
  );
}

/** Adds a quiz block, or changes which quiz an existing block uses. The form starts fresh each time it opens. */
export default function QuizBlockDialog({ isOpen, onClose, ...rest }: Props) {
  const dirtyRef = useRef(false);
  const createDirtyRef = useRef(false);
  const requestClose = () => {
    if (rest.saving) return;
    if (createDirtyRef.current && !window.confirm('The new quiz you were writing has not been saved and will be lost. Close anyway?')) return;
    if (!createDirtyRef.current && dirtyRef.current && !window.confirm('Discard your unsaved changes?')) return;
    dirtyRef.current = false;
    createDirtyRef.current = false;
    onClose();
  };
  return (
    <Modal
      isOpen={isOpen}
      onClose={requestClose}
      title={rest.mode === 'create' ? 'Add a quiz' : 'Change quiz'}
      description="Choose a quiz you already have, or create a new one without leaving the lesson."
      maxWidth="xl"
    >
      <Body {...rest} requestClose={requestClose} dirtyRef={dirtyRef} createDirtyRef={createDirtyRef} />
    </Modal>
  );
}
