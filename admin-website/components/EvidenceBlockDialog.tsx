'use client';

import React, { useRef, useState } from 'react';
import { EMPTY_EVIDENCE, EVIDENCE_LIMITS, type EvidenceContent, buildEvidence, isHttpUrl } from '../lib/evidence-block';
import type { LearningLevel } from '../lib/types';
import { versionWording } from '../lib/level-version';
import { fillIfEmpty } from '../lib/media-api';
import CoverImageField from './CoverImageField';
import { Modal } from './ui';

interface Props {
  isOpen: boolean;
  mode: 'create' | 'edit';
  /** Levels the lesson is available at (a new block starts visible at all of them). */
  lessonLevels: LearningLevel[];
  initial: EvidenceContent | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (content: Record<string, unknown>, levels: LearningLevel[]) => void;
  /** Set (with mode 'edit') when the dialog edits ONE level's version of the block instead of its shared content, e.g. "Beginner". */
  levelLabel?: string;
}

const FIELD = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const LABEL = 'block text-sm font-semibold text-slate-800 mb-1';
const HELP = 'text-xs text-slate-700 mt-1';
const LEVEL_NAMES: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

interface BodyProps extends Omit<Props, 'isOpen' | 'onClose'> {
  requestClose: () => void;
  dirtyRef: React.MutableRefObject<boolean>;
}

