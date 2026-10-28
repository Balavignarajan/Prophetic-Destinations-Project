'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';
import { rowShift, usePointerSort } from '../lib/pointer-sort';
import { useDraftOrder } from '../lib/use-draft-order';
import type { LessonSummary } from '../lib/types';
import CoverThumb from './CoverThumb';
import OrderBar from './OrderBar';
import { EmptyState, StatusBadge } from './ui';

interface Props {
  courseId: string;
  /** The course's direct lessons in the backend's order (position). */
  lessons: LessonSummary[];
  canWrite: boolean;
  /** Called when the administrator starts adding a lesson. The page asks about an unsaved order before it does anything (adding changes the list). */
  onAddLesson: () => void;
  /** Called when the administrator starts duplicating a lesson (same: the page asks about an unsaved order first). */
  onDuplicate: (lesson: { id: string; title: string }) => void;
  /** Told the lessons the backend returned after a successful save. */
  onSaved: (lessons: LessonSummary[]) => void;
  /** Reloads the course from the backend (after a stale-order conflict, "Reload latest order"). */
  onReload: () => void;
  /** Opens the course's own Publish changes confirmation, when the signed-in user may publish the catalog. Omitted otherwise. */
  onPublishCatalog?: () => void;
}

const LEVEL_BADGE = 'text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded';

/**
 * The lessons placed directly in a course, split by their real status: Published (ordered here), Draft, and the review states in between. Only PUBLISHED lessons take part in the ordering.
 * The order is a DRAFT until Save Order (lib/use-draft-order.ts; drag a lesson by its handle, press the up or down arrow key on it, or use its arrow buttons: nothing is sent), and is then saved
 * with the existing course lesson order API: the full list, in which every non-published lesson keeps its own slot, plus the order this screen last saw, so the server refuses (409) if anyone
 * changed it meanwhile. Saving changes the authoring order only (no lesson content, revision or status changes). What learners see changes when the course is published again ("Publish
 * changes"), which is how the published catalog has always taken over the authoring order.
 */
