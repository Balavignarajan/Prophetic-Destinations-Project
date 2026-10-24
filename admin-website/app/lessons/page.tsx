'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { LearningLevel, LessonSummary } from '../../lib/types';
import { friendlyError, readableLevel } from '../../lib/ui-messages';
import CoverImageField from '../../components/CoverImageField';
import LessonMetadataFields, { EMPTY_LESSON_METADATA, type LessonMetadataValues, durationProblem, lessonMetadataPayload, lessonMetadataTouched } from '../../components/LessonMetadataFields';
import LessonTagsField from '../../components/LessonTagsField';
import { EmptyState, LoadingSpinner, Modal } from '../../components/ui';

const LEVELS: LearningLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const FIELD = 'w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 disabled:opacity-60';

/**
 * The lesson library: standalone lessons that belong to no course or module. They are authoring sources: written and edited here with the same editor as
 * any lesson, then copied into a course or module (Add lesson, Copy existing lesson) to be reviewed and published. A library lesson itself is never published.
 */
export default function LessonLibraryPage() {
  const { user } = useAuth();
  const router = useRouter();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';

  const [items, setItems] = useState<LessonSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [reload, setReload] = useState(0);
  const runRef = useRef(0);

  // Tag filter: the tags in use by library lessons (with how many lessons carry each), and the one chosen. The filter is applied by the server, in the same query as the
  // search and the page size, so the list, its count and the "found" total are always those of the whole filtered library, never of one page.
  const [tagOptions, setTagOptions] = useState<{ tag: string; lessons: number }[]>([]);
  const [tagFilter, setTagFilter] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [levels, setLevels] = useState<LearningLevel[]>(LEVELS);
  const [meta, setMeta] = useState<LessonMetadataValues>(EMPTY_LESSON_METADATA);
  const [tags, setTags] = useState<string[]>([]);
  const [cover, setCover] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [query]);

  const load = useCallback(async () => {
    const run = ++runRef.current;
    setLoadError(null);
    try {
      const res = await api.request<{ items: LessonSummary[]; total: number }>(
        `/admin/lessons/library?limit=100${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}${tagFilter ? `&tag=${encodeURIComponent(tagFilter)}` : ''}`,
      );
      if (run === runRef.current) {
        setItems(res.items);
        setTotal(res.total);
      }
    } catch (err: unknown) {
      if (run === runRef.current) setLoadError(friendlyError(err, 'The lesson library could not be loaded.'));
    }
  }, [debounced, tagFilter]);

  useEffect(() => {
    void load();
  }, [load, reload]);

  // The tags offered by the filter. Reloaded with the list, so a tag added or removed on a lesson shows up here; if it cannot be loaded the list still works.
  useEffect(() => {
    let cancelled = false;
    api
      .request<{ items: { tag: string; lessons: number }[] }>('/admin/lessons/tags?scope=library')
      .then((res) => {
        if (cancelled) return;
        setTagOptions(res.items);
        // A tag nobody carries any more cannot stay selected (it would show an empty list with no way to see why).
        setTagFilter((current) => (current && !res.items.some((item) => item.tag.toLowerCase() === current.toLowerCase()) ? '' : current));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const dirty = Boolean(title.trim() || cover || tags.length || lessonMetadataTouched(meta));

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (createOpen && dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [createOpen, dirty]);

  const closeCreate = () => {
    if (creating) return;
    if (dirty && !window.confirm('Discard this new lesson?')) return;
    setCreateOpen(false);
    setTitle('');
    setMeta(EMPTY_LESSON_METADATA);
    setTags([]);
    setCover(null);
    setLevels(LEVELS);
    setCreateError(null);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    if (!levels.length) return setCreateError('Choose at least one learning level.');
    const durationError = durationProblem(meta.estimatedMinutes);
    if (durationError) return setCreateError(durationError);
    setCreating(true);
    setCreateError(null);
    try {
      const created = await api.request<{ id: string }>('/admin/lessons/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), ...lessonMetadataPayload(meta), ...(tags.length > 0 ? { tags } : {}), levels, ...(cover ? { coverMediaId: cover } : {}) }),
      });
      // Everything entered stays in place while the new lesson's editor opens.
      router.push(`/lessons/${created.id}`);
    } catch (err: unknown) {
      setCreateError(friendlyError(err, 'The library lesson could not be created.'));
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-serif text-2xl font-bold text-slate-900">Lessons</h1>
          <p className="text-sm text-slate-600 mt-0.5 max-w-2xl">
            The lesson library. Write a lesson once here, then copy it into any course or module (Add lesson &rarr; Copy existing lesson). A copy is an
            independent draft; a library lesson itself is never published.
          </p>
        </div>
        {canWrite && (
          <button onClick={() => setCreateOpen(true)} className="px-4 py-2.5 text-sm font-medium bg-slate-950 hover:bg-slate-800 text-white rounded-lg shadow-xs self-start sm:self-auto">
            Create library lesson
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 max-w-md">
          <label htmlFor="lesson-library-search" className="sr-only">Search library lessons by title</label>
          <input id="lesson-library-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search library lessons by title..." className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm" />
        </div>
        {tagOptions.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor="lesson-library-tag" className="sr-only">Show only lessons with this tag</label>
            <select id="lesson-library-tag" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm max-w-56">
              <option value="">All tags</option>
              {tagOptions.map((option) => (
                <option key={option.tag.toLowerCase()} value={option.tag}>
                  {option.tag} ({option.lessons})
                </option>
              ))}
            </select>
            {tagFilter && (
              <button type="button" onClick={() => setTagFilter('')} className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
                Clear tag filter
              </button>
            )}
          </div>
        )}
      </div>

      <div aria-live="polite">
        {loadError ? (
          <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
            {loadError}{' '}
            <button type="button" className="underline font-medium" onClick={() => setReload((n) => n + 1)}>Try again</button>
          </div>
        ) : items === null ? (
          <LoadingSpinner text="Loading the lesson library..." />
        ) : items.length === 0 ? (
          debounced || tagFilter ? (
            <EmptyState
              title="No lessons match"
              description={`No library lesson ${[debounced ? `has “${debounced}” in its title` : '', tagFilter ? `carries the tag “${tagFilter}”` : ''].filter(Boolean).join(' and ')}.`}
              action={tagFilter ? <button type="button" onClick={() => setTagFilter('')} className="px-4 py-2 text-sm font-medium bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-lg">Clear tag filter</button> : undefined}
            />
          ) : (
            <EmptyState
              title="The lesson library is empty"
              description="Create a lesson here to reuse it in several courses or modules."
              action={canWrite ? <button onClick={() => setCreateOpen(true)} className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg">Create library lesson</button> : undefined}
            />
          )
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs divide-y divide-slate-100">
            <p className="px-4 py-2 text-xs text-slate-600">{total} {total === 1 ? 'lesson' : 'lessons'}{debounced || tagFilter ? ' found' : ''}{tagFilter ? ` with the tag “${tagFilter}”` : ''}{total > items.length ? `. Showing the ${items.length} most recently changed; narrow the search to see the others.` : ''}</p>
            {items.map((lesson) => (
              <div key={lesson.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/lessons/${lesson.id}`} className="font-semibold text-slate-900 hover:text-amber-700 break-words">{lesson.title}</Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    {lesson.levels.length ? lesson.levels.map((level) => <span key={level} className="font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">{readableLevel(level)}</span>) : <span>No levels yet</span>}
                    <span>Updated {new Date(lesson.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </div>
                  {(lesson.tags ?? []).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Tags">
                      {(lesson.tags ?? []).map((tag) => (
                        <button
                          type="button"
                          key={tag.toLowerCase()}
                          onClick={() => setTagFilter(tag)}
                          title={`Show only lessons tagged ${tag}`}
                          className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-slate-100 text-slate-800 border border-slate-200 hover:bg-slate-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Link href={`/lessons/${lesson.id}`} className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">
                  {canWrite ? 'Edit lesson' : 'View lesson'}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={createOpen} onClose={closeCreate} title="Create library lesson" description="A standalone lesson. Copy it into a course or module to publish it." maxWidth="lg">
        <form onSubmit={create} className="space-y-4">
          {createError && <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">{createError} What you entered is unchanged.</div>}
          <div>
            <label htmlFor="library-title" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Lesson title *</label>
            <input id="library-title" required maxLength={200} value={title} disabled={creating} onChange={(e) => setTitle(e.target.value)} className={FIELD} />
          </div>
          <LessonMetadataFields idPrefix="library-lesson" values={meta} onChange={setMeta} disabled={creating} />
          <LessonTagsField value={tags} onChange={setTags} disabled={creating} />
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">Available learning levels *</span>
            <div className="flex flex-wrap gap-2">
              {LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={levels.includes(level)}
                  disabled={creating}
                  onClick={() => setLevels((current) => (current.includes(level) ? current.filter((item) => item !== level) : [...current, level]))}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border ${levels.includes(level) ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-white text-slate-600 border-slate-200'}`}
                >
                  {readableLevel(level)}
                </button>
              ))}
            </div>
          </div>
          <CoverImageField subject="lesson" mode="create" saveLabel="Create library lesson" value={cover} onChange={setCover} disabled={creating} />
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onClick={closeCreate} disabled={creating} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={creating} aria-busy={creating} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50">
              {creating && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
              Create library lesson
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
