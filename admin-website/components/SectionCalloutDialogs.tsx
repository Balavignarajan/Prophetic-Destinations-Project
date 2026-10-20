'use client';

import React, { useRef, useState } from 'react';
import {
  CALLOUT_LIMITS,
  CALLOUT_TYPES,
  type CalloutContent,
  EMPTY_CALLOUT,
  EMPTY_SECTION,
  SECTION_LIMITS,
  type SectionContent,
  buildCallout,
  buildSection,
} from '../lib/section-callout';
import type { LearningLevel } from '../lib/types';
import { fillIfEmpty } from '../lib/media-api';
import CoverImageField from './CoverImageField';
import { Modal } from './ui';

const FIELD = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const LABEL = 'block text-sm font-semibold text-slate-800 mb-1';
const HELP = 'text-xs text-slate-700 mt-1';
const LEVEL_NAMES: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

interface CommonProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  /** Levels the lesson is available at (a new block starts visible at all of them). */
  lessonLevels: LearningLevel[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (content: Record<string, unknown>, levels: LearningLevel[]) => void;
}

export function LevelChoice({ lessonLevels, levels, setLevels, disabled, legend }: { lessonLevels: LearningLevel[]; levels: LearningLevel[]; setLevels: (l: LearningLevel[]) => void; disabled: boolean; legend: string }) {
  return (
    <fieldset disabled={disabled}>
      <legend className={LABEL}>{legend}</legend>
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
  );
}

export function Actions({ saving, canSave, createLabel, editLabel, mode, requestClose }: { saving: boolean; canSave: boolean; createLabel: string; editLabel: string; mode: 'create' | 'edit'; requestClose: () => void }) {
  return (
    <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
      <button type="button" onClick={requestClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
        Cancel
      </button>
      <button type="submit" disabled={!canSave} aria-busy={saving} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
        {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
        {mode === 'create' ? createLabel : editLabel}
      </button>
    </div>
  );
}

export function useGuardedClose(saving: boolean, onClose: () => void) {
  const dirtyRef = useRef(false);
  const requestClose = () => {
    if (saving) return;
    if (dirtyRef.current && !window.confirm('Discard your unsaved changes?')) return;
    dirtyRef.current = false;
    onClose();
  };
  return { dirtyRef, requestClose };
}

// ------------------------------------------------------------------------------------------------------------ section heading

function SectionBody({ mode, lessonLevels, initial, saving, error, onSave, requestClose, dirtyRef }: Omit<CommonProps, 'isOpen' | 'onClose'> & { initial: SectionContent | null; requestClose: () => void; dirtyRef: React.MutableRefObject<boolean> }) {
  const start = initial ?? EMPTY_SECTION;
  const [draft, setDraft] = useState<SectionContent>(start);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);
  dirtyRef.current = JSON.stringify(buildSection(draft)) !== JSON.stringify(buildSection(start));
  const patch = (changes: Partial<SectionContent>) => setDraft((d) => ({ ...d, ...changes }));
  const canSave = !saving && (mode === 'edit' || levels.length > 0);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(buildSection(draft), levels);
      }}
      className="space-y-5"
    >
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
          {error} What you typed here is unchanged.
        </p>
      )}
      <fieldset className="space-y-4" disabled={saving}>
        <legend className="sr-only">Section heading</legend>
        <div>
          <label htmlFor="sec-title" className={LABEL}>Title</label>
          <input id="sec-title" type="text" maxLength={SECTION_LIMITS.title} value={draft.title} onChange={(e) => patch({ title: e.target.value })} className={FIELD} />
          <p className={HELP}>Learners see this as a heading that starts a new part of the lesson. Required before publishing.</p>
        </div>
        <div>
          <label htmlFor="sec-subtitle" className={LABEL}>Subtitle (optional)</label>
          <input id="sec-subtitle" type="text" maxLength={SECTION_LIMITS.subtitle} value={draft.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} className={FIELD} />
        </div>
      </fieldset>
      <div className="space-y-3">
        <CoverImageField subject="section" value={draft.mediaId || null} onChange={(mediaId, asset) => patch(mediaId ? { mediaId, altText: fillIfEmpty(draft.altText, asset?.altText) } : { mediaId: '', altText: '' })} disabled={saving} />
        {draft.mediaId && (
          <div>
            <label htmlFor="sec-alt" className={LABEL}>Picture description <span className="text-rose-700">(required before publishing)</span></label>
            <textarea id="sec-alt" rows={2} maxLength={SECTION_LIMITS.altText} value={draft.altText} disabled={saving} onChange={(e) => patch({ altText: e.target.value })} className={FIELD} />
            <p className={HELP}>Describe the picture for people who cannot see it.</p>
          </div>
        )}
      </div>
      {mode === 'create' && <LevelChoice lessonLevels={lessonLevels} levels={levels} setLevels={setLevels} disabled={saving} legend="Show this heading at" />}
      <Actions saving={saving} canSave={canSave} createLabel="Add heading to lesson" editLabel="Save heading" mode={mode} requestClose={requestClose} />
    </form>
  );
}

