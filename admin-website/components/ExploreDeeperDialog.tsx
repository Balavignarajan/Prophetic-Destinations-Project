'use client';

import React, { useRef, useState } from 'react';
import { EMPTY_EXPLORE, EXPLORE_LIMITS, type ExploreContent, buildExplore, newNestedId } from '../lib/explore-deeper';
import type { LearningLevel } from '../lib/types';
import { type NestedDialogState, NestedBlockDialogs, NestedBlocksList } from './ExploreNestedBlocks';
import ScriptureRefList from './ScriptureRefList';
import { Modal } from './ui';

interface Props {
  isOpen: boolean;
  mode: 'create' | 'edit';
  /** Levels the lesson is available at (a new block starts visible at all of them). */
  lessonLevels: LearningLevel[];
  initial: ExploreContent | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (content: Record<string, unknown>, levels: LearningLevel[]) => void;
}

const FIELD = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const LABEL = 'block text-sm font-semibold text-slate-800 mb-1';
const HELP = 'text-xs text-slate-700 mt-1';
const LEVEL_NAMES: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

interface BodyProps extends Omit<Props, 'isOpen' | 'onClose'> {
  requestClose: () => void;
  dirtyRef: React.MutableRefObject<boolean>;
  /** True while the dialog of a nested block is open over this one: closing this dialog (Escape) must not happen then. */
  nestedOpenRef: React.MutableRefObject<boolean>;
}

function Body({ mode, lessonLevels, initial, saving, error, onSave, requestClose, dirtyRef, nestedOpenRef }: BodyProps) {
  const start = initial ?? EMPTY_EXPLORE;
  const [draft, setDraft] = useState<ExploreContent>(start);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);
  const [nestedDialog, setNestedDialog] = useState<NestedDialogState | null>(null);
  nestedOpenRef.current = nestedDialog !== null;
  const patch = (changes: Partial<ExploreContent>) => setDraft((d) => ({ ...d, ...changes }));
  dirtyRef.current = JSON.stringify(buildExplore(draft)) !== JSON.stringify(buildExplore(start));
  const canSave = !saving && (mode === 'edit' || levels.length > 0);

  return (
    <>
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(buildExplore(draft), levels);
      }}
      className="space-y-5"
    >
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
          {error} What you typed here is unchanged.
        </p>
      )}
      <fieldset className="space-y-4" disabled={saving}>
        <legend className="sr-only">Explore Deeper</legend>
        <div>
          <label htmlFor="ed-title" className={LABEL}>Title</label>
          <input id="ed-title" type="text" maxLength={EXPLORE_LIMITS.title} value={draft.title} onChange={(e) => patch({ title: e.target.value })} className={FIELD} />
          <p className={HELP}>Learners see this on the button that opens the section. Required before publishing.</p>
        </div>
        <div>
          <label htmlFor="ed-intro" className={LABEL}>Introduction</label>
          <textarea id="ed-intro" rows={6} maxLength={EXPLORE_LIMITS.intro} value={draft.intro} onChange={(e) => patch({ intro: e.target.value })} className={FIELD} />
          <p className={HELP}>Your own words. Separate paragraphs with a blank line. Required before publishing.</p>
        </div>
        <ScriptureRefList
          itemLabel="this section"
          idPrefix="ed-sc"
          title="Cross-references (optional)"
          emptyMessage="No Scripture cross-references. The section is published as it is without them."
          entries={draft.scripture}
          onChange={(scripture) => patch({ scripture })}
          disabled={saving}
        />
        <NestedBlocksList
          blocks={draft.blocks}
          onChange={(blocks) => patch({ blocks })}
          onOpen={setNestedDialog}
          disabled={saving}
        />
        <p className={HELP}>
          Which levels see this section is set with the block&rsquo;s level visibility after you add it. It is not limited to any level by default. Anything
          inside the section is shown at the same levels as the section.
        </p>
      </fieldset>
      {mode === 'create' && (
        <fieldset disabled={saving}>
          <legend className={LABEL}>Show this section at</legend>
          <div className="flex flex-wrap gap-4">
            {lessonLevels.map((level) => (
              <label key={level} className="inline-flex items-center gap-2 text-sm text-slate-800 min-h-6">
                <input type="checkbox" className="h-4 w-4 accent-amber-600" checked={levels.includes(level)} onChange={() => setLevels(levels.includes(level) ? levels.filter((l) => l !== level) : [...levels, level])} />
                {LEVEL_NAMES[level] ?? level}
              </label>
            ))}
          </div>
          {levels.length === 0 && <p className="text-sm font-medium text-rose-700 mt-1">Choose at least one level.</p>}
        </fieldset>
      )}
      <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
        <button type="button" onClick={requestClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
          Cancel
        </button>
        <button type="submit" disabled={!canSave} aria-busy={saving} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
          {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
          {mode === 'create' ? 'Add section to lesson' : 'Save section'}
        </button>
      </div>
    </form>
    {/* Outside the form on purpose: saving a nested block must never submit the section itself. */}
    <NestedBlockDialogs
      dialog={nestedDialog}
      blocks={draft.blocks}
      onClose={() => setNestedDialog(null)}
      onSave={(state, content) => {
        setDraft((d) => ({
          ...d,
          blocks:
            state.index === null
              ? [...d.blocks, { id: newNestedId(), type: state.type, content }]
              : d.blocks.map((b, i) => (i === state.index ? { ...b, content } : b)),
        }));
        setNestedDialog(null);
      }}
    />
    </>
  );
}

/** Adds or edits an Explore Deeper block without leaving the lesson. The form starts fresh each time it opens. */
export default function ExploreDeeperDialog({ isOpen, onClose, ...rest }: Props) {
  const dirtyRef = useRef(false);
  const nestedOpenRef = useRef(false);
  const requestClose = () => {
    if (rest.saving || nestedOpenRef.current) return;
    if (dirtyRef.current && !window.confirm('Discard your unsaved changes?')) return;
    dirtyRef.current = false;
    onClose();
  };
  return (
    <Modal isOpen={isOpen} onClose={requestClose} title={rest.mode === 'create' ? 'Add an Explore Deeper section' : 'Edit Explore Deeper section'} description="An optional section learners open when they want to study further." maxWidth="xl">
      <Body {...rest} requestClose={requestClose} dirtyRef={dirtyRef} nestedOpenRef={nestedOpenRef} />
    </Modal>
  );
}
