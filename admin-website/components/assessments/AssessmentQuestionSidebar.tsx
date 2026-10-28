'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { questionIssues } from '../../lib/assessment-builder';
import { LIMITS, type EditorQuestion } from '../../lib/assessments';
import { rowShift, usePointerSort } from '../../lib/pointer-sort';
import Icon, { GripIcon } from '../quizzes/icons';

/**
 * The Assessment Question Builder's list of questions, in the working copy's order: the one being edited marked, what each is missing, and (for those who may edit) select, drag to reorder by the
 * handle (mouse, finger and pen), move up and down, duplicate and delete. Every change here is a change to the WORKING COPY: nothing is sent until the assessment's own Save, which sends the order
 * with the rest. The drag is the Admin's pointer sort (lib/pointer-sort.ts); the handle also answers the up and down arrow keys, and the Move buttons need no pointer at all.
 */
const pad = (n: number) => String(n).padStart(2, '0');
const TOOL = 'inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

interface RowProps {
  question: EditorQuestion;
  index: number;
  total: number;
  selected: boolean;
  shift: number;
  dragging: boolean;
  dragActive: boolean;
  disabled: boolean;
  canEdit: boolean;
  canAdd: boolean;
  registerRow: (id: string, element: HTMLElement | null) => void;
  handle: ReturnType<typeof usePointerSort>['handle'];
  onSelect: (key: string) => void;
  onMoveBy: (index: number, delta: -1 | 1, kind: 'handle' | 'up' | 'down') => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
}

