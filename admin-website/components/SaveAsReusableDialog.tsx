'use client';

import React, { useRef, useState } from 'react';
import { api } from '../lib/api';
import { friendlyBlockName } from '../lib/block-catalog';
import {
  TEMPLATE_DESCRIPTION_MAX,
  TEMPLATE_NAME_MAX,
  levelsText,
  reusableErrorMessage,
  reusableTypeProblem,
  versionsText,
} from '../lib/reusable-blocks';
import type { LessonBlock, ReusableBlock } from '../lib/types';
import { Modal } from './ui';

const FIELD = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const LABEL = 'block text-sm font-semibold text-slate-800 mb-1';

interface Props {
  /** The lesson block to save, as the lesson editor last loaded it from the server; null = closed. */
  block: LessonBlock | null;
  lessonId: string;
  onClose: () => void;
  /** The server confirmed the new reusable block. */
  onSaved: (saved: ReusableBlock) => void;
}

function Body({ block, lessonId, onClose, onSaved, dirtyRef }: Omit<Props, 'block'> & { block: LessonBlock; dirtyRef: React.MutableRefObject<boolean> }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  dirtyRef.current = name.trim() !== '' || description.trim() !== '';

  const problem = reusableTypeProblem(block.type);
  const empty = block.sharedContent === null;
  const levels = block.levels;
  const typeName = friendlyBlockName(block.type);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || problem || empty || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      // The server reads the STORED block (content and level settings); nothing about the content is sent from here, so the lesson block cannot be changed by this.
      const saved = await api.request<ReusableBlock>('/admin/reusable-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId, blockId: block.id, name, description: description.trim() ? description : null }),
      });
      dirtyRef.current = false;
      onSaved(saved);
    } catch (err: unknown) {
      setError(reusableErrorMessage(err, 'Could not save the reusable block.'));
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (saving) return;
    if (dirtyRef.current && !window.confirm('Discard what you typed?')) return;
    dirtyRef.current = false;
    onClose();
  };

  if (problem) {
    return (
      <div className="space-y-4">
        <p role="alert" className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
          A {typeName.toLowerCase()} block cannot be saved as a reusable block. {problem}
        </p>
        <div className="flex justify-end pt-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
          {error} Nothing was saved, and what you typed here is unchanged.
        </p>
      )}
      {empty && (
        <p role="alert" className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
          This block has no content yet. Add its content and save it in the lesson first, then save it as a reusable block.
        </p>
      )}
      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-800 space-y-1">
        <p>
          <strong>{typeName}</strong> · levels: {levelsText(levels)}
          {versionsText(levels) && <span className="text-purple-800"> · {versionsText(levels)}</span>}
        </p>
        <p className="text-xs text-slate-700">
          The block is saved exactly as it is stored in this lesson, with its level versions. Anything you changed in an editor and have not saved is not included. The block in
          this lesson is not changed, and neither is any other lesson.
        </p>
      </div>
      <div>
        <label htmlFor="rb-save-name" className={LABEL}>
          Name
        </label>
        <input id="rb-save-name" type="text" maxLength={TEMPLATE_NAME_MAX} value={name} disabled={saving || empty} onChange={(e) => setName(e.target.value)} className={FIELD} autoFocus />
        <p className="text-xs text-slate-700 mt-1">How you will find it in the library. Required.</p>
      </div>
      <div>
        <label htmlFor="rb-save-description" className={LABEL}>
          Description (optional)
        </label>
        <textarea
          id="rb-save-description"
          rows={3}
          maxLength={TEMPLATE_DESCRIPTION_MAX}
          value={description}
          disabled={saving || empty}
          onChange={(e) => setDescription(e.target.value)}
          className={FIELD}
        />
      </div>
      <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
        <button type="button" onClick={cancel} disabled={saving} className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || empty || !name.trim()}
          aria-busy={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
          Save reusable block
        </button>
      </div>
    </form>
  );
}

/**
 * "Save as reusable block": names a stored lesson block and asks the server to keep a COPY of it in the library. The server reads the stored block itself, so this
 * dialog only sends which block and the name; success is shown only after the server confirms it. The form starts fresh each time it opens.
 */
export default function SaveAsReusableDialog({ block, lessonId, onClose, onSaved }: Props) {
  const dirtyRef = useRef(false);
  if (!block) return null;
  const requestClose = () => {
    if (dirtyRef.current && !window.confirm('Discard what you typed?')) return;
    dirtyRef.current = false;
    onClose();
  };
  return (
    <Modal isOpen onClose={requestClose} title="Save as reusable block" description="Keep a copy of this block in the library, to insert into other lessons." maxWidth="lg">
      <Body block={block} lessonId={lessonId} onClose={onClose} onSaved={onSaved} dirtyRef={dirtyRef} />
    </Modal>
  );
}
