'use client';

import React, { useRef, useState } from 'react';
import { EMPTY_SUMMARY, SUMMARY_HEADING_MAX, SUMMARY_MAX_TAKEAWAYS, SUMMARY_TAKEAWAY_MAX, buildSummaryContent, type SummaryContent } from '../lib/summary-block';
import type { LearningLevel } from '../lib/types';
import ScriptureRefList from './ScriptureRefList';
import { Modal } from './ui';

interface Props {
  isOpen: boolean;
  mode: 'create' | 'edit';
  /** Levels the lesson is available at (a new block starts visible at all of them). */
  lessonLevels: LearningLevel[];
  initial: SummaryContent | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (content: Record<string, unknown>, levels: LearningLevel[]) => void;
}

const FIELD = 'w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const LABEL = 'block text-sm font-semibold text-slate-800 mb-1.5';
const SMALL_BTN = 'px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';
const LEVEL_NAMES: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

/** One ordered list of short texts (key ideas, prophecy takeaways or application takeaways) with its own label, hint and controls. */
function TextListField({ idPrefix, legend, hint, itemName, emptyText, items, onChange, disabled }: {
  idPrefix: string;
  legend: string;
  hint: string;
  /** Singular, lower case: "key idea". */
  itemName: string;
  emptyText: string;
  items: string[];
  onChange: (items: string[]) => void;
  disabled: boolean;
}) {
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className={LABEL}>{legend}</legend>
      <p className="text-xs text-slate-700">{hint}</p>
      {items.length === 0 ? (
        <p className="p-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-700">{emptyText}</p>
      ) : (
        <ol className="space-y-3">
          {items.map((item, index) => (
            <li key={index} className="rounded-lg border border-slate-200 p-3 space-y-2">
              <label htmlFor={`${idPrefix}-${index}`} className="block text-xs font-semibold text-slate-800">
                {legend}: {itemName} {index + 1}
              </label>
              <textarea id={`${idPrefix}-${index}`} rows={2} maxLength={SUMMARY_TAKEAWAY_MAX} value={item} onChange={(e) => onChange(items.map((t, i) => (i === index ? e.target.value : t)))} className={FIELD} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className={SMALL_BTN} aria-label={`Move ${itemName} ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                  Move up
                </button>
                <button type="button" className={SMALL_BTN} aria-label={`Move ${itemName} ${index + 1} down`} disabled={index === items.length - 1} onClick={() => move(index, 1)}>
                  Move down
                </button>
                <button type="button" className={SMALL_BTN} aria-label={`Remove ${itemName} ${index + 1}`} onClick={() => onChange(items.filter((_, i) => i !== index))}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <button type="button" className={SMALL_BTN} disabled={items.length >= SUMMARY_MAX_TAKEAWAYS} onClick={() => onChange([...items, ''])}>
        Add {itemName}
      </button>
      {items.length >= SUMMARY_MAX_TAKEAWAYS && <p className="text-xs text-slate-700">At most {SUMMARY_MAX_TAKEAWAYS} items in this section.</p>}
    </fieldset>
  );
}

interface BodyProps extends Omit<Props, 'isOpen' | 'onClose'> {
  requestClose: () => void;
  dirtyRef: React.MutableRefObject<boolean>;
}

function Body({ mode, lessonLevels, initial, saving, error, onSave, requestClose, dirtyRef }: BodyProps) {
  const start: SummaryContent = initial ?? EMPTY_SUMMARY;
  const [draft, setDraft] = useState<SummaryContent>(start);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);
  const patch = (changes: Partial<SummaryContent>) => setDraft((d) => ({ ...d, ...changes }));

  dirtyRef.current = JSON.stringify(buildSummaryContent(draft)) !== JSON.stringify(buildSummaryContent(start));
  const filled = [...draft.takeaways, ...draft.prophecyTakeaways, ...draft.applicationTakeaways].filter((t) => t.trim().length > 0).length + draft.keyScripture.length;
  const canSave = !saving && (mode === 'edit' || levels.length > 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    onSave(buildSummaryContent(draft), levels);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
          {error} What you typed here is unchanged.
        </p>
      )}

      <div>
        <label htmlFor="summary-heading" className={LABEL}>
          Heading (optional)
        </label>
        <input id="summary-heading" type="text" maxLength={SUMMARY_HEADING_MAX} value={draft.heading} disabled={saving} onChange={(e) => patch({ heading: e.target.value })} className={FIELD} />
        <p className="text-xs text-slate-700 mt-1">If left empty, learners see the title &ldquo;Summary&rdquo;.</p>
      </div>

      <TextListField
        idPrefix="summary-takeaway"
        legend="Key ideas"
        hint="The main ideas you want learners to remember, one per item. Summaries saved before the other sections existed keep their takeaways here."
        itemName="key idea"
        emptyText="No key ideas yet. Add the key ideas of this lesson, one per item."
        items={draft.takeaways}
        onChange={(takeaways) => patch({ takeaways })}
        disabled={saving}
      />

      <div className="space-y-2">
        <p className={LABEL}>Key Scripture (optional)</p>
        <p className="text-xs text-slate-700">The passages that matter most in this lesson. Learners read them as Scripture, apart from your own words.</p>
        <ScriptureRefList
          itemLabel="this summary"
          idPrefix="summary-sc"
          title="Key Scripture passages"
          emptyMessage="No key Scripture. The summary is published as it is without it."
          entries={draft.keyScripture}
          onChange={(keyScripture) => patch({ keyScripture })}
          disabled={saving}
        />
      </div>

      <TextListField
        idPrefix="summary-prophecy"
        legend="Prophecy takeaways (optional)"
        hint="What this lesson shows about prophecy, in your own words."
        itemName="prophecy takeaway"
        emptyText="No prophecy takeaways. This section is left out for learners."
        items={draft.prophecyTakeaways}
        onChange={(prophecyTakeaways) => patch({ prophecyTakeaways })}
        disabled={saving}
      />

      <TextListField
        idPrefix="summary-application"
        legend="Application takeaways (optional)"
        hint="How learners can apply the lesson in their own lives, in your own words."
        itemName="application takeaway"
        emptyText="No application takeaways. This section is left out for learners."
        items={draft.applicationTakeaways}
        onChange={(applicationTakeaways) => patch({ applicationTakeaways })}
        disabled={saving}
      />

      {filled === 0 && <p className="text-xs text-slate-700">You can save a draft with nothing in it yet, but at least one item is needed before the lesson can be published.</p>}

      {mode === 'create' && (
        <fieldset disabled={saving}>
          <legend className={LABEL}>Show this summary at</legend>
          <div className="flex flex-wrap gap-4">
            {lessonLevels.map((level) => (
              <label key={level} className="inline-flex items-center gap-2 text-sm text-slate-800 min-h-6">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-amber-600"
                  checked={levels.includes(level)}
                  onChange={() => setLevels((current) => (current.includes(level) ? current.filter((l) => l !== level) : [...current, level]))}
                />
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
        <button
          type="submit"
          disabled={!canSave}
          aria-busy={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
          {mode === 'create' ? 'Add summary to lesson' : 'Save summary'}
        </button>
      </div>
    </form>
  );
}

/** Adds or edits a Summary block (heading, key ideas, key Scripture, prophecy and application takeaways) without leaving the lesson. The form starts fresh each time it opens. */
export default function SummaryBlockDialog({ isOpen, onClose, ...rest }: Props) {
  const dirtyRef = useRef(false);
  const requestClose = () => {
    if (rest.saving) return;
    if (dirtyRef.current && !window.confirm('Discard your unsaved changes?')) return;
    dirtyRef.current = false;
    onClose();
  };
  return (
    <Modal
      isOpen={isOpen}
      onClose={requestClose}
      title={rest.mode === 'create' ? 'Add a summary' : 'Edit summary'}
      description="A short heading, then key ideas, key Scripture and takeaways in the order learners should read them. Only the sections you fill in are shown."
      maxWidth="2xl"
    >
      <Body {...rest} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Modal>
  );
}
