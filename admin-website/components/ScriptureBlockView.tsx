'use client';

import React from 'react';
import { readFrozenPassage, readScriptureBlock } from '../lib/scripture-block';

/**
 * A Scripture passage block as the author or previewer sees it. In the learner preview the server returns the verified passage as it
 * would be published (reference, text and the data set it came from); in the editor the block holds only the reference, since the text
 * is looked up and frozen at publication. The author's commentary is always shown apart from the Scripture.
 */
export default function ScriptureBlockView({ content }: { content: unknown }) {
  const frozen = readFrozenPassage(content);
  const block = readScriptureBlock(content);
  const commentary = typeof (content as { commentary?: unknown } | null)?.commentary === 'string' ? ((content as { commentary: string }).commentary) : block.commentary;

  if (!frozen && !block.reference) return <span className="text-slate-600 italic font-sans text-xs">(No passage chosen yet)</span>;

  return (
    <section className="font-sans space-y-2">
      {frozen ? (
        <figure className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <figcaption className="text-sm font-semibold text-slate-900">{frozen.display}</figcaption>
          <p className="mt-1 font-serif text-sm leading-relaxed text-slate-900 break-words">
            {frozen.verses.map((v) => (
              <span key={v.verse}>
                <sup className="mr-0.5 text-[10px] text-slate-600">{v.verse}</sup>
                {v.text}{' '}
              </span>
            ))}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {frozen.source.translation}, {frozen.source.edition} (data version {frozen.source.version})
          </p>
        </figure>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-900">
            {block.reference!.bookId} {block.reference!.chapter}:{block.reference!.startVerse}
            {block.reference!.endVerse !== block.reference!.startVerse ? `-${block.reference!.endVerse}` : ''}
          </p>
          <p className="mt-1 text-xs text-slate-700">
            The Scripture text is looked up and saved with the lesson when it is published. It is not shown here because it cannot be read right now
            (see the learner preview for the passage as it would be published, when the Scripture text is installed).
          </p>
        </div>
      )}
      {commentary.trim() && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Author commentary</p>
          <p className="text-sm text-slate-800 whitespace-pre-line break-words">{commentary}</p>
        </div>
      )}
    </section>
  );
}
