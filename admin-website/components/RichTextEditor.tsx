'use client';

import React, { useRef } from 'react';

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

  const apply = (transform: (selected: string) => string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    onChange(value.slice(0, start) + transform(value.slice(start, end)) + value.slice(end));
  };
  const wrap = (mark: string) => apply((s) => `${mark}${s || 'text'}${mark}`);
  const prefixLines = (make: (i: number) => string) =>
    apply((s) => (s || 'item').split('\n').map((line, i) => make(i) + line).join('\n'));

  return (
    <div>
      {!locked && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          <button type="button" className={BTN} onClick={() => wrap('**')} aria-label="Bold">B</button>
          <button type="button" className={`${BTN} italic`} onClick={() => wrap('*')} aria-label="Italic">I</button>
          <button type="button" className={BTN} onClick={() => apply((s) => `[${s || 'link text'}](https://)`)}>Link</button>
          <button type="button" className={BTN} onClick={() => prefixLines(() => '- ')}>Bullet list</button>
          <button type="button" className={BTN} onClick={() => prefixLines((i) => `${i + 1}. `)}>Numbered list</button>
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
