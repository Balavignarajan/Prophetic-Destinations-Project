'use client';

import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { SCRIPTURE_COMMENTARY_MAX, type ScriptureBlockContent, type ScriptureRef, buildScriptureBlock } from '../lib/scripture-block';
import type { LearningLevel } from '../lib/types';
import ScripturePicker, { type ScriptureRefValue } from './ScripturePicker';
import { Modal } from './ui';

interface Props {
  isOpen: boolean;
  mode: 'create' | 'edit';
  /** Levels the lesson is available at (a new block starts visible at all of them). */
  lessonLevels: LearningLevel[];
  initial: ScriptureBlockContent | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (content: Record<string, unknown>, levels: LearningLevel[]) => void;
}

const FIELD = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const LABEL = 'block text-sm font-semibold text-slate-800 mb-1.5';
const LEVEL_NAMES: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

interface BodyProps extends Omit<Props, 'isOpen' | 'onClose'> {
  requestClose: () => void;
  dirtyRef: React.MutableRefObject<boolean>;
}

const same = (a: ScriptureRef | null, b: ScriptureRef | null) =>
  a === b || (a !== null && b !== null && a.bookId === b.bookId && a.chapter === b.chapter && a.startVerse === b.startVerse && a.endVerse === b.endVerse);

function Body({ mode, lessonLevels, initial, saving, error, onSave, requestClose, dirtyRef }: BodyProps) {
  const start: ScriptureBlockContent = initial ?? { reference: null, commentary: '' };
  const [reference, setReference] = useState<ScriptureRef | null>(start.reference);
  const [commentary, setCommentary] = useState(start.commentary);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);
  const [bookNames, setBookNames] = useState<Record<string, string>>({});
  const [dataAvailable, setDataAvailable] = useState<boolean | null>(null);

  // Book names work without Scripture text, so an existing passage can still be named when the text is not installed.
  useEffect(() => {
    let cancelled = false;
    api
      .request<{ items: { id: string; name: string }[] }>('/admin/scripture/books')
      .then((res) => !cancelled && setBookNames(Object.fromEntries(res.items.map((b) => [b.id, b.name]))))
      .catch(() => undefined);
    api
      .request<{ available: boolean }>('/admin/scripture/status')
      .then((s) => !cancelled && setDataAvailable(s.available))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  dirtyRef.current = !same(reference, start.reference) || commentary !== start.commentary;
  const canSave = !saving && (mode === 'edit' || levels.length > 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSave) onSave(buildScriptureBlock({ reference, commentary }), levels);
  };

  const pickerValue: ScriptureRefValue | null = reference;
  const label = reference
    ? `${bookNames[reference.bookId] ?? reference.bookId} ${reference.chapter}:${reference.startVerse}${reference.endVerse !== reference.startVerse ? `-${reference.endVerse}` : ''}`
    : null;

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
          {error} What you chose and typed here is unchanged.
        </p>
      )}

      <p className="text-sm text-slate-700">
        You choose the passage; the Scripture text itself is looked up from the installed Bible data and saved with the lesson when it is published.
        Nothing you type here becomes Scripture text.
      </p>

      {dataAvailable === false && (
        <div role="status" className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-900">
          {label ? (
            <p>
              <strong>{label}</strong> is kept as saved. Passage selection is disabled because the Scripture text is not installed on the server, so
              a new or changed passage cannot be verified. The lesson cannot be published until the text is installed.
            </p>
          ) : (
            <p>Passage selection is disabled because the Scripture text is not installed on the server. You can save this block without a passage and choose one later.</p>
          )}
        </div>
      )}

      <ScripturePicker
        idPrefix="scripture-block"
        value={pickerValue}
        onChange={(next) => {
          // An unverifiable or incomplete selection never replaces what is saved: only a verified passage (or an explicit clear) does.
          setReference(next);
        }}
        disabled={saving}
      />

      <div>
        <label htmlFor="scripture-commentary" className={LABEL}>
          Author commentary (optional)
        </label>
        <textarea id="scripture-commentary" rows={3} maxLength={SCRIPTURE_COMMENTARY_MAX} value={commentary} disabled={saving} onChange={(e) => setCommentary(e.target.value)} className={FIELD} />
        <p className="text-xs text-slate-700 mt-1">Your own words, shown to learners apart from the Scripture and clearly not part of it.</p>
      </div>

      {mode === 'create' && (
        <fieldset disabled={saving}>
          <legend className={LABEL}>Show this passage at</legend>
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
          {mode === 'create' ? 'Add passage to lesson' : 'Save passage'}
        </button>
      </div>
    </form>
  );
}

/** Adds or edits a Scripture passage block (a structured reference plus optional commentary). The form starts fresh each time it opens. */
export default function ScriptureBlockDialog({ isOpen, onClose, ...rest }: Props) {
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
      title={rest.mode === 'create' ? 'Add a Scripture passage' : 'Edit Scripture passage'}
      description="Choose a book, chapter and verses. The text comes from the installed Bible data."
      maxWidth="xl"
    >
      <Body {...rest} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Modal>
  );
}
