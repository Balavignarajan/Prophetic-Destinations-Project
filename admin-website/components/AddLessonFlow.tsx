'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import type { LessonSummary } from '../lib/types';
import { friendlyError, readableLevel } from '../lib/ui-messages';
import { Modal } from './ui';

const TITLE_MAX = 200;
const FIELD = 'w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 disabled:opacity-60';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Where the new lesson goes: the course (directly) or one of its modules. */
  destination: { courseId: string; moduleId?: string };
  /** Human-readable destination for the confirmation text, e.g. "this course" or the module title. */
  destinationLabel: string;
  /** Opens the page's own destination-aware "create new lesson" form. */
  onCreateNew: () => void;
}

/**
 * "Add lesson" in a course or a module: first the choice (create a new lesson, or copy one from the lesson library), then, for a copy, a searchable
 * picker of the standalone library lessons. The copy is made by the existing duplication API with a destination; it is an independent Draft
 * appended to the end of the destination, the original is untouched, and nothing is published or refreshed. On success the new lesson's editor opens.
 */
export default function AddLessonFlow({ isOpen, onClose, destination, destinationLabel, onCreateNew }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<'choose' | 'copy'>('choose');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<LessonSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<LessonSummary | null>(null);
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  // fresh each time the dialog opens
  useEffect(() => {
    if (isOpen) {
      setStep('choose');
      setQuery('');
      setDebounced('');
      setItems(null);
      setLoadError(null);
      setSelected(null);
      setTitle('');
      setTitleEdited(false);
      setSubmitting(false);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [query]);

  const load = useCallback(async () => {
    const run = ++requestRef.current;
    setLoadError(null);
    try {
      const res = await api.request<{ items: LessonSummary[] }>(`/admin/lessons/library?limit=50${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`);
      if (run === requestRef.current) setItems(res.items);
    } catch (err: unknown) {
      if (run === requestRef.current) setLoadError(friendlyError(err, 'The lesson library could not be loaded.'));
    }
  }, [debounced]);

  useEffect(() => {
    if (isOpen && step === 'copy') void load();
  }, [isOpen, step, load, reload]);

  const choose = (lesson: LessonSummary) => {
    setSelected(lesson);
    // the title follows the chosen lesson until the admin edits it
    if (!titleEdited) setTitle(lesson.title.slice(0, TITLE_MAX));
  };

  const close = () => {
    if (submitting) return;
    if (step === 'copy' && (titleEdited || selected) && !window.confirm('Discard this selection?')) return;
    onClose();
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || submitting) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Enter a title for the copy.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.request<{ id: string }>(`/admin/lessons/${selected.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed, courseId: destination.courseId, ...(destination.moduleId ? { moduleId: destination.moduleId } : {}) }),
      });
      // The dialog stays (disabled) while the new draft opens.
      router.push(`/lessons/${created.id}?copied=1`);
    } catch (err: unknown) {
      // The selection and the title are kept so the admin can simply try again.
      setError(friendlyError(err, 'The lesson could not be copied. Nothing was added.'));
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title={step === 'choose' ? 'Add lesson' : 'Copy existing lesson'}
      description={step === 'choose' ? `Add a lesson to ${destinationLabel}.` : 'Choose a lesson from the lesson library.'}
      maxWidth="xl"
    >
      {step === 'choose' ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onCreateNew();
            }}
            className="w-full text-left rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <span className="block text-sm font-semibold text-slate-900">Create new lesson</span>
            <span className="block text-xs text-slate-600 mt-0.5">Start an empty lesson here, with its title, levels and details.</span>
          </button>
          <button
            type="button"
            onClick={() => setStep('copy')}
            className="w-full text-left rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <span className="block text-sm font-semibold text-slate-900">Copy existing lesson</span>
            <span className="block text-xs text-slate-600 mt-0.5">Copy a lesson from the lesson library into {destinationLabel} as an independent draft.</span>
          </button>
          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={confirm} className="space-y-4">
          {error && (
            <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              {error} Your selection and title are unchanged.
            </div>
          )}

          <div>
            <label htmlFor="library-search" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Search the lesson library
            </label>
            <input id="library-search" type="search" value={query} disabled={submitting} onChange={(e) => setQuery(e.target.value)} placeholder="Search by title..." className={FIELD} />
          </div>

          <div aria-live="polite">
            {loadError ? (
              <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
                {loadError}{' '}
                <button type="button" className="underline font-medium" onClick={() => setReload((n) => n + 1)}>
                  Try again
                </button>
              </div>
            ) : items === null ? (
              <p role="status" className="text-sm text-slate-700">Loading the lesson library…</p>
            ) : items.length === 0 ? (
              <p className="p-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-700">
                {debounced ? (
                  <>No library lessons match &ldquo;{debounced}&rdquo;. Try another word.</>
                ) : (
                  <>
                    The lesson library is empty.{' '}
                    <Link href="/lessons" className="underline font-medium">Create a library lesson</Link> first, then copy it here.
                  </>
                )}
              </p>
            ) : (
              <fieldset disabled={submitting}>
                <legend className="sr-only">Library lessons</legend>
                <ul className="max-h-[40vh] overflow-y-auto space-y-2 pr-1">
                  {items.map((lesson) => (
                    <li key={lesson.id}>
                      <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${selected?.id === lesson.id ? 'border-amber-600 bg-amber-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                        <input type="radio" name="library-lesson" className="mt-1 h-4 w-4 accent-amber-600" checked={selected?.id === lesson.id} onChange={() => choose(lesson)} />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-900 break-words">{lesson.title}</span>
                          <span className="block text-xs text-slate-700">
                            {lesson.levels.length ? lesson.levels.map((l) => readableLevel(l)).join(', ') : 'No levels yet'} · updated {new Date(lesson.updatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}
          </div>

          <div>
            <label htmlFor="library-copy-title" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Title of the copy *
            </label>
            <input
              id="library-copy-title"
              type="text"
              required
              maxLength={TITLE_MAX}
              value={title}
              disabled={submitting || !selected}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleEdited(true);
              }}
              placeholder={selected ? '' : 'Choose a lesson first'}
              className={FIELD}
            />
          </div>

          <p className="text-sm text-slate-700">
            This creates an independent draft. Changes will not affect the original. Images and quizzes remain shared references.
          </p>
          <p className="text-xs text-slate-600">
            The copy is added at the end of {destinationLabel}. It is not published, and the course catalog is not changed; publish the copy and include it in the catalog when it is ready.
          </p>

          <div className="flex justify-between gap-3 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setStep('choose')} disabled={submitting} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
              Back
            </button>
            <div className="flex gap-3">
              <button type="button" onClick={close} disabled={submitting} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                Cancel
              </button>
              <button
                type="submit"
                disabled={!selected || submitting}
                aria-busy={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
              >
                {submitting && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
                Copy lesson
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
