'use client';

import React, { useState } from 'react';
import { exploreReadiness, nestedLabel, readExplore } from '../lib/explore-deeper';
import NestedBlockView from './NestedBlockView';
import ScriptureEntriesView from './ScriptureEntriesView';

/**
 * An Explore Deeper block as the author or previewer sees it: a titled button that opens and closes the section (expanded state announced).
 * The editing list shows it open so the author sees the content; the learner preview starts closed, as learners will first see it.
 * Blocks nested inside the section, if any, are shown in their order with the lesson's own views for those block types.
 */
export default function ExploreDeeperView({ content, defaultOpen = true }: { content: unknown; defaultOpen?: boolean }) {
  const block = readExplore(content);
  const [open, setOpen] = useState(defaultOpen);
  if (!block.title.trim() && !block.intro.trim() && block.blocks.length === 0 && !(Array.isArray(block.scriptureRaw) && block.scriptureRaw.length > 0)) {
    return <span className="text-slate-600 italic font-sans text-xs">(No Explore Deeper content yet)</span>;
  }
  const missing = exploreReadiness(block);
  return (
    <section className="font-sans rounded-lg border border-slate-300 bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left rounded-lg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <span className="min-w-0">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-amber-900">Explore deeper</span>
          <span className="block text-sm font-semibold text-slate-900 break-words">{block.title.trim() || <em className="font-normal text-slate-600">No title yet</em>}</span>
        </span>
        <span className="shrink-0 text-xs font-medium text-slate-800">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {block.intro.trim() && <p className="text-sm text-slate-800 whitespace-pre-line break-words">{block.intro}</p>}
          {block.blocks.map((nested, index) => (
            <div key={nested.id} className="rounded-md border border-slate-200 bg-slate-50/60 p-2.5" role="group" aria-label={`Nested block ${index + 1}: ${nestedLabel(nested.type)}`}>
              <NestedBlockView type={nested.type} content={nested.content} />
            </div>
          ))}
          <ScriptureEntriesView entries={block.scriptureRaw} />
        </div>
      )}
      {missing.length > 0 && <p className="px-3 pb-3 text-xs font-medium text-amber-800">Needs {missing.join(' and ')} before the lesson can be published.</p>}
    </section>
  );
}
