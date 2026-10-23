'use client';

import React, { useId, useRef, useState } from 'react';

import { insertScriptureReference, linkSelection, toggleHeading, toggleList, wrapSelection, type EditResult } from '../lib/editor-format';
import ScripturePicker, { type ScriptureRefValue } from './ScripturePicker';

type Props = {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  /** Content the editor cannot represent exactly: shown read-only so it is never silently rewritten. */
  locked?: boolean;
};

const BTN = 'px-2 py-1 text-xs font-semibold border border-slate-300 rounded bg-white text-slate-700 hover:bg-slate-50';

/** Plain textarea plus a small toolbar that inserts the editor syntax understood by lib/rich-text.ts. */
export default function RichTextEditor({ value, onChange, rows = 6, placeholder, locked = false }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const pickerId = useId();
  // Where the cursor was when "Scripture" was pressed: choosing a passage moves the focus away from the text.
  const [picking, setPicking] = useState<{ start: number; end: number } | null>(null);
  const [candidate, setCandidate] = useState<ScriptureRefValue | null>(null);

  const apply = (edit: (value: string, start: number, end: number) => EditResult) => {
    const el = ref.current;
    if (!el) return;
    const result = edit(value, el.selectionStart, el.selectionEnd);
    onChange(result.value);
    // Restore the selection once React has written the new value.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const closePicker = () => {
    setPicking(null);
    setCandidate(null);
  };

  const insertReference = () => {
    const el = ref.current;
    if (!el || !picking || !candidate) return;
    const result = insertScriptureReference(value, picking.start, picking.end, candidate);
    onChange(result.value);
    closePicker();
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  return (
    <div>
      {!locked && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          <button type="button" className={BTN} onClick={() => apply((v, a, b) => toggleHeading(v, a, b, 1))} aria-label="Heading level 1" title="Heading 1">H1</button>
          <button type="button" className={BTN} onClick={() => apply((v, a, b) => toggleHeading(v, a, b, 2))} aria-label="Heading level 2" title="Heading 2">H2</button>
          <button type="button" className={BTN} onClick={() => apply((v, a, b) => toggleHeading(v, a, b, 3))} aria-label="Heading level 3" title="Heading 3">H3</button>
          <button type="button" className={BTN} onClick={() => apply((v, a, b) => wrapSelection(v, a, b, '**'))} aria-label="Bold">B</button>
          <button type="button" className={`${BTN} italic`} onClick={() => apply((v, a, b) => wrapSelection(v, a, b, '*'))} aria-label="Italic">I</button>
          <button type="button" className={BTN} onClick={() => apply(linkSelection)}>Link</button>
          <button type="button" className={BTN} onClick={() => apply((v, a, b) => toggleList(v, a, b, 'bullet'))}>Bullet list</button>
          <button type="button" className={BTN} onClick={() => apply((v, a, b) => toggleList(v, a, b, 'numbered'))}>Numbered list</button>
          <button
            type="button"
            className={BTN}
            aria-expanded={picking !== null}
            onClick={() => {
              const el = ref.current;
              if (picking) closePicker();
              else if (el) setPicking({ start: el.selectionStart, end: el.selectionEnd });
            }}
          >
            Scripture
          </button>
        </div>
      )}
      {!locked && picking && (
        <div className="mb-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
          <p className="text-xs text-slate-700">Choose a passage to add as a Scripture reference in the text. It is saved as a reference (book, chapter and verses), never as typed words, and the learner app shows the approved text.</p>
          <ScripturePicker idPrefix={`rich-text-${pickerId}`} value={null} onChange={setCandidate} />
          <div className="flex gap-2">
            <button type="button" className={BTN} disabled={!candidate} onClick={insertReference}>
              Insert reference
            </button>
            <button type="button" className={BTN} onClick={closePicker}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {locked && (
        <p className="mb-1.5 text-xs text-amber-700">
          This block uses formatting the editor cannot reproduce exactly, so it is read-only here to avoid losing content.
        </p>
      )}
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        readOnly={locked}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 font-serif leading-relaxed"
      />
      {!locked && (
        <p className="mt-1 text-xs text-slate-600">
          Headings: start a line with #, ## or ### and a space. A Scripture reference appears as {'{{Daniel 2:31-35}}'}; add one with the Scripture button.
        </p>
      )}
    </div>
  );
}
