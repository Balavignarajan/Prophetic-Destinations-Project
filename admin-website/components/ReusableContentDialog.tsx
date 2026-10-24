'use client';

import React, { useRef, useState } from 'react';
import { readEvidence } from '../lib/evidence-block';
import { editorTextToRichText, isEditable, richTextToEditorText } from '../lib/rich-text';
import { readConnectionContent } from '../lib/scripture-connection';
import { readCallout } from '../lib/section-callout';
import type { ReusableBlock } from '../lib/types';
import { readSymbol, readWord } from '../lib/word-symbol';
import EvidenceBlockDialog from './EvidenceBlockDialog';
import RichTextEditor from './RichTextEditor';
import { CalloutBlockDialog } from './SectionCalloutDialogs';
import ScriptureConnectionDialog from './ScriptureConnectionDialog';
import { Modal } from './ui';
import { SymbolStudyDialog, WordStudyDialog } from './WordSymbolDialogs';

interface Props {
  /** The reusable block whose SHARED content is edited; null = closed. */
  template: ReusableBlock | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  /** The finished shared content. The page saves it to the reusable block only. */
  onSave: (content: Record<string, unknown>) => void;
}

function RichTextBody({ template, saving, error, onSave, requestClose, dirtyRef }: Omit<Props, 'onClose'> & { template: ReusableBlock; requestClose: () => void; dirtyRef: React.MutableRefObject<boolean> }) {
  const [text, setText] = useState(() => richTextToEditorText(template.sharedContent));
  const [start] = useState(text);
  // Content the editor cannot show exactly is shown read-only and cannot be saved, so it is never silently rewritten.
  const locked = !isEditable(template.sharedContent);
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
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Text *</label>
        <RichTextEditor rows={8} value={text} onChange={setText} locked={locked} />
        {locked && <p className="text-xs text-amber-900 mt-1.5">This text uses formatting the editor cannot show exactly, so it cannot be edited here without changing it.</p>}
      </div>
      <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
        <button type="button" onClick={requestClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
          Cancel
        </button>
        <button type="submit" disabled={saving || locked || !text.trim()} aria-busy={saving} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
          {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
          Save text
        </button>
      </div>
    </form>
  );
}

function RichTextDialog({ template, saving, error, onClose, onSave }: Props & { template: ReusableBlock }) {
  const dirtyRef = useRef(false);
  const requestClose = () => {
    if (saving) return;
    if (dirtyRef.current && !window.confirm('Discard your unsaved changes?')) return;
    dirtyRef.current = false;
    onClose();
  };
  return (
    <Modal isOpen onClose={requestClose} title="Edit reusable text" description={`The shared text of "${template.name}". Lessons that already hold a copy are not changed.`} maxWidth="lg">
      <RichTextBody template={template} saving={saving} error={error} onSave={onSave} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Modal>
  );
}

/**
 * The block's OWN editor, opened on the shared content of a reusable block (the types in LIBRARY_EDITABLE_TYPES, lib/reusable-blocks.ts). It is the same component the
 * lesson editor uses, so every field, rule and warning of the block applies (structured Scripture references, the media picker, the unsaved-changes prompt), and
 * nothing is edited as raw JSON. The server checks the content again when it is saved. A type without an editor here renders nothing.
 */
export default function ReusableContentDialog({ template, saving, error, onClose, onSave }: Props) {
  if (!template) return null;
  const start = template.sharedContent;
  const common = {
    isOpen: true,
    mode: 'edit' as const,
    lessonLevels: [],
    saving,
    error,
    onClose,
    onSave: (content: Record<string, unknown>) => onSave(content),
  };
  switch (template.type) {
    case 'RICH_TEXT':
      return <RichTextDialog template={template} saving={saving} error={error} onClose={onClose} onSave={onSave} />;
    case 'CALLOUT':
      return <CalloutBlockDialog {...common} initial={readCallout(start)} />;
    case 'SCRIPTURE_CONNECTION':
      return <ScriptureConnectionDialog {...common} initial={readConnectionContent(start)} />;
    case 'WORD_STUDY':
      return <WordStudyDialog {...common} initial={readWord(start)} />;
    case 'SYMBOL_STUDY':
      return <SymbolStudyDialog {...common} initial={readSymbol(start)} />;
    case 'HISTORICAL_EVIDENCE':
      return <EvidenceBlockDialog {...common} initial={readEvidence(start)} />;
    default:
      return null;
  }
}
