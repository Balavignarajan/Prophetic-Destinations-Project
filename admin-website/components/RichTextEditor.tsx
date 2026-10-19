'use client';

import React, { useRef } from 'react';

import { linkSelection, toggleList, wrapSelection, type EditResult } from '../lib/editor-format';

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

  return (
    <div>
      {!locked && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          <button type="button" className={BTN} onClick={() => apply((v, a, b) => wrapSelection(v, a, b, '**'))} aria-label="Bold">B</button>
          <button type="button" className={`${BTN} italic`} onClick={() => apply((v, a, b) => wrapSelection(v, a, b, '*'))} aria-label="Italic">I</button>
          <button type="button" className={BTN} onClick={() => apply(linkSelection)}>Link</button>
          <button type="button" className={BTN} onClick={() => apply((v, a, b) => toggleList(v, a, b, 'bullet'))}>Bullet list</button>
          <button type="button" className={BTN} onClick={() => apply((v, a, b) => toggleList(v, a, b, 'numbered'))}>Numbered list</button>
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
    </div>
  );
}
