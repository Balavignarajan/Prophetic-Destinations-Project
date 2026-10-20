'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';
import type { LessonSummary } from '../lib/types';
import { friendlyError } from '../lib/ui-messages';
import CoverThumb from './CoverThumb';
import { EmptyState, StatusBadge } from './ui';

interface Props {
  courseId: string;
  /** The course's direct lessons in the backend's order (position). */
  lessons: LessonSummary[];
  canWrite: boolean;
  onAddLesson: () => void;
  onDuplicate: (lesson: { id: string; title: string }) => void;
  /** Told the lessons the backend returned after a successful save. */
  onSaved: (lessons: LessonSummary[]) => void;
  /** Reloads the course from the backend (after a stale-order conflict, "Reload"). */
  onReload: () => void;
  /** Opens the course's own Publish changes confirmation, when the signed-in user may publish the catalog. Omitted otherwise. */
  onPublishCatalog?: () => void;
}

const LEVEL_BADGE = 'text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded';

/**
 * The lessons placed directly in a course, split by their real status: Published (ordered here, drag and drop), Draft, and the review states in between.
 * Only PUBLISHED lessons take part in the ordering. The order is saved with the existing course lesson order API: the full list, in which every
 * non-published lesson keeps its own slot, plus the order this screen last saw, so the server refuses (409) if anyone changed it meanwhile.
 * Saving changes the authoring order only (no lesson content, revision or status changes). What learners see changes when the course is published
 * again ("Publish changes"), which is how the published catalog has always taken over the authoring order.
 */
