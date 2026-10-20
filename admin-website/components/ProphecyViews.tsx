import React from 'react';
import {
  calculationReadiness,
  comparisonReadiness,
  equivalenceReadiness,
  readCalculation,
  readComparison,
  readEquivalence,
} from '../lib/prophecy';
import ScriptureEntriesView from './ScriptureEntriesView';

/** Names exactly which stored entries cannot be read; the block is NOT shown to learners as a shortened version until they are fixed. */
const Malformed = ({ where }: { where: string[] }) =>
  where.length > 0 ? (
    <div role="alert" className="mt-2 rounded-md bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-xs text-rose-900">
      <p className="font-semibold">Cannot be shown to learners yet:</p>
      <ul className="list-disc pl-4">
        {where.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      <p>Open the editor and save to rebuild the list; until then learners see this block as incomplete, not as a shortened version.</p>
    </div>
  ) : null;

const Needs = ({ items }: { items: string[] }) => (items.length > 0 ? <p className="mt-2 text-xs font-medium text-amber-800">Before the lesson can be published: {items.join(' ')}</p> : null);

/** The author's expressions joined to the central concept; the author's wording and the Scripture are kept apart. */
export function EquivalenceView({ content }: { content: unknown }) {
  const b = readEquivalence(content);
  if (!b.concept.trim() && b.items.length === 0 && b.malformed === 0) return <span className="text-slate-600 italic font-sans text-xs">(No equivalence entered yet)</span>;
  return (
    <section className="font-sans">
      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900">Prophecy equivalence</p>
      <h4 className="text-base font-semibold text-slate-900 break-words">{b.concept.trim() || <em className="font-normal text-slate-600">No central concept yet</em>}</h4>
      <Malformed where={b.malformedWhere} />
      <ol className="mt-2 space-y-2">
        {b.items.map((i, n) => (
          <li key={i.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
            <p className="text-sm font-semibold text-slate-900 break-words">
              <span className="sr-only">Expression {n + 1}, equivalent to the concept. </span>
              {i.expression || <em className="font-normal text-slate-600">No expression yet</em>}
            </p>
            {i.label && <p className="text-sm text-slate-800 break-words">{i.label}</p>}
            <ScriptureEntriesView entries={i.scriptureRaw} />
          </li>
        ))}
      </ol>
      <Needs items={equivalenceReadiness(b)} />
    </section>
  );
}

/** Each entity as a stacked card of labelled characteristics (never a wide table), then its references and explanation. */
export function ComparisonView({ content }: { content: unknown }) {
  const b = readComparison(content);
  if (!b.title.trim() && b.entities.length === 0 && b.malformed === 0) return <span className="text-slate-600 italic font-sans text-xs">(Nothing to compare yet)</span>;
  return (
    <section className="font-sans">
      <h4 className="text-base font-semibold text-slate-900 break-words">{b.title.trim() || 'Prophecy comparison'}</h4>
      <Malformed where={b.malformedWhere} />
      <ol className="mt-2 space-y-3">
        {b.entities.map((e, n) => (
          <li key={e.id} className="rounded-lg border border-slate-300 bg-white p-3">
            <p className="text-sm font-semibold text-slate-900 break-words">
              <span className="sr-only">Entity {n + 1}. </span>
              {e.name || <em className="font-normal text-slate-600">No name yet</em>}
            </p>
            {e.characteristics.length > 0 && (
              <dl className="mt-1.5 space-y-1.5">
                {e.characteristics.map((k) => (
                  <div key={k.id}>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-700 break-words">{k.label || 'No label yet'}</dt>
                    <dd className="text-sm text-slate-800 whitespace-pre-line break-words">{k.value || <em className="text-slate-600">No value yet</em>}</dd>
                  </div>
                ))}
              </dl>
            )}
            <ScriptureEntriesView entries={e.scriptureRaw} />
            {e.explanation && (
              <div className="mt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Explanation (author)</p>
                <p className="text-sm text-slate-800 whitespace-pre-line break-words">{e.explanation}</p>
              </div>
            )}
          </li>
        ))}
      </ol>
      <Needs items={comparisonReadiness(b)} />
    </section>
  );
}

/** Author-entered steps shown as written; the footnote states plainly that the app does not compute or verify them. */
export function CalculationView({ content }: { content: unknown }) {
  const b = readCalculation(content);
  if (!b.title.trim() && b.steps.length === 0 && b.malformed === 0) return <span className="text-slate-600 italic font-sans text-xs">(No calculation steps entered yet)</span>;
  return (
    <section className="font-sans">
      <h4 className="text-base font-semibold text-slate-900 break-words">{b.title.trim() || 'Prophecy calculation'}</h4>
      <Malformed where={b.malformedWhere} />
      <ol className="mt-2 space-y-2">
        {b.steps.map((s, n) => (
          <li key={s.id} className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-900 break-words">
            <span className="sr-only">Step {n + 1}. </span>
            <span className="text-[11px] font-semibold uppercase text-slate-700">Value </span>
            <span className="font-semibold">{s.value || '(none yet)'}</span>
            {s.operator && (
              <>
                <span className="text-[11px] font-semibold uppercase text-slate-700"> · Operator or explanation </span>
                <span>{s.operator}</span>
              </>
            )}
            <span className="text-[11px] font-semibold uppercase text-slate-700"> · Result (as entered) </span>
            <span className="font-semibold">{s.result || '(none yet)'}</span>
          </li>
        ))}
      </ol>
      <p className="mt-1 text-xs text-slate-700">Shown as written by the author; not calculated or checked by the app.</p>
      <Needs items={calculationReadiness(b)} />
    </section>
  );
}
