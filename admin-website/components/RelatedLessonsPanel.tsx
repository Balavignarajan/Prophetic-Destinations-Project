'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { friendlyError } from '../lib/ui-messages';
import { Modal } from './ui';

export interface RelatedLessonItem {
  id: string;
  title: string;
  status: string;
  courseId: string;
  courseTitle: string;
  moduleId: string | null;
  moduleTitle: string | null;
  /** The link's custom label (absent or null = the target's own published title is shown to learners). */
  label?: string | null;
  /** The levels the LINK is shown at (absent or null = every level). Says nothing about whether the target lesson itself is available. */
  levels?: string[] | null;
}

/** A chosen link while editing: the label as typed ('' = none) and the levels ticked (all three = every level). */
interface EditItem extends RelatedLessonItem {
  labelText: string;
  levelSet: string[];
}

const ALL_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
const LEVEL_NAMES: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };
const MAX_LABEL = 120;

const toEdit = (item: RelatedLessonItem): EditItem => ({ ...item, labelText: item.label ?? '', levelSet: item.levels && item.levels.length > 0 ? [...item.levels] : [...ALL_LEVELS] });
/** The link metadata exactly as it would be saved: trimmed label or null, levels in canonical order or null for every level. */
const meta = (item: EditItem) => ({
  id: item.id,
  label: item.labelText.trim() || null,
  levels: item.levelSet.length === ALL_LEVELS.length ? null : ALL_LEVELS.filter((l) => item.levelSet.includes(l)),
});
const levelsSummary = (levels: string[] | null | undefined) => (levels && levels.length > 0 && levels.length < ALL_LEVELS.length ? levels.map((l) => LEVEL_NAMES[l] ?? l).join(', ') : null);

interface Props {
  lessonId: string;
  /** The lesson's current version (used for the stale-edit check when saving). Changing it reloads the list. */
  lessonVersion: number;
  canWrite: boolean;
  onSaved: (message: string) => void;
}

const MAX = 10;
const BTN = 'px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

function where(item: RelatedLessonItem): string {
  return [item.courseTitle, item.moduleTitle ?? 'Directly in the course'].join(' › ');
}

function StatusNote({ status }: { status: string }) {
  if (status === 'MISSING') {
    return <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-900 border border-rose-200">Lesson no longer exists: remove it</span>;
  }
  return status === 'PUBLISHED' ? (
    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900 border border-emerald-200">Published</span>
  ) : (
    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 border border-amber-200" title="Learners will not see this link until the lesson is published">
      Not published yet
    </span>
  );
}

/** A link as the editor hands it to its owner: the target, the optional label (null = the lesson's own title) and the levels (null = every level). */
export interface EditedLink {
  lessonId: string;
  label: string | null;
  levels: string[] | null;
}

/**
 * Lets the same picker edit the links of a Continue Exploring BLOCK instead of the lesson's metadata links: the owner supplies saving state, error, extra
 * fields (title, levels of the new block), the save action and the intro text. The picker itself (search, add, order, label, levels) is the same code.
 * The two lists stay separate data: nothing here reads or writes the other.
 */
export interface ExternalSave {
  saving: boolean;
  error: string | null;
  intro: React.ReactNode;
  saveLabel: string;
  /** Unsaved changes in the owner's own fields (for example the block title). */
  extraDirty: boolean;
  /** Owner's own fields, shown above the buttons. */
  extra: React.ReactNode;
  /** The picker is only valid when the owner's fields are. */
  extraValid: boolean;
  onSave: (links: EditedLink[]) => void;
}

