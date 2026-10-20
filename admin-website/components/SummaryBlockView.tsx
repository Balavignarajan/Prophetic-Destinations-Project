import React from 'react';
import { readSummaryContent } from '../lib/summary-block';
import ScriptureEntriesView from './ScriptureEntriesView';

function TextSection({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <h5 className="text-xs font-semibold uppercase tracking-wide text-amber-900">{label}</h5>
      <ol className="mt-1 list-decimal space-y-1.5 pl-5 text-sm text-slate-800 leading-relaxed">
        {items.map((item, index) => (
          <li key={index} className="break-words whitespace-pre-line">
            {item}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * A summary block as the author or previewer sees it: the heading (if any), then each section that has content under its own label (Key ideas,
 * Key Scripture, Prophecy takeaways, Application takeaways). Sections without content are left out; content is never hidden. An older summary
 * (heading and takeaways only) shows its takeaways as "Key ideas". In the learner preview, key Scripture is the verified passage as it would be published.
 */
export default function SummaryBlockView({ content }: { content: unknown }) {
  const summary = readSummaryContent(content);
  const clean = (list: string[]) => list.filter((t) => t.trim().length > 0);
  const keyIdeas = clean(summary.takeaways);
  const prophecy = clean(summary.prophecyTakeaways);
  const application = clean(summary.applicationTakeaways);
  const hasScripture = Array.isArray(summary.keyScriptureRaw) && summary.keyScriptureRaw.length > 0;
  if (!summary.heading.trim() && keyIdeas.length + prophecy.length + application.length === 0 && !hasScripture) {
    return <span className="text-slate-600 italic font-sans text-xs">(No takeaways yet)</span>;
  }
  return (
    <section className="font-sans">
      <h4 className="text-base font-semibold text-slate-900 break-words">{summary.heading.trim() || 'Summary'}</h4>
      <TextSection label="Key ideas" items={keyIdeas} />
      {hasScripture && (
        <div className="mt-3">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-amber-900">Key Scripture</h5>
          <ScriptureEntriesView entries={summary.keyScriptureRaw} />
        </div>
      )}
      <TextSection label="Prophecy takeaways" items={prophecy} />
      <TextSection label="Application takeaways" items={application} />
    </section>
  );
}
