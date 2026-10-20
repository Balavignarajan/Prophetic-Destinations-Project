import React from 'react';
import { activityLabel, discoveryReadiness, readDiscovery, readReflection, reflectionReadiness } from '../lib/reflection-discovery';
import ScriptureEntriesView from './ScriptureEntriesView';

const Needs = ({ items }: { items: string[] }) => (items.length > 0 ? <p className="mt-2 text-xs font-medium text-amber-800">Before the lesson can be published: {items.join(' ')}</p> : null);

/** The author's activity as learners read it: the type as a text label, the instruction, then any Bible references apart from it. */
export function ReflectionView({ content }: { content: unknown }) {
  const c = readReflection(content);
  if (!c.activityType && !c.instruction && !(Array.isArray(c.scriptureRaw) && c.scriptureRaw.length > 0)) return <span className="text-slate-600 italic font-sans text-xs">(No study activity entered yet)</span>;
  return (
    <aside className="font-sans rounded-lg border border-slate-300 bg-white p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900">Study activity: {activityLabel(c.activityType) || 'no type chosen yet'}</p>
      {c.instruction && <p className="mt-1 text-sm text-slate-900 whitespace-pre-line break-words">{c.instruction}</p>}
      <ScriptureEntriesView entries={c.scriptureRaw} />
      <Needs items={reflectionReadiness(c)} />
    </aside>
  );
}

/** The question, then its passage(s) and the author's explanation, all visible in reading order (nothing hidden behind a tap). */
export function DiscoveryView({ content }: { content: unknown }) {
  const c = readDiscovery(content);
  if (!c.question && !c.explanation && !(Array.isArray(c.scriptureRaw) && c.scriptureRaw.length > 0)) return <span className="text-slate-600 italic font-sans text-xs">(No guided question entered yet)</span>;
  return (
    <section className="font-sans rounded-lg border border-slate-300 bg-white p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900">Guided question</p>
      <p className="mt-1 text-sm font-semibold text-slate-900 whitespace-pre-line break-words">{c.question || <em className="font-normal text-slate-600">No question yet</em>}</p>
      <ScriptureEntriesView entries={c.scriptureRaw} />
      {c.explanation && (
        <div className="mt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Explanation (author)</p>
          <p className="text-sm text-slate-800 whitespace-pre-line break-words">{c.explanation}</p>
        </div>
      )}
      <Needs items={discoveryReadiness(c)} />
    </section>
  );
}