export function RelatedLinksEditor({ lessonId, lessonVersion, initial, onClose, onSaved, dirtyRef, busyRef, external }: { lessonId: string; lessonVersion: number; initial: RelatedLessonItem[]; onClose: () => void; onSaved: (items: RelatedLessonItem[]) => void; dirtyRef: React.MutableRefObject<boolean>; busyRef: React.MutableRefObject<boolean>; external?: ExternalSave }) {
  const [items, setItems] = useState<EditItem[]>(() => initial.map(toEdit));
  const start = JSON.stringify(initial.map((i) => meta(toEdit(i))));
  const patch = (id: string, changes: Partial<EditItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...changes } : i)));
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RelatedLessonItem[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [savingLocal, setSaving] = useState(false);
  const [errorLocal, setError] = useState<string | null>(null);
  const saving = external ? external.saving : savingLocal;
  const error = external ? external.error : errorLocal;
  const savingRef = useRef(false);

  // Order, label and level visibility all count as changes (identical content is not a change).
  const dirty = JSON.stringify(items.map(meta)) !== start;
  const noLevels = items.findIndex((i) => i.levelSet.length === 0);
  const anyDirty = dirty || Boolean(external?.extraDirty);
  dirtyRef.current = anyDirty;
  busyRef.current = saving;
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setResults(null);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .request<{ items: RelatedLessonItem[] }>(`/admin/lessons/search?q=${encodeURIComponent(text)}&exclude=${lessonId}`)
        .then((res) => {
          if (!cancelled) {
            setResults(res.items);
            setSearchError(null);
          }
        })
        .catch(() => !cancelled && setSearchError('The search could not be completed. Try again.'));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, lessonId]);

  const move = (index: number, delta: -1 | 1) =>
    setItems((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const save = async () => {
    if (external) {
      if (!external.saving) external.onSave(items.map((i) => { const m = meta(i); return { lessonId: m.id, label: m.label, levels: m.levels }; }));
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await api.request<{ items: RelatedLessonItem[] }>(`/admin/lessons/${lessonId}/related`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: items.map((i) => { const m = meta(i); return { lessonId: m.id, label: m.label, levels: m.levels }; }), version: lessonVersion }),
      });
      onSaved(res.items);
    } catch (err: unknown) {
      setError(friendlyError(err, 'Could not save the related lessons.'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
          {error} Your choices here are unchanged.
        </p>
      )}
      {external ? <div className="text-sm text-slate-700">{external.intro}</div> : <p className="text-sm text-slate-700">
        Choose lessons learners may want to read next. You pick them yourself; nothing is suggested automatically. A lesson you link to is shown to
        learners only once it is published, and linking never publishes it. Changing this list, a label or the levels returns the lesson to Draft so it is
        approved again (administrators can publish directly). Editing a link never changes the linked lesson itself.
      </p>}

      <section aria-labelledby="related-selected">
        <h3 id="related-selected" className="text-sm font-semibold text-slate-800 mb-2">
          Chosen lessons, in the order learners see them ({items.length} of {MAX})
        </h3>
        {items.length === 0 ? (
          <p className="p-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-700">No related lessons chosen. Search below to add some.</p>
        ) : (
          <ol className="space-y-2">
            {items.map((item, index) => (
              <li key={item.id} className="rounded-lg border border-slate-200 p-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900 break-words">
                      {index + 1}. {item.title} <StatusNote status={item.status} />
                    </span>
                    <span className="block text-xs text-slate-600 break-words">{where(item)}</span>
                  </span>
                  <span className="flex gap-2">
                    <button type="button" className={BTN} disabled={saving || index === 0} aria-label={`Move ${item.title} up`} onClick={() => move(index, -1)}>Up</button>
                    <button type="button" className={BTN} disabled={saving || index === items.length - 1} aria-label={`Move ${item.title} down`} onClick={() => move(index, 1)}>Down</button>
                    <button type="button" className={BTN} disabled={saving} aria-label={`Remove ${item.title}`} onClick={() => setItems((list) => list.filter((i) => i.id !== item.id))}>Remove</button>
                  </span>
                </div>
                <div className="mt-2 grid gap-2">
                  <div>
                    <label htmlFor={`rel-label-${item.id}`} className="block text-xs font-semibold text-slate-800">
                      Link label for {item.title} (optional)
                    </label>
                    <input
                      id={`rel-label-${item.id}`}
                      type="text"
                      maxLength={MAX_LABEL}
                      value={item.labelText}
                      disabled={saving}
                      onChange={(e) => patch(item.id, { labelText: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60"
                    />
                    <p className="text-xs text-slate-700 mt-0.5">
                      {item.labelText.trim()
                        ? `Learners see this text for the link, with the lesson\u2019s own title (${item.title}) beneath it. It is plain text.`
                        : 'Leave empty to show the lesson\u2019s own published title.'}
                    </p>
                  </div>
                  <fieldset disabled={saving}>
                    <legend className="text-xs font-semibold text-slate-800">Show this link at these levels</legend>
                    <div className="flex flex-wrap gap-4 mt-1">
                      {ALL_LEVELS.map((level) => (
                        <label key={level} className="inline-flex items-center gap-2 text-sm text-slate-800 min-h-6">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-amber-600"
                            checked={item.levelSet.includes(level)}
                            onChange={() => patch(item.id, { levelSet: item.levelSet.includes(level) ? item.levelSet.filter((l) => l !== level) : [...item.levelSet, level] })}
                          />
                          {LEVEL_NAMES[level]}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-slate-700 mt-0.5">
                      This only controls where the link is listed. It does not change which levels the linked lesson is available at, and learners still see the link only if
                      the linked lesson is published for their level.
                    </p>
                    {item.levelSet.length === 0 && <p className="text-xs font-medium text-rose-700 mt-0.5">Choose at least one level for this link.</p>}
                  </fieldset>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="related-search">
        <label id="related-search" htmlFor="related-search-input" className="block text-sm font-semibold text-slate-800 mb-1.5">
          Find a lesson to add
        </label>
        <input
          id="related-search-input"
          type="search"
          value={query}
          disabled={saving}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type at least 2 letters of the lesson title"
          autoComplete="off"
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600"
        />
        <div aria-live="polite" className="mt-2">
          {searchError && <p className="text-sm text-rose-800">{searchError}</p>}
          {results !== null && results.length === 0 && <p className="text-sm text-slate-700">No lessons match &ldquo;{query.trim()}&rdquo;.</p>}
        </div>
        {results !== null && results.length > 0 && (
          <ul className="mt-2 max-h-[30vh] overflow-y-auto space-y-2 pr-1">
            {results.map((item) => {
              const chosen = items.some((i) => i.id === item.id);
              return (
                <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-slate-200 p-2.5">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900 break-words">
                      {item.title} <StatusNote status={item.status} />
                    </span>
                    <span className="block text-xs text-slate-600 break-words">{where(item)}</span>
                  </span>
                  <button
                    type="button"
                    className={BTN}
                    disabled={saving || chosen || items.length >= MAX}
                    aria-label={chosen ? `${item.title} is already chosen` : `Add ${item.title}, ${where(item)}`}
                    onClick={() => setItems((list) => [...list, toEdit(item)])}
                  >
                    {chosen ? 'Added' : 'Add'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {items.length >= MAX && <p className="mt-1 text-xs text-slate-700">At most {MAX} related lessons.</p>}
      </section>

      {external?.extra}

      <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            if (!anyDirty || window.confirm('Discard your unsaved changes?')) onClose();
          }}
          className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button type="button" disabled={saving || !anyDirty || noLevels >= 0 || (external ? !external.extraValid : false)} aria-busy={saving} onClick={() => void save()} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
          {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
          {external ? external.saveLabel : 'Save related lessons'}
        </button>
      </div>
    </div>
  );
}

/** The "Related lessons" section of the lesson page (lesson metadata, CMS-006): the chosen lessons, and an editor opened on demand. */
export default function RelatedLessonsPanel({ lessonId, lessonVersion, canWrite, onSaved }: Props) {
  const [items, setItems] = useState<RelatedLessonItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    api
      .request<{ items: RelatedLessonItem[] }>(`/admin/lessons/${lessonId}/related`)
      .then((res) => setItems(res.items))
      .catch(() => setLoadError(true));
  }, [lessonId]);
  useEffect(load, [load, lessonVersion]);

  // Escape and the backdrop go through the same guard as Cancel: nothing closes mid-save, and unsaved choices are confirmed first.
  const dirtyRef = useRef(false);
  const busyRef = useRef(false);
  const requestClose = () => {
    if (busyRef.current) return;
    if (dirtyRef.current && !window.confirm('Discard your unsaved changes?')) return;
    dirtyRef.current = false;
    setEditing(false);
  };

  return (
    <section aria-labelledby="related-heading" className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="related-heading" className="text-sm font-semibold text-slate-900">Related lessons</h2>
        {canWrite && items !== null && (
          <button type="button" onClick={() => setEditing(true)} className={BTN}>
            {items.length === 0 ? 'Choose related lessons' : 'Edit related lessons'}
          </button>
        )}
      </div>
      {loadError ? (
        <p role="alert" className="mt-2 text-sm text-rose-900">
          The related lessons could not be loaded.{' '}
          <button type="button" className="underline font-medium" onClick={load}>Try again</button>
        </p>
      ) : items === null ? (
        <p role="status" className="mt-2 text-sm text-slate-700">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-700">No related lessons. Learners see no &ldquo;Related lessons&rdquo; section for this lesson.</p>
      ) : (
        <ol className="mt-2 space-y-1.5">
          {items.map((item, index) => (
            <li key={item.id} className="text-sm text-slate-900 break-words">
              {index + 1}. {item.label ? `${item.label} (lesson: ${item.title})` : item.title} <StatusNote status={item.status} />
              <span className="block text-xs text-slate-600">{where(item)}</span>
              {levelsSummary(item.levels) && <span className="block text-xs text-slate-600">Link shown at: {levelsSummary(item.levels)}</span>}
            </li>
          ))}
        </ol>
      )}
      <Modal isOpen={editing} onClose={requestClose} title="Related lessons" description="Lessons you link as further reading." maxWidth="2xl">
        {items && (
          <RelatedLinksEditor
            lessonId={lessonId}
            lessonVersion={lessonVersion}
            initial={items}
            onClose={() => {
              dirtyRef.current = false;
              setEditing(false);
            }}
            dirtyRef={dirtyRef}
            busyRef={busyRef}
            onSaved={(next) => {
              dirtyRef.current = false;
              setItems(next);
              setEditing(false);
              onSaved('Related lessons saved.');
            }}
          />
        )}
      </Modal>
    </section>
  );
}
