'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { QUIZ_LIMITS, type QuizDraft, blankQuestion, copyQuestion, draftFromQuiz, draftPayload, draftProblem, fingerprint, hasContent, newDraft, questionIssues } from '../../lib/quiz-draft';
import { moveItem } from '../../lib/quiz-order';
import type { AdminQuiz, QuizQuestion } from '../../lib/types';
import { friendlyError } from '../../lib/ui-messages';
import { useUnsavedWork } from '../../lib/unsaved-guard';
import { ConfirmDialog, Modal } from '../ui';
import Icon from './icons';
import QuestionEditor, { QuizDetailsForm } from './QuestionEditor';
import QuestionSidebar, { type Selection } from './QuestionSidebar';
import QuizPhonePreview from './QuizPhonePreview';

/**
 * The Quiz Builder: a near-full-screen workspace to create a draft quiz or edit one, with a question list on the left (select, drag, move, duplicate, delete, add) and ONE question at a time on the
 * right, instead of one long form. It replaces the old "Create Draft Quiz" and "Edit Draft Quiz" windows of the Quiz Management page; the lesson editor's "Add content, Quiz" keeps its own form.
 *
 * EVERYTHING IS LOCAL UNTIL SAVE. The title, description, questions, answers, correct answers, feedback, Scripture, levels, the order of questions and of answers, duplicates and deletions all change
 * a working copy held here (lib/quiz-draft.ts). Nothing is sent until "Save", which uses the existing API exactly as before (POST /admin/quizzes to create; PUT /admin/quizzes/:id with the version
 * the editor loaded to replace the content of a draft, so a stale version is still refused). A failed save keeps the working copy and says why; saving never publishes. Cancelling, or leaving, with
 * unsaved changes asks first; the one guard for refresh, Back and links is the Admin's (lib/unsaved-guard.ts, registered below), not a second one. There is no separate "Save Order": the order is
 * part of the content that Save sends.
 *
 * "Preview Quiz" plays the working copy in a phone-shaped preview (QuizPhonePreview); it sends nothing.
 */
