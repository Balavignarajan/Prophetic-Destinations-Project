'use client';

import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { EXPLORING_LIMITS, type ExploringContent, buildExploring, readExploring } from '../lib/continue-exploring';
import type { LearningLevel } from '../lib/types';
import { type EditedLink, type RelatedLessonItem, RelatedLinksEditor } from './RelatedLessonsPanel';
import { LevelChoice } from './SectionCalloutDialogs';
import { Modal } from './ui';

const FIELD = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const LABEL = 'block text-sm font-semibold text-slate-800 mb-1';

interface Props {
  isOpen: boolean;
  mode: 'create' | 'edit';
  /** The lesson being edited (excluded from the search: a lesson cannot link to itself). */
  lessonId: string;
  lessonVersion: number;
  lessonLevels: LearningLevel[];
  /** The stored content of the block when editing. */
  initial: unknown;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (content: Record<string, unknown>, levels: LearningLevel[]) => void;
}

function Body({ mode, lessonId, lessonVersion, lessonLevels, initial, saving, error, onClose, onSave, dirtyRef, busyRef }: Omit<Props, 'isOpen'> & { dirtyRef: React.MutableRefObject<boolean>; busyRef: React.MutableRefObject<boolean> }) {
  const stored: ExploringContent & { malformed: number } = readExploring(initial);
  const [title, setTitle] = useState(stored.title);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);
  const [items, setItems] = useState<RelatedLessonItem[] | null>(mode === 'create' || stored.links.length === 0 ? [] : null);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);

  // The targets already chosen are shown with their course and module; one that was deleted is shown as such so it can be removed.
  useEffect(() => {
    if (mode === 'create' || stored.links.length === 0) return;
    let cancelled = false;
    setLoadError(false);
    api
      .request<{ items: RelatedLessonItem[] }>(`/admin/lessons/lookup?ids=${stored.links.map((l) => l.lessonId).join(',')}`)
      .then((res) => {
        if (cancelled) return;
        const byId = new Map(res.items.map((i) => [i.id.toLowerCase(), i]));
        setItems(
          stored.links.map((l) => {
            const found = byId.get(l.lessonId);
            const base: RelatedLessonItem = found ?? { id: l.lessonId, title: 'A lesson that no longer exists', status: 'MISSING', courseId: '', courseTitle: '', moduleId: null, moduleTitle: null };
            return { ...base, id: l.lessonId, label: l.label, levels: l.levels };
          }),
        );
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retry]);

  const titleDirty = title.trim() !== stored.title.trim();

  if (loadError) {
    return (
      <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
        The chosen lessons could not be loaded.{' '}
        <button type="button" className="underline font-medium" onClick={() => setRetry((n) => n + 1)}>Try again</button>
      </p>
    );
  }
  if (items === null) return <p role="status" className="text-sm text-slate-700">Loading…</p>;

  return (
    <RelatedLinksEditor
      lessonId={lessonId}
      lessonVersion={lessonVersion}
      initial={items}
      onClose={onClose}
      onSaved={() => undefined}
      dirtyRef={dirtyRef}
      busyRef={busyRef}
      external={{
        saving,
        error,
        saveLabel: mode === 'create' ? 'Add to lesson' : 'Save links',
        extraDirty: titleDirty,
        extraValid: mode === 'edit' || levels.length > 0,
        intro: (
          <>
            Choose the lessons this block points learners to next. These links belong to this block only: they are separate from the lesson&rsquo;s &ldquo;Related lessons&rdquo; list,
            and nothing is copied between the two. You pick them yourself; nothing is suggested. Learners see a link only if the linked lesson is published for their level.
          </>
        ),
        extra: (
          <div className="space-y-4">
            <div>
              <label htmlFor="ce-title" className={LABEL}>Heading (optional)</label>
              <input id="ce-title" type="text" maxLength={EXPLORING_LIMITS.title} value={title} disabled={saving} onChange={(e) => setTitle(e.target.value)} className={FIELD} />
              <p className="text-xs text-slate-700 mt-1">If left empty, learners see &ldquo;Continue exploring&rdquo;.</p>
            </div>
            {mode === 'create' && <LevelChoice lessonLevels={lessonLevels} levels={levels} setLevels={setLevels} disabled={saving} legend="Show this block at" />}
          </div>
        ),
        onSave: (links: EditedLink[]) => onSave(buildExploring(title, links, stored.links), levels),
      }}
    />
  );
}

/** Adds or edits a Continue Exploring block: the existing related-lessons picker, bound to the block instead of the lesson metadata. */
export default function ContinueExploringDialog({ isOpen, onClose, ...rest }: Props) {
  // Escape and the backdrop go through the same guard as Cancel: nothing closes mid-save, and unsaved choices are confirmed first.
  const dirtyRef = useRef(false);
  const busyRef = useRef(false);
  const requestClose = () => {
    if (busyRef.current || rest.saving) return;
    if (dirtyRef.current && !window.confirm('Discard your unsaved changes?')) return;
    dirtyRef.current = false;
    onClose();
  };
  return (
    <Modal isOpen={isOpen} onClose={requestClose} title={rest.mode === 'create' ? 'Add Continue exploring' : 'Edit Continue exploring'} description="Lessons you choose for learners to read next." maxWidth="2xl">
      {isOpen && <Body {...rest} onClose={() => { dirtyRef.current = false; onClose(); }} dirtyRef={dirtyRef} busyRef={busyRef} />}
    </Modal>
  );
}