export default function DirectLessonLists({ courseId, lessons, canWrite, onAddLesson, onDuplicate, onSaved, onReload, onPublishCatalog }: Props) {
  const published = useMemo(() => lessons.filter((l) => l.status === 'PUBLISHED'), [lessons]);
  const drafts = useMemo(() => lessons.filter((l) => l.status === 'DRAFT'), [lessons]);
  const inReview = useMemo(() => lessons.filter((l) => l.status === 'READY_FOR_REVIEW' || l.status === 'APPROVED'), [lessons]);

  const serverKey = published.map((l) => l.id).join(',');
  const [order, setOrder] = useState<string[]>(() => published.map((l) => l.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [saved, setSaved] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const baseline = useRef(serverKey);

  // The server's published list changed (reload, a lesson published or withdrawn): show it, and say so if unsaved changes were dropped.
  useEffect(() => {
    if (baseline.current === serverKey) return;
    const hadChanges = order.join(',') !== baseline.current;
    baseline.current = serverKey;
    setOrder(published.map((l) => l.id));
    if (hadChanges) setError('The list of published lessons changed, so your unsaved order was reset. Check the order and arrange it again.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  const byId = useMemo(() => new Map(published.map((l) => [l.id, l])), [published]);
  const dirty = order.join(',') !== serverKey;
  const ordered = order.map((id) => byId.get(id)).filter((l): l is LessonSummary => Boolean(l));

  const move = (from: number, to: number) => {
    if (saving || to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOrder(next);
    setSaved(false);
    setError(null);
    const title = byId.get(item)?.title ?? 'Lesson';
    setAnnounce(`${title} moved to position ${to + 1} of ${next.length}. Not saved yet.`);
  };

  const cancel = () => {
    if (saving) return;
    setOrder(published.map((l) => l.id));
    setError(null);
    setStale(false);
    setAnnounce('Order changes discarded.');
  };

  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    setStale(false);
    try {
      // Every non-published lesson keeps its slot; the published ones fill the published slots in the new order.
      const remaining = [...order];
      const full = lessons.map((l) => (l.status === 'PUBLISHED' ? (remaining.shift() as string) : l.id));
      const result = await api.request<{ items: LessonSummary[] }>(`/admin/courses/${courseId}/lessons/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonIds: full, previousLessonIds: lessons.map((l) => l.id) }),
      });
      onSaved(result.items);
      baseline.current = result.items.filter((l) => l.status === 'PUBLISHED').map((l) => l.id).join(',');
      setOrder(result.items.filter((l) => l.status === 'PUBLISHED').map((l) => l.id));
      setSaved(true);
      setAnnounce('Lesson order saved.');
    } catch (err: unknown) {
      // The arrangement stays on screen so nothing is lost; the admin can retry or reload.
      if ((err as { status?: number }).status === 409) {
        setStale(true);
        setError('The lesson order was changed by someone else (or the lessons changed) after this page was loaded, so nothing was saved. Reload to see the current order, then arrange it again.');
      } else {
        setError(friendlyError(err, 'The lesson order could not be saved. Your arrangement is still here; try again.'));
      }
    } finally {
      setSaving(false);
    }
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
              {published.length} published{drafts.length + inReview.length > 0 ? ` · ${drafts.length + inReview.length} not published` : ''}. Drag lessons to set the order learners will follow.
            </p>
          </div>
          {canWrite && (
            <button onClick={onAddLesson} className="px-3.5 py-2 text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg shadow-xs">Add lesson</button>
          )}
        </div>

        <p role="status" aria-live="polite" className="sr-only">{announce}</p>

        {(error || saved) && (
          <div role={error ? 'alert' : 'status'} className={`p-3 rounded-lg border text-sm flex flex-wrap items-center justify-between gap-2 ${error ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
            <span>
              {error ?? 'Order saved. Learners see the new order after the course is published again.'}
            </span>
            <span className="flex gap-2">
              {stale && <button type="button" onClick={onReload} className="px-3 py-1 text-xs font-semibold rounded-md border border-rose-300 hover:bg-rose-100">Reload</button>}
              {!error && onPublishCatalog && (
                <button type="button" onClick={onPublishCatalog} className="px-3 py-1 text-xs font-semibold rounded-md border border-emerald-300 hover:bg-emerald-100">Publish changes…</button>
              )}
            </span>
          </div>
        )}

        {published.length === 0 ? (
          <EmptyState title="No published lessons" description="Lessons appear here once they are published. Draft lessons are listed below." />
        ) : (
          <>
            <ul className="bg-white border border-slate-200 rounded-xl shadow-xs divide-y divide-slate-100" aria-label="Published lessons, in order" onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverIndex(null); }}>
              {ordered.map((lesson, index) => (
                <li
                  key={lesson.id}
                  onDragOver={(e) => {
                    if (!dragId || saving) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setOverIndex(index);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = order.indexOf(dragId ?? '');
                    setDragId(null);
                    setOverIndex(null);
                    if (from >= 0) move(from, index);
                  }}
                  className={`${dragId === lesson.id ? 'opacity-40' : ''} ${overIndex === index && dragId && dragId !== lesson.id ? 'border-t-2 border-amber-500' : 'border-t-2 border-transparent'}`}
                >
                  {row(
                    lesson,
                    canWrite ? (
                      <span className="flex items-center">
                        <button type="button" aria-label={`Move ${lesson.title} up`} disabled={saving || index === 0} onClick={() => move(index, index - 1)} className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30">↑</button>
                        <button type="button" aria-label={`Move ${lesson.title} down`} disabled={saving || index === ordered.length - 1} onClick={() => move(index, index + 1)} className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30">↓</button>
                      </span>
                    ) : undefined,
                    <>
                      {canWrite && (
                        <button
                          type="button"
                          draggable={!saving}
                          disabled={saving}
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', lesson.id);
                            setDragId(lesson.id);
                          }}
                          onDragEnd={() => {
                            setDragId(null);
                            setOverIndex(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              move(index, index - 1);
                            } else if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              move(index, index + 1);
                            }
                          }}
                          className="cursor-grab active:cursor-grabbing touch-none px-1 py-1 text-slate-500 hover:text-slate-800 disabled:opacity-30 rounded-xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
                          aria-label={`Drag handle for ${lesson.title}, position ${index + 1} of ${ordered.length}. Drag it, or press the up or down arrow key to move it.`}
                          title="Drag to reorder"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <circle cx="7" cy="5" r="1.4" /><circle cx="13" cy="5" r="1.4" /><circle cx="7" cy="10" r="1.4" /><circle cx="13" cy="10" r="1.4" /><circle cx="7" cy="15" r="1.4" /><circle cx="13" cy="15" r="1.4" />
                          </svg>
                        </button>
                      )}
                      <span className="w-7 h-7 rounded-md bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center">{index + 1}</span>
                    </>,
                  )}
                </li>
              ))}
            </ul>
            {canWrite && (
              <div className="flex flex-wrap items-center justify-end gap-3">
                {dirty && <span className="text-xs text-amber-800">Unsaved order changes</span>}
                <button type="button" onClick={cancel} disabled={!dirty || saving} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                <button type="button" onClick={() => void save()} disabled={!dirty || saving} aria-busy={saving} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50">
                  {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
                  {saving ? 'Saving…' : 'Save order'}
                </button>
              </div>
            )}
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
