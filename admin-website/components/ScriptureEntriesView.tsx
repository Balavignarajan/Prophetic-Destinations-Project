'use client';

import React from 'react';
import { describeReference, useScriptureInfo } from '../lib/scripture-info';

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The Scripture references of one timeline event or hotspot, as the author or previewer sees them. In the learner preview each entry is
 * the verified passage as it would be published (reference, text, data set); in the editor an entry is the stored reference only. The
 * Scripture is always shown apart from the author's explanation.
 */
export default function ScriptureEntriesView({ entries }: { entries: unknown }) {
  const info = useScriptureInfo();
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return (
    <ul className="mt-2 space-y-2" aria-label="Scripture references">
      {entries.filter(isObject).map((entry, index) => {
        const verses = Array.isArray(entry.verses) ? (entry.verses as unknown[]).filter(isObject) : null;
        const ref = isObject(entry.reference) ? entry.reference : null;
        const name =
          typeof entry.display === 'string'
            ? entry.display
            : ref && typeof ref.bookId === 'string'
              ? describeReference({ bookId: ref.bookId, chapter: Number(ref.chapter), startVerse: Number(ref.startVerse), endVerse: Number(ref.endVerse) }, info.bookNames)
              : 'Scripture passage';
        const source = isObject(entry.source) ? entry.source : null;
        return (
          <li key={index} className="rounded-md border border-amber-200 bg-amber-50/60 p-2">
            <p className="text-xs font-semibold text-slate-900">Scripture: {name}</p>
            {verses ? (
              <>
                <p className="mt-0.5 font-serif text-sm leading-relaxed text-slate-900 break-words">
                  {verses.map((v) => (
                    <span key={String(v.verse)}>
                      <sup className="mr-0.5 text-[10px] text-slate-600">{String(v.verse)}</sup>
                      {String(v.text ?? '')}{' '}
                    </span>
                  ))}
                </p>
                {source && <p className="text-[11px] text-slate-600">{String(source.translation ?? '')}, {String(source.edition ?? '')}</p>}
              </>
            ) : (
              <p className="text-[11px] text-slate-700">The text is looked up and saved with the lesson when it is published.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
