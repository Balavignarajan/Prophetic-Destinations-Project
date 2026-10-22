'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { EXPLORE_LIMITS, NESTED_TYPES, type NestedBlockDraft, nestedLabel, nestedSummary } from '../lib/explore-deeper';
import { readEvidence } from '../lib/evidence-block';
import { readImageContent } from '../lib/image-block';
import { editorTextToRichText, isEditable, richTextToEditorText } from '../lib/rich-text';
import { readScriptureBlock } from '../lib/scripture-block';
import { readConnectionContent } from '../lib/scripture-connection';
import { readCallout } from '../lib/section-callout';
import type { LearningLevel } from '../lib/types';
import { readSymbol, readWord } from '../lib/word-symbol';
import EvidenceBlockDialog from './EvidenceBlockDialog';
import ImageBlockDialog from './ImageBlockDialog';
import RichTextEditor from './RichTextEditor';
import ScriptureBlockDialog from './ScriptureBlockDialog';
import ScriptureConnectionDialog from './ScriptureConnectionDialog';
import { CalloutBlockDialog } from './SectionCalloutDialogs';
import { Modal } from './ui';
import { SymbolStudyDialog, WordStudyDialog } from './WordSymbolDialogs';

/**
 * The editor of the blocks nested inside an Explore Deeper section. Two parts, kept apart on purpose:
 *  - NestedBlocksList: the list inside the section's form (add, edit, move, remove). It only reports what the author asked for.
 *  - NestedBlockDialogs: the dialog of the block being added or edited. It is the SAME dialog the lesson uses for that block type (image, callout, Scripture
 *    passage, word study, ...), opened over the section's dialog and drawn outside its form (a portal), so saving a nested block never submits the section.
 *    A nested block has no level settings of its own, so the dialogs are used in their "edit" form, which asks for none; the nested block's content is kept
 *    in the section's draft and is saved with the section.
 */
export interface NestedDialogState {
  type: string;
  /** The position being edited, or null for a block that is being added. */
  index: number | null;
}

const BTN = 'px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

