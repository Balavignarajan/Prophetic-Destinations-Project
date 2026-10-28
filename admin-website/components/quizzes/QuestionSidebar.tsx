'use client';

import React, { memo, useEffect, useMemo, useRef } from 'react';
import { QUIZ_LIMITS, questionIssues } from '../../lib/quiz-draft';
import { rowShift, usePointerSort } from '../../lib/pointer-sort';
import type { QuizQuestion } from '../../lib/types';
import Icon, { GripIcon } from './icons';

/**
 * The Quiz Builder's question list: the questions in the working copy's order, the one being edited marked, what each is missing, and everything done to a question as a list item: select, drag to
 * reorder (by the handle only; mouse, finger and pen), move up and down, duplicate and delete. Every one of those changes the WORKING COPY only: nothing is sent until the builder's Save.
 * The drag is the Admin's own pointer sort (lib/pointer-sort.ts); the handle also answers the up and down arrow keys, and the Move buttons need no pointer at all.
 */
export type Selection = 'details' | string;

const pad = (n: number) => String(n).padStart(2, '0');

interface RowProps {
  question: QuizQuestion;
  index: number;
  total: number;
  selected: boolean;
  shift: number;
  dragging: boolean;
  dragActive: boolean;
  disabled: boolean;
  canDelete: boolean;
  canAdd: boolean;
  registerRow: (id: string, element: HTMLElement | null) => void;
  handle: ReturnType<typeof usePointerSort>['handle'];
  onSelect: (id: string) => void;
  onMoveBy: (index: number, delta: -1 | 1, kind: 'handle' | 'up' | 'down') => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

const TOOL = 'inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

const QuestionRow = memo(function QuestionRow({ question, index, total, selected, shift, dragging, dragActive, disabled, canDelete, canAdd, registerRow, handle, onSelect, onMoveBy, onDuplicate, onDelete }: RowProps) {
  const issues = useMemo(() => questionIssues(question), [question]);
  const first = issues[0];
  const name = question.prompt.trim() ? question.prompt.trim() : `question ${index + 1}`;
  return (
    <li
      ref={(element) => registerRow(question.id, element)}
      style={shift ? { transform: `translateY(${shift}px)` } : undefined}
      className={`relative ${dragActive && !dragging ? 'transition-transform duration-150 ease-out motion-reduce:transition-none' : ''} ${dragging ? 'z-30' : ''}`}
    >
      <div className={`rounded-xl border ${selected ? 'border-amber-500 bg-amber-50/60 ring-1 ring-amber-200' : 'border-slate-200 bg-white hover:bg-slate-50'} ${dragging ? 'shadow-xl ring-1 ring-amber-300' : ''}`}>
        <div className="flex items-start gap-1 p-2">
          <button
            type="button"
            data-sort-id={question.id}
            data-q-handle={question.id}
            disabled={disabled}
            {...handle}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                onMoveBy(index, -1, 'handle');
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                onMoveBy(index, 1, 'handle');
              }
            }}
            className={`touch-none select-none rounded-sm p-1.5 text-slate-500 hover:text-slate-800 disabled:opacity-30 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            aria-label={`Drag handle for question ${index + 1} of ${total}. Drag it, or press the up or down arrow key to move it. The new order is saved with the quiz.`}
            title="Drag to reorder"
          >
            <GripIcon />
          </button>
          <button type="button" onClick={() => onSelect(question.id)} aria-current={selected ? 'true' : undefined} aria-label={`Question ${index + 1}: ${name}. ${first ? first.short : 'Complete'}`} className="min-w-0 flex-1 rounded-md py-1 text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            <span className="flex items-baseline gap-2">
              <span className="font-mono text-xs font-bold text-slate-600">{pad(index + 1)}</span>
              <span className="line-clamp-2 text-sm font-medium text-slate-900 wrap-break-word">{question.prompt.trim() || <em className="font-normal text-slate-500">Untitled question</em>}</span>
            </span>
            <span className={`mt-1 flex items-center gap-1 pl-6 text-[11px] font-medium ${first ? 'text-rose-800' : 'text-emerald-800'}`} title={issues.map((i) => i.short).join(', ') || 'Complete'}>
              <Icon name={first ? 'alert' : 'check'} className="h-3 w-3" />
              {first ? first.short : 'Complete'}
              {issues.length > 1 && <span className="font-normal text-slate-600"> +{issues.length - 1} more</span>}
            </span>
          </button>
        </div>
        {selected && (
          <div className="flex flex-wrap gap-1.5 border-t border-amber-200/70 px-2 py-2" role="group" aria-label={`Actions for question ${index + 1}`}>
            <button type="button" data-q-up={question.id} className={TOOL} aria-label={`Move question ${index + 1} up`} disabled={disabled || index === 0} onClick={() => onMoveBy(index, -1, 'up')}>
              <Icon name="up" className="h-3.5 w-3.5" />
              Up
            </button>
            <button type="button" data-q-down={question.id} className={TOOL} aria-label={`Move question ${index + 1} down`} disabled={disabled || index === total - 1} onClick={() => onMoveBy(index, 1, 'down')}>
              <Icon name="down" className="h-3.5 w-3.5" />
              Down
            </button>
            <button type="button" className={TOOL} aria-label={`Duplicate question ${index + 1}`} disabled={disabled || !canAdd} title={canAdd ? 'Duplicate this question' : `A quiz can have at most ${QUIZ_LIMITS.questions} questions`} onClick={() => onDuplicate(question.id)}>
              <Icon name="copy" className="h-3.5 w-3.5" />
              Duplicate
            </button>
            <button type="button" className={`${TOOL} text-rose-800`} aria-label={`Delete question ${index + 1}`} disabled={disabled || !canDelete} title={canDelete ? 'Delete this question' : 'A quiz keeps at least one question'} onClick={() => onDelete(question.id)}>
              <Icon name="trash" className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>
    </li>
  );
});

export default function QuestionSidebar({
  title,
  questions,
  selection,
  disabled,
  dragRef,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
}: {
  title: string;
  questions: QuizQuestion[];
  selection: Selection;
  disabled: boolean;
  /** Set while a drag is under way, so the builder does not treat the Escape that cancels it as a request to close. */
  dragRef: React.MutableRefObject<boolean>;
  onSelect: (selection: Selection) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (from: number, to: number) => void;
}) {
  const ids = useMemo(() => questions.map((q) => q.id), [questions]);
  const { listRef, registerRow, handle, drag } = usePointerSort({ ids, disabled, onMove });
  dragRef.current = Boolean(drag);
  const total = questions.length;
  const canAdd = total < QUIZ_LIMITS.questions;

  // After a move by keyboard or button the row has been re-attached in its new place: put the keyboard back on the control that was used (or its neighbour when it is now at an end).
  const focusAfter = useRef<{ id: string; kind: 'handle' | 'up' | 'down' } | null>(null);
  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    const find = (kind: string) => document.querySelector<HTMLButtonElement>(`[data-q-${kind}="${target.id}"]`);
    const wanted = find(target.kind);
    (wanted && !wanted.disabled ? wanted : (find(target.kind === 'up' ? 'down' : 'up') ?? find('handle')))?.focus();
  }, [questions]);

  // Stable across typing (the list of ids is read through a ref), so the rows of the questions nobody is typing in do not draw again.
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const moveBy = React.useCallback(
    (index: number, delta: -1 | 1, kind: 'handle' | 'up' | 'down') => {
      const id = idsRef.current[index];
      if (id) focusAfter.current = { id, kind };
      onMove(index, index + delta);
    },
    [onMove],
  );
  const select = React.useCallback((id: string) => onSelect(id), [onSelect]);

  return (
    <nav aria-label="Quiz outline" className="space-y-3">
      <button
        type="button"
        onClick={() => onSelect('details')}
        aria-current={selection === 'details' ? 'true' : undefined}
        className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${selection === 'details' ? 'border-amber-500 bg-amber-50/60 ring-1 ring-amber-200' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
          <Icon name="edit" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600">Quiz details</span>
          <span className="block truncate text-sm font-semibold text-slate-900">{title.trim() || 'Untitled quiz'}</span>
          {!title.trim() && (
            <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-rose-800">
              <Icon name="alert" className="h-3 w-3" />
              Title required
            </span>
          )}
        </span>
      </button>

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
          Questions <span className="font-mono normal-case text-slate-500">({total} of {QUIZ_LIMITS.questions})</span>
        </h3>
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled || !canAdd}
          title={canAdd ? 'Add a question' : `A quiz can have at most ${QUIZ_LIMITS.questions} questions`}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <Icon name="plus" className="h-3.5 w-3.5" />
          Add Question
        </button>
      </div>

      <ol
        ref={(element) => {
          listRef.current = element;
        }}
        aria-label="Questions"
        className={`relative space-y-2 ${drag ? 'cursor-grabbing select-none' : ''}`}
      >
        {questions.map((question, index) => (
          <QuestionRow
            key={question.id}
            question={question}
            index={index}
            total={total}
            selected={selection === question.id}
            shift={rowShift(drag, index)}
            dragging={drag?.id === question.id}
            dragActive={Boolean(drag)}
            disabled={disabled}
            canDelete={total > 1}
            canAdd={canAdd}
            registerRow={registerRow}
            handle={handle}
            onSelect={select}
            onMoveBy={moveBy}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        ))}
        {/* Where the dragged question will land. */}
        {drag && <li role="presentation" aria-hidden="true" style={{ top: drag.gapTop, height: drag.height }} className="pointer-events-none absolute inset-x-0 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/70" />}
      </ol>
    </nav>
  );
}