const Row = memo(function Row({ question, index, total, selected, shift, dragging, dragActive, disabled, canEdit, canAdd, registerRow, handle, onSelect, onMoveBy, onDuplicate, onDelete }: RowProps) {
  const issues = useMemo(() => questionIssues(question, index), [question, index]);
  const first = issues[0];
  const name = question.prompt.trim() ? question.prompt.trim() : `question ${index + 1}`;
  const rowElement = useRef<HTMLLIElement | null>(null);
  // The chosen question stays in view in a long list (nothing moves when it already is).
  useEffect(() => {
    if (selected) rowElement.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  return (
    <li
      ref={(element) => {
        rowElement.current = element;
        registerRow(question.key, element);
      }}
      style={shift ? { transform: `translateY(${shift}px)` } : undefined}
      className={`relative ${dragActive && !dragging ? 'transition-transform duration-150 ease-out motion-reduce:transition-none' : ''} ${dragging ? 'z-30' : ''}`}
    >
      <div className={`rounded-xl border ${selected ? 'border-amber-500 bg-amber-50/60 ring-1 ring-amber-200' : 'border-slate-200 bg-white hover:bg-slate-50'} ${dragging ? 'shadow-xl ring-1 ring-amber-300' : ''}`}>
        <div className="flex items-start gap-1 p-2">
          {canEdit && (
            <button
              type="button"
              data-sort-id={question.key}
              data-a-handle={question.key}
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
              aria-label={`Drag handle for question ${index + 1} of ${total}. Drag it, or press the up or down arrow key to move it. The new order is saved with the assessment.`}
              title="Drag to reorder"
            >
              <GripIcon />
            </button>
          )}
          <button type="button" data-a-select={question.key} onClick={() => onSelect(question.key)} aria-current={selected ? 'true' : undefined} aria-label={`Question ${index + 1}: ${name}. ${first ? first.short : 'Complete'}`} className="min-w-0 flex-1 rounded-md py-1 text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
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
        {selected && canEdit && (
          <div className="flex flex-wrap gap-1.5 border-t border-amber-200/70 px-2 py-2" role="group" aria-label={`Actions for question ${index + 1}`}>
            <button type="button" data-a-up={question.key} className={TOOL} aria-label={`Move question ${index + 1} up`} disabled={disabled || index === 0} onClick={() => onMoveBy(index, -1, 'up')}>
              <Icon name="up" className="h-3.5 w-3.5" />
              Up
            </button>
            <button type="button" data-a-down={question.key} className={TOOL} aria-label={`Move question ${index + 1} down`} disabled={disabled || index === total - 1} onClick={() => onMoveBy(index, 1, 'down')}>
              <Icon name="down" className="h-3.5 w-3.5" />
              Down
            </button>
            <button type="button" className={TOOL} aria-label={`Duplicate question ${index + 1}`} disabled={disabled || !canAdd} title={canAdd ? 'Duplicate this question' : `An assessment can have at most ${LIMITS.questionsMax} questions`} onClick={() => onDuplicate(index)}>
              <Icon name="copy" className="h-3.5 w-3.5" />
              Duplicate
            </button>
            <button type="button" className={`${TOOL} text-rose-800`} aria-label={`Delete question ${index + 1}`} disabled={disabled} onClick={() => onDelete(index)}>
              <Icon name="trash" className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>
    </li>
  );
});

export default function AssessmentQuestionSidebar({
  questions,
  selectedKey,
  disabled,
  canEdit,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
}: {
  questions: EditorQuestion[];
  selectedKey: string | null;
  disabled: boolean;
  /** False for a role that can read but not change the assessment: no drag, no actions. */
  canEdit: boolean;
  onSelect: (key: string) => void;
  onAdd: () => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  const ids = useMemo(() => questions.map((q) => q.key), [questions]);
  const { listRef, registerRow, handle, drag } = usePointerSort({ ids, disabled: disabled || !canEdit, onMove });
  const total = questions.length;
  const canAdd = total < LIMITS.questionsMax;

  // After a move by keyboard or button the row has been re-attached in its new place: put the keyboard back on the control that was used (or its neighbour when it is now at an end).
  const focusAfter = useRef<{ key: string; kind: 'handle' | 'up' | 'down' } | null>(null);
  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    const find = (kind: string) => document.querySelector<HTMLButtonElement>(`[data-a-${kind}="${target.key}"]`);
    const wanted = find(target.kind);
    (wanted && !wanted.disabled ? wanted : (find(target.kind === 'up' ? 'down' : 'up') ?? find('handle')))?.focus();
  }, [questions]);

  // Stable across typing (the list of ids is read through a ref), so the rows of the questions nobody is typing in do not draw again.
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const moveBy = useCallback(
    (index: number, delta: -1 | 1, kind: 'handle' | 'up' | 'down') => {
      const key = idsRef.current[index];
      if (key) focusAfter.current = { key, kind };
      onMove(index, index + delta);
    },
    [onMove],
  );

  return (
    <nav aria-label="Assessment questions" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
          Questions{' '}
          <span className="font-mono normal-case text-slate-500">
            ({total} of {LIMITS.questionsMax})
          </span>
        </h3>
        {canEdit && (
          <button
            type="button"
            onClick={onAdd}
            disabled={disabled || !canAdd}
            title={canAdd ? 'Add a question' : `An assessment can have at most ${LIMITS.questionsMax} questions`}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
            Add Question
          </button>
        )}
      </div>

      {total === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-700">No questions yet.{canEdit ? ' Choose Add Question to write the first one.' : ''}</p>
      ) : (
        <ol
          ref={(element) => {
            listRef.current = element;
          }}
          aria-label="Questions"
          className={`relative space-y-2 ${drag ? 'cursor-grabbing select-none' : ''}`}
        >
          {questions.map((question, index) => (
            <Row
              key={question.key}
              question={question}
              index={index}
              total={total}
              selected={selectedKey === question.key}
              shift={rowShift(drag, index)}
              dragging={drag?.id === question.key}
              dragActive={Boolean(drag)}
              disabled={disabled}
              canEdit={canEdit}
              canAdd={canAdd}
              registerRow={registerRow}
              handle={handle}
              onSelect={onSelect}
              onMoveBy={moveBy}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          ))}
          {/* Where the dragged question will land. */}
          {drag && <li role="presentation" aria-hidden="true" style={{ top: drag.gapTop, height: drag.height }} className="pointer-events-none absolute inset-x-0 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/70" />}
        </ol>
      )}
    </nav>
  );
}