export default function QuizBuilder({
  mode,
  quiz,
  initialQuestionId,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  /** The quiz being edited (mode `edit`): a draft, as loaded. Its version is sent back with the save. */
  quiz: AdminQuiz | null;
  /** Edit mode: the saved question to open first. */
  initialQuestionId?: string;
  /** Leave the builder without saving (called only after the administrator agreed to lose any unsaved changes). */
  onClose: () => void;
  /** The server saved the quiz; this is what it now holds. */
  onSaved: (quiz: AdminQuiz) => void;
}) {
  const [draft, setDraft] = useState<QuizDraft>(() => (quiz ? draftFromQuiz(quiz) : newDraft()));
  const baseline = useRef('');
  if (baseline.current === '') baseline.current = fingerprint(draft);
  const [selection, setSelection] = useState<Selection>(() => {
    if (mode === 'create' || !quiz) return 'details';
    return initialQuestionId && quiz.questions.some((q) => q.id === initialQuestionId) ? initialQuestionId : (quiz.questions[0]?.id ?? 'details');
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const savingRef = useRef(false);
  const dragRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const dirty = useMemo(() => fingerprint(draft) !== baseline.current, [draft]);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  // The dialogs above the builder have their own Escape; while one is open (or a drag is being cancelled with Escape) the builder must not also read it as "close".
  const nested = useRef(false);
  nested.current = confirmDiscard || deleteId !== null || previewOpen;

  const questions = draft.questions;
  const selectedIndex = selection === 'details' ? -1 : questions.findIndex((q) => q.id === selection);
  const selected: QuizQuestion | null = selectedIndex >= 0 ? questions[selectedIndex] : null;

  const say = useCallback((message: string) => setAnnouncement(message), []);
  const select = useCallback((next: Selection) => {
    setSelection(next);
    setListOpen(false);
  }, []);

  const updateQuestion = useCallback((id: string, change: (q: QuizQuestion) => QuizQuestion) => {
    setDraft((current) => ({ ...current, questions: current.questions.map((q) => (q.id === id ? change(q) : q)) }));
  }, []);

  const addQuestion = useCallback(() => {
    const added = blankQuestion();
    setDraft((current) => (current.questions.length >= QUIZ_LIMITS.questions ? current : { ...current, questions: [...current.questions, added] }));
    setSelection(added.id);
    setListOpen(false);
    say(`Question ${draftRef.current.questions.length + 1} added. Not saved yet.`);
  }, [say]);

  const duplicateQuestion = useCallback(
    (id: string) => {
      const at = draftRef.current.questions.findIndex((q) => q.id === id);
      if (at < 0 || draftRef.current.questions.length >= QUIZ_LIMITS.questions) return;
      const copy = copyQuestion(draftRef.current.questions[at]);
      setDraft((current) => {
        const index = current.questions.findIndex((q) => q.id === id);
        if (index < 0) return current;
        const next = [...current.questions];
        next.splice(index + 1, 0, copy);
        return { ...current, questions: next };
      });
      setSelection(copy.id);
      say(`Question ${at + 1} duplicated as question ${at + 2}. Not saved yet.`);
    },
    [say],
  );

  const removeQuestion = useCallback(
    (id: string) => {
      const list = draftRef.current.questions;
      const at = list.findIndex((q) => q.id === id);
      if (at < 0 || list.length <= 1) return;
      const neighbour = list[at + 1] ?? list[at - 1];
      setDraft((current) => ({ ...current, questions: current.questions.filter((q) => q.id !== id) }));
      setSelection((current) => (current === id ? neighbour.id : current));
      say(`Question ${at + 1} deleted. It is removed from the quiz when you save.`);
    },
    [say],
  );

  const requestDelete = useCallback(
    (id: string) => {
      const q = draftRef.current.questions.find((x) => x.id === id);
      if (!q) return;
      // A question nobody has written anything in goes at once; one with content asks first.
      if (hasContent(q)) setDeleteId(id);
      else removeQuestion(id);
    },
    [removeQuestion],
  );

  const moveQuestion = useCallback(
    (from: number, to: number) => {
      setDraft((current) => ({ ...current, questions: moveItem(current.questions, from, to) }));
      say(`Question ${from + 1} moved to position ${to + 1} of ${draftRef.current.questions.length}. Not saved yet.`);
    },
    [say],
  );

  const save = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) return false;
    const current = draftRef.current;
    const problem = draftProblem(current);
    if (problem) {
      setError(problem);
      // Take the author to what is wrong.
      if (current.title.trim() === '') setSelection('details');
      else {
        const bad = current.questions.find((q) => questionIssues(q).length > 0);
        if (bad) setSelection(bad.id);
      }
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const payload = draftPayload(current);
      const saved =
        mode === 'edit' && quiz
          ? await api.request<AdminQuiz>(`/admin/quizzes/${quiz.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, version: quiz.version }) })
          : await api.request<AdminQuiz>('/admin/quizzes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      // What was sent is now what is saved: nothing is unsaved while the builder closes.
      baseline.current = fingerprint(current);
      dirtyRef.current = false;
      onSavedRef.current(saved);
      return true;
    } catch (e) {
      // The working copy stays exactly as it is.
      setError(friendlyError(e, 'The quiz could not be saved.'));
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [mode, quiz]);

  const requestClose = useCallback(() => {
    if (savingRef.current) return;
    if (dirtyRef.current) setConfirmDiscard(true);
    else onCloseRef.current();
  }, []);
  const closeFromModal = useCallback(() => {
    if (nested.current || dragRef.current) return;
    requestClose();
  }, [requestClose]);

  // Tell the Admin's single guard there is unsaved work (refresh, closing the tab, Back and links are then asked about by it).
  useUnsavedWork('quiz-builder', dirty, {
    label: 'Quiz Builder',
    kind: 'changes',
    canSave: true,
    save,
    reset: () => onCloseRef.current(),
  });

  const title = draft.title.trim();
  const total = questions.length;
  const deleting = deleteId ? questions.findIndex((q) => q.id === deleteId) : -1;

  return (
    <>
      <Modal isOpen onClose={closeFromModal} variant="workspace" title="Quiz editor" description="Create or edit a draft quiz.">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">Quiz editor</p>
            <h3 id="modal-title" className="truncate text-lg font-semibold text-slate-900">
              {title || 'New Quiz'}
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-700">
              <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 font-medium text-slate-800">Draft</span>
              {mode === 'edit' && quiz && <span className="font-mono">v{quiz.version}</span>}
              <span>
                {total} {total === 1 ? 'question' : 'questions'}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {dirty && (
              <span role="status" className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-950">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                Unsaved changes
              </span>
            )}
            <button type="button" onClick={requestClose} aria-label="Close the quiz editor" title="Close (Escape)" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
              <Icon name="close" className="h-5 w-5" />
            </button>
          </div>
        </header>

        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 lg:grid lg:grid-cols-[minmax(18rem,28%)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
          <aside aria-label="Questions" className="border-b border-slate-200 bg-white p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <button
              type="button"
              aria-expanded={listOpen}
              aria-controls="quiz-outline"
              onClick={() => setListOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 lg:hidden"
            >
              <span>
                {selection === 'details' ? 'Quiz details' : `Question ${selectedIndex + 1}`} <span className="font-normal text-slate-600">· {total} {total === 1 ? 'question' : 'questions'}</span>
              </span>
              <Icon name={listOpen ? 'up' : 'down'} />
            </button>
            <div id="quiz-outline" className={listOpen ? 'mt-3 lg:mt-0' : 'hidden lg:block'}>
              <QuestionSidebar title={draft.title} questions={questions} selection={selection} disabled={saving} dragRef={dragRef} onSelect={select} onAdd={addQuestion} onDuplicate={duplicateQuestion} onDelete={requestDelete} onMove={moveQuestion} />
            </div>
          </aside>

          <section aria-label={selected ? `Question ${selectedIndex + 1}` : 'Quiz details'} className="p-4 sm:p-6 lg:overflow-y-auto">
            <div className="mx-auto max-w-3xl">
              {selected ? (
                <QuestionEditor key={selected.id} question={selected} index={selectedIndex} disabled={saving} update={updateQuestion} announce={say} />
              ) : (
                <QuizDetailsForm title={draft.title} description={draft.description} disabled={saving} onTitle={(value) => setDraft((current) => ({ ...current, title: value }))} onDescription={(value) => setDraft((current) => ({ ...current, description: value }))} />
              )}
            </div>
          </section>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1 text-sm">
            {error ? (
              <p role="alert" className="flex items-start gap-1.5 font-medium text-rose-900">
                <Icon name="alert" className="mt-0.5 h-4 w-4" />
                <span>
                  {error} <span className="font-normal">Nothing was lost: your changes are still here.</span>
                </span>
              </p>
            ) : dirty ? (
              <p className="flex items-center gap-1.5 font-medium text-amber-950">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-600" />
                Unsaved changes
                <span className="font-normal text-slate-700">· saved only when you choose {mode === 'create' ? 'Save Draft Quiz' : 'Save Changes'}</span>
              </p>
            ) : (
              <p className="text-slate-600">No unsaved changes.</p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={requestClose} disabled={saving} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
              Cancel
            </button>
            <button type="button" onClick={() => setPreviewOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
              <Icon name="phone" />
              Preview Quiz
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || (mode === 'edit' && !dirty)}
              aria-busy={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none" aria-hidden="true" />}
              {saving ? 'Saving…' : mode === 'create' ? 'Save Draft Quiz' : 'Save Changes'}
            </button>
          </div>
        </footer>
      </Modal>

      {/* The dialogs sit beside the builder (not inside it), so each keeps its own focus and Escape. */}
      <ConfirmDialog
        isOpen={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          onCloseRef.current();
        }}
        title="Discard unsaved quiz changes?"
        message="Your changes to this quiz will be lost. What is already saved stays as it is."
        confirmLabel="Discard Changes"
        cancelLabel="Keep Editing"
        isDestructive
      />
      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) removeQuestion(deleteId);
          setDeleteId(null);
        }}
        title="Delete this question?"
        message={`${deleting >= 0 ? `Question ${deleting + 1} and its` : 'This question and its'} answer options will be removed from the quiz when you save.`}
        confirmLabel="Delete Question"
        isDestructive
      />
      {previewOpen && <QuizPhonePreview draft={draft} onClose={() => setPreviewOpen(false)} />}
    </>
  );
}