export default function DirectLessonLists({ courseId, lessons, canWrite, onAddLesson, onDuplicate, onSaved, onReload, onPublishCatalog }: Props) {
  const published = useMemo(() => lessons.filter((l) => l.status === 'PUBLISHED'), [lessons]);
  const drafts = useMemo(() => lessons.filter((l) => l.status === 'DRAFT'), [lessons]);
  const inReview = useMemo(() => lessons.filter((l) => l.status === 'READY_FOR_REVIEW' || l.status === 'APPROVED'), [lessons]);

  // The server wants every lesson of the course, each non-published one in its own slot; the response is kept whole for the page.
  const stored = useRef<LessonSummary[]>(lessons);
  const order = useDraftOrder<LessonSummary>({
    label: 'Direct lessons',
    scope: 'direct-lessons',
    items: published,
    canWrite,
    itemLabel: (lesson) => lesson.title,
    save: async (ids) => {
      const remaining = [...ids];
      const full = lessons.map((l) => (l.status === 'PUBLISHED' ? (remaining.shift() as string) : l.id));
      const result = await api.request<{ items: LessonSummary[] }>(`/admin/courses/${courseId}/lessons/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonIds: full, previousLessonIds: lessons.map((l) => l.id) }),
      });
      stored.current = result.items;
      return result.items.filter((l) => l.status === 'PUBLISHED');
    },
    onSaved: () => onSaved(stored.current),
    onReload,
  });
  const ids = useMemo(() => order.ordered.map((l) => l.id), [order.ordered]);
  const { listRef, registerRow, handle, drag } = usePointerSort({ ids, disabled: !canWrite || order.saving, onMove: order.move });
  const total = order.ordered.length;

  // After a move by keyboard or button the row has been re-attached in its new place: put the keyboard back on the control that was used.
  const focusAfter = useRef<{ id: string; kind: 'handle' | 'up' | 'down' } | null>(null);
  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    const find = (kind: string) => document.querySelector<HTMLButtonElement>(`[data-direct-${kind}="${target.id}"]`);
    const wanted = find(target.kind);
    (wanted && !wanted.disabled ? wanted : (find(target.kind === 'up' ? 'down' : 'up') ?? find('handle')))?.focus();
  }, [order.ordered]);
  const moveBy = (index: number, delta: -1 | 1, kind: 'handle' | 'up' | 'down') => {
    const lesson = order.ordered[index];
    if (lesson) focusAfter.current = { id: lesson.id, kind };
    order.move(index, index + delta);
  };

  const row = (lesson: LessonSummary, controls?: React.ReactNode, leading?: React.ReactNode) => (
    <div className="p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {leading}
        <CoverThumb mediaId={lesson.coverMediaId} />
        <div className="min-w-0">
          <Link href={`/lessons/${lesson.id}`} className="font-semibold text-slate-900 hover:text-amber-700 break-words">{lesson.title}</Link>
          <div className="mt-1 flex flex-wrap gap-2 items-center">
            <StatusBadge status={lesson.status} />
            {lesson.levels.map((level) => <span key={level} className={LEVEL_BADGE}>{level}</span>)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link href={`/lessons/${lesson.id}`} className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">Edit lesson</Link>
        {canWrite && (
          <button aria-label={`Duplicate lesson ${lesson.title}`} onClick={() => onDuplicate({ id: lesson.id, title: lesson.title })} className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg">
            Duplicate lesson
          </button>
        )}
        {controls}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------------ Published */}
      <section aria-labelledby="published-lessons-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="published-lessons-heading" className="font-serif text-xl font-bold text-slate-900">Published Lessons</h2>
            <p className="text-xs text-slate-600 mt-0.5">
              {published.length} published{drafts.length + inReview.length > 0 ? ` · ${drafts.length + inReview.length} not published` : ''}. Arrange lessons to set the order learners will follow, then choose Save Order.
            </p>
          </div>
          {canWrite && (
            <button onClick={onAddLesson} className="px-3.5 py-2 text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg shadow-xs">Add lesson</button>
          )}
        </div>

        <p role="status" aria-live="polite" className="sr-only">{order.announcement}</p>

        {order.saved && !order.dirty && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <span>Order saved successfully. Learners see the new order after the course is published again.</span>
            <span className="flex gap-2">
              {onPublishCatalog && <button type="button" onClick={onPublishCatalog} className="px-3 py-1 text-xs font-semibold rounded-md border border-emerald-300 hover:bg-emerald-100">Publish changes…</button>}
              <button type="button" onClick={order.dismiss} aria-label="Dismiss message" className="rounded px-1.5 text-lg leading-none hover:bg-black/5">&times;</button>
            </span>
          </div>
        )}

        {published.length === 0 ? (
          <EmptyState title="No published lessons" description="Lessons appear here once they are published. Draft lessons are listed below." />
        ) : (
          <>
            {canWrite && total > 1 && <p className="text-xs text-slate-600">Drag lessons to arrange them. Click Save Order to apply your changes.</p>}
            <ul
              ref={(element) => {
                listRef.current = element;
              }}
              className={`relative bg-white border border-slate-200 rounded-xl shadow-xs ${drag ? 'cursor-grabbing select-none' : ''}`}
              aria-label="Published lessons, in order"
              aria-busy={order.saving}
            >
              {order.ordered.map((lesson, index) => {
                const dragging = drag?.id === lesson.id;
                const shift = rowShift(drag, index);
                return (
                  <li
                    key={lesson.id}
                    ref={(element) => registerRow(lesson.id, element)}
                    style={shift ? { transform: `translateY(${shift}px)` } : undefined}
                    className={`relative ${index === 0 ? '' : 'border-t border-slate-100'} ${drag && !dragging ? 'transition-transform duration-150 ease-out motion-reduce:transition-none' : ''} ${
                      dragging ? 'z-30 rounded-xl border-transparent bg-white shadow-xl ring-1 ring-amber-300' : ''
                    }`}
                  >
                    {row(
                      lesson,
                      canWrite ? (
                        <span className="flex items-center">
                          <button type="button" data-direct-up={lesson.id} aria-label={`Move ${lesson.title} up`} disabled={order.saving || index === 0} onClick={() => moveBy(index, -1, 'up')} className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30 rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">↑</button>
                          <button type="button" data-direct-down={lesson.id} aria-label={`Move ${lesson.title} down`} disabled={order.saving || index === total - 1} onClick={() => moveBy(index, 1, 'down')} className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30 rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">↓</button>
                        </span>
                      ) : undefined,
                      <>
                        {canWrite && (
                          <button
                            type="button"
                            data-sort-id={lesson.id}
                            data-direct-handle={lesson.id}
                            disabled={order.saving}
                            {...handle}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                moveBy(index, -1, 'handle');
                              } else if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                moveBy(index, 1, 'handle');
                              }
                            }}
                            className={`touch-none select-none px-1 py-1 text-slate-500 hover:text-slate-800 disabled:opacity-30 rounded-xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                            aria-label={`Drag handle for ${lesson.title}, position ${index + 1} of ${total}. Drag it, or press the up or down arrow key to move it. The new order is not saved until you choose Save Order.`}
                            title="Drag to reorder"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                              <circle cx="7" cy="5" r="1.4" /><circle cx="13" cy="5" r="1.4" /><circle cx="7" cy="10" r="1.4" /><circle cx="13" cy="10" r="1.4" /><circle cx="7" cy="15" r="1.4" /><circle cx="13" cy="15" r="1.4" />
                            </svg>
                          </button>
                        )}
                        <span className="w-7 h-7 rounded-md bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center">
                          <span className="sr-only">Position </span>
                          {index + 1}
                        </span>
                      </>,
                    )}
                  </li>
                );
              })}
              {/* Where the dragged row will land. */}
              {drag && <li role="presentation" aria-hidden="true" style={{ top: drag.gapTop, height: drag.height }} className="pointer-events-none absolute inset-x-1 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/70" />}
            </ul>
            {canWrite && <OrderBar order={order} />}
          </>
        )}
      </section>

      {/* ------------------------------------------------------------------ In review / approved */}
      {inReview.length > 0 && (
        <section aria-labelledby="review-lessons-heading" className="space-y-3">
          <div>
            <h2 id="review-lessons-heading" className="font-serif text-xl font-bold text-slate-900">Waiting for review or approved</h2>
            <p className="text-xs text-slate-600 mt-0.5">{inReview.length} lesson{inReview.length === 1 ? '' : 's'} not published yet.</p>
          </div>
          <ul className="bg-white border border-slate-200 rounded-xl shadow-xs divide-y divide-slate-100">
            {inReview.map((lesson) => <li key={lesson.id}>{row(lesson)}</li>)}
          </ul>
        </section>
      )}

      {/* ------------------------------------------------------------------ Drafts */}
      <section aria-labelledby="draft-lessons-heading" className="space-y-3">
        <div>
          <h2 id="draft-lessons-heading" className="font-serif text-xl font-bold text-slate-900">Draft Lessons</h2>
          <p className="text-xs text-slate-600 mt-0.5">{drafts.length} draft{drafts.length === 1 ? '' : 's'}. A lesson edited after it was published returns to Draft here until it is published again.</p>
        </div>
        {drafts.length === 0 ? (
          <EmptyState title="No draft lessons" description="New lessons start as drafts. Add a lesson or copy one from the lesson library." action={canWrite ? <button onClick={onAddLesson} className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg">Add lesson</button> : undefined} />
        ) : (
          <ul className="bg-white border border-slate-200 rounded-xl shadow-xs divide-y divide-slate-100">
            {drafts.map((lesson) => <li key={lesson.id}>{row(lesson)}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
