import React from 'react';
import { connectionReadiness, readConnectionContent } from '../lib/scripture-connection';
import ScriptureEntriesView from './ScriptureEntriesView';

/**
 * A Scripture connection block as the author or previewer sees it: numbered connections in the author's order, each with its optional label,
 * its passages (the verified text in the learner preview) and, separately labelled, the author's explanation. What is still missing before
 * publication is shown on the block instead of being hidden, together with stored entries that are not usable connections.
 */
export default function ScriptureConnectionView({ content }: { content: unknown }) {
  const block = readConnectionContent(content);
  if (!block.title.trim() && block.connections.length === 0 && block.malformed === 0) {
    return <span className="text-slate-600 italic font-sans text-xs">(No connections yet)</span>;
  }
  const missing = connectionReadiness(block);
  return (
    <section className="font-sans">
      <h4 className="text-base font-semibold text-slate-900 break-words">{block.title.trim() || 'Scripture connection'}</h4>
      {block.malformed > 0 && (
        <p role="alert" className="mt-2 rounded-md bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-xs text-rose-900">
          {block.malformed === 1 ? 'One stored entry is' : `${block.malformed} stored entries are`} not a valid connection and cannot be shown to learners. Open
          &ldquo;Edit Connection&rdquo; and save to rebuild the list, or the lesson cannot be published.
        </p>
      )}
      <ol className="mt-3 space-y-4 border-l-2 border-slate-300 pl-4">
        {block.connections.map((connection, index) => (
          <li key={connection.id} className="relative">
            <span aria-hidden="true" className="absolute -left-[1.6rem] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
              {index + 1}
            </span>
            <p className="text-sm font-semibold text-slate-900 break-words">
              <span className="sr-only">Connection {index + 1}. </span>
              {connection.label.trim() || <em className="font-normal text-slate-600">No label</em>}
            </p>
            <ScriptureEntriesView entries={connection.scriptureRaw} />
            {connection.explanation.trim() && (
              <div className="mt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Explanation</p>
                <p className="text-sm text-slate-800 whitespace-pre-line break-words">{connection.explanation}</p>
              </div>
            )}
          </li>
        ))}
      </ol>
      {missing.length > 0 && <p className="mt-2 text-xs font-medium text-amber-800">Before the lesson can be published: {missing.join(' ')}</p>}
    </section>
  );
}