function Body({ mode, lessonLevels, initial, saving, error, onSave, levelLabel, requestClose, dirtyRef }: BodyProps) {
  const start = initial ?? EMPTY_EVIDENCE;
  const [draft, setDraft] = useState<EvidenceContent>(start);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);

  dirtyRef.current = JSON.stringify(buildEvidence(draft)) !== JSON.stringify(buildEvidence(start));
  const patch = (changes: Partial<EvidenceContent>) => setDraft((d) => ({ ...d, ...changes }));
  const urlBad = draft.url.trim() !== '' && !isHttpUrl(draft.url.trim());
  const canSave = !saving && !urlBad && (mode === 'edit' || levels.length > 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSave) onSave(buildEvidence(draft), levels);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
          {error} What you typed here is unchanged.
        </p>
      )}

      <fieldset className="space-y-4" disabled={saving}>
        <legend className="sr-only">Evidence</legend>
        <div>
          <label htmlFor="ev-title" className={LABEL}>Title</label>
          <input id="ev-title" type="text" maxLength={EVIDENCE_LIMITS.title} value={draft.title} onChange={(e) => patch({ title: e.target.value })} className={FIELD} />
        </div>
        <div>
          <label htmlFor="ev-date" className={LABEL}>Date or period</label>
          <input id="ev-date" type="text" maxLength={EVIDENCE_LIMITS.dateLabel} value={draft.dateLabel} onChange={(e) => patch({ dateLabel: e.target.value })} className={FIELD} />
          <p className={HELP}>Plain text, such as &ldquo;605 BC&rdquo;, &ldquo;c. 538 BC&rdquo; or a named period. It is never converted or sorted.</p>
        </div>
        <div>
          <label htmlFor="ev-expl" className={LABEL}>Your explanation</label>
          <textarea id="ev-expl" rows={4} maxLength={EVIDENCE_LIMITS.explanation} value={draft.explanation} onChange={(e) => patch({ explanation: e.target.value })} className={FIELD} />
          <p className={HELP}>Your own words about the evidence. Learners see it as your explanation, apart from the quotation and the source.</p>
        </div>
        <div>
          <label htmlFor="ev-quote" className={LABEL}>Source quotation (optional)</label>
          <textarea id="ev-quote" rows={3} maxLength={EVIDENCE_LIMITS.quote} value={draft.quote} onChange={(e) => patch({ quote: e.target.value })} className={FIELD} />
          <p className={HELP}>Only words copied from the source, exactly as they appear there. Learners see them labelled &ldquo;Source quotation&rdquo;, apart from your explanation. This is not Scripture.</p>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-slate-200 p-3" disabled={saving}>
        <legend className="px-1 text-sm font-semibold text-slate-800">Source</legend>
        <div>
          <label htmlFor="ev-citation" className={LABEL}>Source (who or what this comes from)</label>
          <input id="ev-citation" type="text" maxLength={EVIDENCE_LIMITS.citation} value={draft.citation} onChange={(e) => patch({ citation: e.target.value })} className={FIELD} />
          <p className={HELP}>Name the author, work, museum or archive so learners can find it. This is shown even if the website below is unavailable. Required before publishing.</p>
        </div>
        <div>
          <label htmlFor="ev-url" className={LABEL}>Link to the source website (optional)</label>
          <input id="ev-url" type="url" inputMode="url" maxLength={EVIDENCE_LIMITS.url} value={draft.url} onChange={(e) => patch({ url: e.target.value })} aria-invalid={urlBad} aria-describedby="ev-url-help" className={FIELD} />
          <p id="ev-url-help" className={HELP}>
            A full address starting with https:// or http://. The app never downloads the page; learners see it as an external link and it is not available offline.
          </p>
          {urlBad && <p className="text-sm font-medium text-rose-700 mt-1">Enter a full web address that starts with https:// or http://.</p>}
        </div>
      </fieldset>

      <div className="space-y-3">
        <CoverImageField subject="evidence" value={draft.mediaId || null} onChange={(mediaId, asset) => patch(mediaId ? { mediaId, altText: fillIfEmpty(draft.altText, asset?.altText), caption: fillIfEmpty(draft.caption, asset?.caption), credit: fillIfEmpty(draft.credit, asset?.source) } : { mediaId: '', altText: '', caption: '', credit: '' })} disabled={saving} />
        {draft.mediaId && (
          <fieldset className="space-y-3" disabled={saving}>
            <legend className="sr-only">Image details</legend>
            <div>
              <label htmlFor="ev-alt" className={LABEL}>Image description <span className="text-rose-700">(required before publishing)</span></label>
              <textarea id="ev-alt" rows={2} maxLength={EVIDENCE_LIMITS.altText} value={draft.altText} onChange={(e) => patch({ altText: e.target.value })} className={FIELD} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="ev-cap" className={LABEL}>Image caption (optional)</label>
                <input id="ev-cap" type="text" maxLength={EVIDENCE_LIMITS.caption} value={draft.caption} onChange={(e) => patch({ caption: e.target.value })} className={FIELD} />
              </div>
              <div>
                <label htmlFor="ev-credit" className={LABEL}>Image credit or rights (optional)</label>
                <input id="ev-credit" type="text" maxLength={EVIDENCE_LIMITS.credit} value={draft.credit} onChange={(e) => patch({ credit: e.target.value })} className={FIELD} />
              </div>
            </div>
          </fieldset>
        )}
      </div>

      <p className="text-xs text-slate-700">A draft can be saved incomplete. Publishing needs a title, a date or period, your explanation and a source (and a description if there is an image).</p>

      {mode === 'create' && (
        <fieldset disabled={saving}>
          <legend className={LABEL}>Show this evidence at</legend>
          <div className="flex flex-wrap gap-4">
            {lessonLevels.map((level) => (
              <label key={level} className="inline-flex items-center gap-2 text-sm text-slate-800 min-h-6">
                <input type="checkbox" className="h-4 w-4 accent-amber-600" checked={levels.includes(level)} onChange={() => setLevels((c) => (c.includes(level) ? c.filter((l) => l !== level) : [...c, level]))} />
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
          {mode === 'create' ? 'Add evidence to lesson' : versionWording(levelLabel, 'evidence')?.save ?? 'Save evidence'}
        </button>
      </div>
    </form>
  );
}

/** Adds or edits a historical-evidence block without leaving the lesson. The form starts fresh each time it opens. */
export default function EvidenceBlockDialog({ isOpen, onClose, ...rest }: Props) {
  const dirtyRef = useRef(false);
  const requestClose = () => {
    if (rest.saving) return;
    if (dirtyRef.current && !window.confirm('Discard your unsaved changes?')) return;
    dirtyRef.current = false;
    onClose();
  };
  const version = versionWording(rest.levelLabel, 'historical evidence');
  return (
    <Modal
      isOpen={isOpen}
      onClose={requestClose}
      title={rest.mode === 'create' ? 'Add historical evidence' : version?.title ?? 'Edit historical evidence'}
      description={version?.description ?? 'Evidence with its date, your explanation, an optional quotation and where it comes from.'}
      maxWidth="2xl"
    >
      <Body {...rest} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Modal>
  );
}