export function NestedBlocksList({
  blocks,
  onChange,
  onOpen,
  disabled = false,
}: {
  blocks: NestedBlockDraft[];
  onChange: (blocks: NestedBlockDraft[]) => void;
  onOpen: (state: NestedDialogState) => void;
  disabled?: boolean;
}) {
  const [choice, setChoice] = useState('');
  const full = blocks.length >= EXPLORE_LIMITS.maxBlocks;
  const move = (from: number, to: number) => {
    const next = [...blocks];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
      <p className="text-xs font-semibold text-slate-800">Study content inside this section (optional)</p>
      {blocks.length === 0 ? (
        <p className="text-xs text-slate-700">
          Nothing added. The section then shows its introduction and cross-references only. Add text, a Scripture passage, an image and more for learners who open it
          to study further.
        </p>
      ) : (
        <ol className="space-y-2">
          {blocks.map((block, index) => {
            const label = nestedLabel(block.type);
            return (
              <li key={block.id} className="rounded-md border border-slate-200 bg-white p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-[11px] font-bold uppercase tracking-wide text-amber-900">
                      {index + 1}. {label}
                    </span>
                    <span className="block text-sm text-slate-900 break-words">{nestedSummary(block.type, block.content)}</span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <button type="button" className={BTN} disabled={disabled || index === 0} aria-label={`Move block ${index + 1} (${label}) up`} onClick={() => move(index, index - 1)}>
                      Up
                    </button>
                    <button type="button" className={BTN} disabled={disabled || index === blocks.length - 1} aria-label={`Move block ${index + 1} (${label}) down`} onClick={() => move(index, index + 1)}>
                      Down
                    </button>
                    <button type="button" className={BTN} disabled={disabled} aria-label={`Edit block ${index + 1} (${label})`} onClick={() => onOpen({ type: block.type, index })}>
                      Edit
                    </button>
                    <button type="button" className={BTN} disabled={disabled} aria-label={`Remove block ${index + 1} (${label})`} onClick={() => onChange(blocks.filter((_, i) => i !== index))}>
                      Remove
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="ed-nested-add" className="sr-only">Type of block to add inside this section</label>
        <select
          id="ed-nested-add"
          value={choice}
          disabled={disabled || full}
          onChange={(e) => setChoice(e.target.value)}
          className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 disabled:opacity-60"
        >
          <option value="">Choose what to add…</option>
          {NESTED_TYPES.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={BTN}
          disabled={disabled || full || choice === ''}
          onClick={() => {
            onOpen({ type: choice, index: null });
            setChoice('');
          }}
        >
          Add to this section
        </button>
      </div>
      <p className="text-xs text-slate-700">
        {full ? `At most ${EXPLORE_LIMITS.maxBlocks} blocks per section.` : 'Quizzes and other Explore Deeper sections cannot be placed inside a section. Nested blocks are shown at the same levels as the section.'}
      </p>
    </div>
  );
}

/** Plain text with the lesson editor's formatting buttons: the same editor and conversion the lesson uses for a text block. */
function NestedRichTextDialog({ initial, onClose, onSave }: { initial: Record<string, unknown> | null; onClose: () => void; onSave: (content: Record<string, unknown>) => void }) {
  const locked = initial !== null && !isEditable(initial);
  const [value, setValue] = useState(initial ? richTextToEditorText(initial) : '');
  const dirty = initial ? value !== richTextToEditorText(initial) : value.trim() !== '';
  const canSave = !locked && value.trim() !== '';
  const requestClose = () => {
    if (dirty && !window.confirm('Discard your unsaved changes?')) return;
    onClose();
  };
  return (
    <Modal isOpen onClose={requestClose} title={initial ? 'Edit text' : 'Add text'} description="Paragraphs with bold, italic, links and lists, in your own words." maxWidth="xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) onSave({ ...editorTextToRichText(value) });
        }}
        className="space-y-4"
      >
        <RichTextEditor rows={8} value={value} onChange={setValue} locked={locked} />
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <button type="button" onClick={requestClose} className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
            {locked ? 'Close' : 'Cancel'}
          </button>
          {!locked && (
            <button type="submit" disabled={!canSave} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
              Save text
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

const NO_LEVELS: LearningLevel[] = [];

export function NestedBlockDialogs({
  dialog,
  blocks,
  onSave,
  onClose,
}: {
  dialog: NestedDialogState | null;
  blocks: NestedBlockDraft[];
  onSave: (state: NestedDialogState, content: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  if (dialog === null || typeof document === 'undefined') return null;
  const stored = dialog.index === null ? null : (blocks[dialog.index]?.content ?? null);
  const common = {
    isOpen: true,
    mode: 'edit' as const,
    lessonLevels: NO_LEVELS,
    saving: false,
    error: null,
    onClose,
    onSave: (content: Record<string, unknown>) => onSave(dialog, content),
  };
  let element: React.ReactNode = null;
  switch (dialog.type) {
    case 'RICH_TEXT':
      element = <NestedRichTextDialog initial={stored} onClose={onClose} onSave={(content) => onSave(dialog, content)} />;
      break;
    case 'CALLOUT':
      element = <CalloutBlockDialog {...common} initial={stored ? readCallout(stored) : null} />;
      break;
    case 'SCRIPTURE_PASSAGE':
      element = <ScriptureBlockDialog {...common} initial={stored ? readScriptureBlock(stored) : null} />;
      break;
    case 'SCRIPTURE_CONNECTION':
      element = <ScriptureConnectionDialog {...common} initial={stored ? readConnectionContent(stored) : null} />;
      break;
    case 'IMAGE':
      element = <ImageBlockDialog {...common} initial={stored ? readImageContent(stored) : null} />;
      break;
    case 'WORD_STUDY':
      element = <WordStudyDialog {...common} initial={stored ? readWord(stored) : null} />;
      break;
    case 'SYMBOL_STUDY':
      element = <SymbolStudyDialog {...common} initial={stored ? readSymbol(stored) : null} />;
      break;
    case 'HISTORICAL_EVIDENCE':
      element = <EvidenceBlockDialog {...common} initial={stored ? readEvidence(stored) : null} />;
      break;
    default:
      return null;
  }
  return createPortal(element, document.body);
}
