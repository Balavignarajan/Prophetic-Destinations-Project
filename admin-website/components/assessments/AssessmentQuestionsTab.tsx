'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { promptFieldId, questionHasContent, questionIssues } from '../../lib/assessment-builder';
import { LIMITS } from '../../lib/assessments';
import { ConfirmDialog } from '../ui';
import Icon from '../quizzes/icons';
import AssessmentQuestionEditor from './AssessmentQuestionEditor';
import AssessmentQuestionSidebar from './AssessmentQuestionSidebar';
import type { AssessmentEditor } from './useAssessmentEditor';

/**
 * The "Questions" tab: the Assessment Question Builder. The questions are listed on the left (numbered, with what each is missing) and ONE question at a time is edited on the right, instead of
 * one long page of every question and answer. On a narrow screen the list is a collapsible bar above the editor. The tab only arranges what the working copy (components/assessments/
 * useAssessmentEditor.ts) offers: all its changes, including the order, stay local until the assessment is saved.
 */
export default function AssessmentQuestionsTab({
  editor,
  readOnly,
  focusQuestion,
}: {
  editor: AssessmentEditor;
  readOnly: boolean;
  /** A request to open a question (from a problem link): its place, and a number that changes with every request. */
  focusQuestion: { index: number; nonce: number } | null;
}) {
  const { state } = editor;
  const questions = state.questions;
  const [selectedKey, setSelectedKey] = useState<string | null>(() => questions[0]?.key ?? null);
  const [listOpen, setListOpen] = useState(true);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  const selectedIndex = Math.max(
    0,
    questions.findIndex((q) => q.key === selectedKey),
  );
  const selected = questions.length > 0 ? questions[selectedIndex] : null;
  // If the chosen question is gone (removed, or the copy was reloaded), the first one stands in.
  useEffect(() => {
    if (questions.length > 0 && !questions.some((q) => q.key === selectedKey)) setSelectedKey(questions[0].key);
    if (questions.length === 0 && selectedKey !== null) setSelectedKey(null);
  }, [questions, selectedKey]);

  useEffect(() => {
    if (!focusQuestion) return;
    const target = questions[focusQuestion.index];
    if (target) setSelectedKey(target.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusQuestion?.nonce]);

  const { addQuestion, duplicateQuestion, removeQuestion, moveQuestion, setQuestion, setOption, addOption, removeOption, moveOption, fillZeros } = editor;
  const questionsRef = React.useRef(questions);
  questionsRef.current = questions;
  const editorRef = useRef<HTMLElement | null>(null);
  // Where the keyboard goes next, once the change that asked for it has been drawn: a new question's text, or the row (or the empty state's button) that follows a deletion.
  const pendingPrompt = useRef<string | null>(null);
  const pendingRow = useRef<string | null>(null);

  const select = useCallback((key: string) => {
    setSelectedKey(key);
    setListOpen(false);
    // On a narrow screen the editor sits below the list: bring it into view (nothing moves when it already is).
    window.requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: 'nearest' }));
  }, []);
  const add = useCallback(() => {
    const key = addQuestion();
    if (key) {
      pendingPrompt.current = key;
      select(key);
    }
  }, [addQuestion, select]);
  const duplicate = useCallback(
    (index: number) => {
      const key = duplicateQuestion(index);
      if (key) {
        pendingPrompt.current = key;
        select(key);
      }
    },
    [duplicateQuestion, select],
  );
  const removeAt = useCallback(
    (index: number) => {
      const list = questionsRef.current;
      const neighbour = list[index + 1] ?? list[index - 1];
      removeQuestion(index);
      pendingRow.current = neighbour?.key ?? '';
      setSelectedKey((current) => (current === list[index]?.key ? (neighbour?.key ?? null) : current));
    },
    [removeQuestion],
  );

  // After adding or duplicating, the new question's text is ready to type in.
  useEffect(() => {
    if (!selected || pendingPrompt.current !== selected.key) return;
    pendingPrompt.current = null;
    document.getElementById(promptFieldId(selectedIndex))?.focus({ preventScroll: true });
  }, [selected, selectedIndex]);
  // After a deletion, the keyboard lands on the question that took its place (or the button that adds the first one), not on a control that is gone.
  useEffect(() => {
    const key = pendingRow.current;
    if (key === null) return;
    pendingRow.current = null;
    (key === '' ? document.getElementById('as-q-add-first') : document.querySelector<HTMLElement>(`[data-a-select="${key}"]`))?.focus();
  }, [questions]);

  const completeCount = useMemo(() => questions.filter((q, qi) => questionIssues(q, qi).length === 0).length, [questions]);
  const requestDelete = useCallback(
    (index: number) => {
      const q = questionsRef.current[index];
      if (!q) return;
      // A question nobody has written anything in goes at once; one with content asks first.
      if (questionHasContent(q)) setDeleteIndex(index);
      else removeAt(index);
    },
    [removeAt],
  );

  const disabled = editor.saving;
  const anyOption = questions.some((q) => q.options.length > 0);

  return (
    <div id="as-questions" tabIndex={-1} className="space-y-4 focus:outline-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Questions</h2>
          <p className="text-xs text-slate-700">
            Single choice. Each question needs {LIMITS.optionsMin} to {LIMITS.optionsMax} answers; at most {LIMITS.questionsMax} questions. The order here is the order learners see, and it is saved with the assessment.
          </p>
          {questions.length > 0 && (
            <p className={`mt-0.5 text-xs font-medium ${completeCount === questions.length ? 'text-emerald-800' : 'text-amber-950'}`}>
              {completeCount === questions.length ? `All ${questions.length} ${questions.length === 1 ? 'question is' : 'questions are'} complete.` : `${completeCount} of ${questions.length} questions complete. The rest are marked in the list.`}
            </p>
          )}
        </div>
        {!readOnly && anyOption && (
          <button type="button" onClick={fillZeros} disabled={disabled} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            Set all empty points to 0
          </button>
        )}
      </div>

      <div className="gap-6 lg:grid lg:grid-cols-[minmax(17rem,28%)_minmax(0,1fr)] lg:items-start">
        <aside className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs lg:sticky lg:top-4 lg:mb-0 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto">
          <button
            type="button"
            aria-expanded={listOpen}
            aria-controls="as-question-list"
            onClick={() => setListOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 lg:hidden"
          >
            <span>
              {selected ? `Question ${selectedIndex + 1}` : 'Questions'} <span className="font-normal text-slate-600">· {questions.length} {questions.length === 1 ? 'question' : 'questions'}</span>
            </span>
            <Icon name={listOpen ? 'up' : 'down'} />
          </button>
          <div id="as-question-list" className={listOpen ? 'mt-3 lg:mt-0' : 'hidden lg:block'}>
            <AssessmentQuestionSidebar questions={questions} selectedKey={selected?.key ?? null} disabled={disabled} canEdit={!readOnly} onSelect={select} onAdd={add} onDuplicate={duplicate} onDelete={requestDelete} onMove={moveQuestion} />
          </div>
        </aside>

        <section ref={editorRef} aria-label={selected ? `Question ${selectedIndex + 1}` : 'Question editor'} className="min-w-0">
          {selected ? (
            <AssessmentQuestionEditor
              key={selected.key}
              question={selected}
              index={selectedIndex}
              readOnly={readOnly}
              disabled={disabled}
              attempted={editor.attempted}
              setQuestion={setQuestion}
              setOption={setOption}
              addOption={addOption}
              removeOption={removeOption}
              moveOption={moveOption}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="text-sm font-semibold text-slate-900">This assessment has no questions yet</p>
              <p className="mt-1 text-xs text-slate-700">{readOnly ? 'Questions will appear here.' : 'Add a question, then give each of its answers points for the three learning levels.'}</p>
              {!readOnly && (
                <button id="as-q-add-first" type="button" onClick={add} disabled={disabled} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                  <Icon name="plus" />
                  Add Question
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        isOpen={deleteIndex !== null}
        onClose={() => setDeleteIndex(null)}
        onConfirm={() => {
          if (deleteIndex !== null) removeAt(deleteIndex);
          setDeleteIndex(null);
        }}
        title="Delete this question?"
        message="The question and its answers are removed from the editor. Nothing changes on the server until you save."
        confirmLabel="Delete question"
        isDestructive
        safeFocus
      />
    </div>
  );
}