export function SectionBlockDialog({ isOpen, onClose, initial, ...rest }: CommonProps & { initial: SectionContent | null }) {
  const { dirtyRef, requestClose } = useGuardedClose(rest.saving, onClose);
  return (
    <Modal isOpen={isOpen} onClose={requestClose} title={rest.mode === 'create' ? 'Add a section heading' : 'Edit section heading'} description="A heading that starts a new part of the lesson." maxWidth="xl">
      <SectionBody {...rest} initial={initial} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------------------------------ callout

function CalloutBody({ mode, lessonLevels, initial, saving, error, onSave, requestClose, dirtyRef }: Omit<CommonProps, 'isOpen' | 'onClose'> & { initial: CalloutContent | null; requestClose: () => void; dirtyRef: React.MutableRefObject<boolean> }) {
  const start = initial ?? EMPTY_CALLOUT;
  const [draft, setDraft] = useState<CalloutContent>(start);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);
  dirtyRef.current = JSON.stringify(buildCallout(draft)) !== JSON.stringify(buildCallout(start));
  const patch = (changes: Partial<CalloutContent>) => setDraft((d) => ({ ...d, ...changes }));
  const canSave = !saving && (mode === 'edit' || levels.length > 0);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(buildCallout(draft), levels);
      }}
      className="space-y-5"
    >
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
          {error} What you typed here is unchanged.
        </p>
      )}
      <fieldset className="space-y-4" disabled={saving}>
        <legend className="sr-only">Callout</legend>
        <div>
          <label htmlFor="co-type" className={LABEL}>Type</label>
          <select id="co-type" value={draft.calloutType} onChange={(e) => patch({ calloutType: e.target.value })} className={FIELD}>
            <option value="">Choose a type…</option>
            {CALLOUT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <p className={HELP}>Learners see the type written out above your text. Required before publishing.</p>
        </div>
        <div>
          <label htmlFor="co-title" className={LABEL}>Title (optional)</label>
          <input id="co-title" type="text" maxLength={CALLOUT_LIMITS.title} value={draft.title} onChange={(e) => patch({ title: e.target.value })} className={FIELD} />
        </div>
        <div>
          <label htmlFor="co-body" className={LABEL}>Text</label>
          <textarea id="co-body" rows={4} maxLength={CALLOUT_LIMITS.body} value={draft.body} onChange={(e) => patch({ body: e.target.value })} className={FIELD} />
          <p className={HELP}>Your own short note. It is shown as your words, not as Scripture or a quotation. Required before publishing.</p>
        </div>
      </fieldset>
      {mode === 'create' && <LevelChoice lessonLevels={lessonLevels} levels={levels} setLevels={setLevels} disabled={saving} legend="Show this callout at" />}
      <Actions saving={saving} canSave={canSave} createLabel="Add callout to lesson" editLabel="Save callout" mode={mode} requestClose={requestClose} />
    </form>
  );
}

export function CalloutBlockDialog({ isOpen, onClose, initial, ...rest }: CommonProps & { initial: CalloutContent | null }) {
  const { dirtyRef, requestClose } = useGuardedClose(rest.saving, onClose);
  return (
    <Modal isOpen={isOpen} onClose={requestClose} title={rest.mode === 'create' ? 'Add a callout' : 'Edit callout'} description="A short highlighted note in your own words." maxWidth="xl">
      <CalloutBody {...rest} initial={initial} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Modal>
  );
}
