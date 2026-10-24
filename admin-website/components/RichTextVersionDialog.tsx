'use client';

import React, { useRef, useState } from 'react';
import { editorTextToRichText, isEditable, richTextToEditorText } from '../lib/rich-text';
import { levelVersionOf } from '../lib/level-version';
import type { LearningLevel, LessonBlock } from '../lib/types';
import { readableLevel } from '../lib/ui-messages';
import RichTextEditor from './RichTextEditor';
import { Modal } from './ui';

interface Props {
  /** The text block and the level whose version is being added or edited; null = closed. */
  target: { block: LessonBlock; level: LearningLevel } | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  /** The finished version (a rich-text document). The page saves it for this level only. */
  onSave: (content: Record<string, unknown>) => void;
}

function Body({ block, level, saving, error, onSave, requestClose, dirtyRef }: { block: LessonBlock; level: LearningLevel } & Omit<Props, 'target' | 'onClose'> & { requestClose: () => void; dirtyRef: React.MutableRefObject<boolean> }) {
  const existing = levelVersionOf(block.levels, level);
  // A new version starts as a copy of the shared text; an existing one opens as it is stored.
  const source = existing ?? block.sharedContent;
  const [text, setText] = useState(() => richTextToEditorText(source));
  const [start] = useState(text);
  // Content the editor cannot show exactly is shown read-only and cannot be saved, so it is never silently rewritten.
  const locked = !isEditable(source);
  const label = readableLevel(level);
  dirtyRef.current = text !== start;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!saving && !locked && text.trim()) onSave(editorTextToRichText(text) as unknown as Record<string, unknown>);
      }}
      className="space-y-4"
    >
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
          {error} What you typed here is unchanged.
        </p>
      )}
      <p className="text-xs text-slate-700">
        {existing
          ? `This is the ${label} version. The shared text and the other levels are not changed.`
          : `This starts as a copy of the shared text. Change it for ${label} learners; the shared text and the other levels are not changed.`}
      </p>
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">{label} version *</label>
        <RichTextEditor rows={8} value={text} onChange={setText} placeholder={`Write the ${label} version...`} locked={locked} />
        {locked && <p className="text-xs text-amber-900 mt-1.5">This text uses formatting the editor cannot show exactly, so it cannot be edited here without changing it.</p>}
      </div>
      <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
        <button type="button" onClick={requestClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
          Cancel
        </button>
        <button type="submit" disabled={saving || locked || !text.trim()} aria-busy={saving} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
          {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
          Save {label} version
        </button>
      </div>
    </form>
  );
}

/**
 * Adds or edits the version of a rich-text block for ONE level, with the same editor the shared text uses (formatting, links and structured Scripture references).
 * The form starts fresh each time it opens, and closing it with unsaved changes asks first.
 */
export default function RichTextVersionDialog({ target, saving, error, onClose, onSave }: Props) {
  const dirtyRef = useRef(false);
  const requestClose = () => {
    if (saving) return;
    if (dirtyRef.current && !window.confirm('Discard your unsaved changes?')) return;
    dirtyRef.current = false;
    onClose();
  };
  if (!target) return null;
  const label = readableLevel(target.level);
  return (
    <Modal
      isOpen
      onClose={requestClose}
      title={`${levelVersionOf(target.block.levels, target.level) ? 'Edit' : 'Add'} ${label} version of this text`}
      description={`Learners at the ${label} level see this version instead of the shared text.`}
      maxWidth="lg"
    >
      <Body block={target.block} level={target.level} saving={saving} error={error} onSave={onSave} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Modal>
  );
}
