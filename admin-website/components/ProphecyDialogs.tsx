'use client';

import React, { useState } from 'react';
import {
  CALCULATION_LIMITS,
  COMPARISON_LIMITS,
  EMPTY_CALCULATION,
  EMPTY_COMPARISON,
  EMPTY_EQUIVALENCE,
  EQUIVALENCE_LIMITS,
  type CalculationContent,
  type ComparisonContent,
  type EquivalenceContent,
  buildCalculation,
  buildComparison,
  buildEquivalence,
  calculationReadiness,
  comparisonReadiness,
  equivalenceReadiness,
  newId,
} from '../lib/prophecy';
import type { LearningLevel } from '../lib/types';
import ScriptureRefList from './ScriptureRefList';
import { Actions, LevelChoice, useGuardedClose } from './SectionCalloutDialogs';
import { Modal } from './ui';

const FIELD = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const LABEL = 'block text-sm font-semibold text-slate-800 mb-1';
const SMALL = 'block text-xs font-semibold text-slate-800';
const HELP = 'text-xs text-slate-700 mt-1';
const BTN = 'px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

interface CommonProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  /** Levels the lesson is available at (a new block starts visible at all of them). */
  lessonLevels: LearningLevel[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (content: Record<string, unknown>, levels: LearningLevel[]) => void;
}
type BodyProps = Omit<CommonProps, 'isOpen' | 'onClose'> & { requestClose: () => void; dirtyRef: React.MutableRefObject<boolean> };

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
      {error} What you typed here is unchanged.
    </p>
  );
}

function Missing({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div role="status" className="text-xs text-slate-700">
      <p className="font-semibold">A draft can be saved incomplete. Before publishing:</p>
      <ul className="list-disc pl-5">
        {items.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );
}

/** Up / Down / Remove for one entry of an ordered list. */
function RowControls({ noun, index, count, onMove, onRemove }: { noun: string; index: number; count: number; onMove: (delta: -1 | 1) => void; onRemove: () => void }) {
  return (
    <div className="flex gap-2">
      <button type="button" className={BTN} aria-label={`Move ${noun} ${index + 1} up`} disabled={index === 0} onClick={() => onMove(-1)}>Up</button>
      <button type="button" className={BTN} aria-label={`Move ${noun} ${index + 1} down`} disabled={index === count - 1} onClick={() => onMove(1)}>Down</button>
      <button type="button" className={BTN} aria-label={`Remove ${noun} ${index + 1}`} onClick={onRemove}>Remove</button>
    </div>
  );
}

function moved<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function Shell({ isOpen, requestClose, title, description, children }: { isOpen: boolean; requestClose: () => void; title: string; description: string; children: React.ReactNode }) {
  return (
    <Modal isOpen={isOpen} onClose={requestClose} title={title} description={description} maxWidth="2xl">
      {children}
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------------------------------------ equivalence

function EquivalenceBody({ mode, lessonLevels, initial, saving, error, onSave, requestClose, dirtyRef }: BodyProps & { initial: EquivalenceContent | null }) {
  const start = initial ?? EMPTY_EQUIVALENCE;
  const [draft, setDraft] = useState<EquivalenceContent>(start);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);
  dirtyRef.current = JSON.stringify(buildEquivalence(draft)) !== JSON.stringify(buildEquivalence(start));
  const canSave = !saving && (mode === 'edit' || levels.length > 0);
  const setItems = (items: EquivalenceContent['items']) => setDraft((d) => ({ ...d, items }));
  const patch = (id: string, changes: Partial<EquivalenceContent['items'][number]>) => setItems(draft.items.map((i) => (i.id === id ? { ...i, ...changes } : i)));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(buildEquivalence(draft), levels);
      }}
      className="space-y-5"
    >
      <ErrorNote error={error} />
      <fieldset className="space-y-4" disabled={saving}>
        <legend className="sr-only">Prophecy equivalence</legend>
        <div>
          <label htmlFor="eq-concept" className={LABEL}>Central concept or time period</label>
          <input id="eq-concept" type="text" maxLength={EQUIVALENCE_LIMITS.concept} value={draft.concept} onChange={(e) => setDraft((d) => ({ ...d, concept: e.target.value }))} className={FIELD} />
          <p className={HELP}>The one thing the expressions below all refer to, in your words. Required before publishing.</p>
        </div>
        <div className="space-y-3">
          <p className={LABEL}>Equivalent expressions, in the order learners read them</p>
          <p className="text-xs text-slate-700">You decide which expressions are equivalent. The app does not check or suggest equivalences.</p>
          {draft.items.length === 0 ? (
            <p className="p-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-700">No expressions yet. Add the first one.</p>
          ) : (
            <ol className="space-y-3">
              {draft.items.map((item, index) => (
                <li key={item.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">Expression {index + 1}</span>
                    <RowControls noun="expression" index={index} count={draft.items.length} onMove={(d) => setItems(moved(draft.items, index, d))} onRemove={() => setItems(draft.items.filter((i) => i.id !== item.id))} />
                  </div>
                  <div>
                    <label htmlFor={`eq-expr-${item.id}`} className={SMALL}>Expression {index + 1}</label>
                    <input id={`eq-expr-${item.id}`} type="text" maxLength={EQUIVALENCE_LIMITS.expression} value={item.expression} onChange={(e) => patch(item.id, { expression: e.target.value })} className={FIELD} />
                  </div>
                  <div>
                    <label htmlFor={`eq-label-${item.id}`} className={SMALL}>Explanatory label {index + 1} (optional)</label>
                    <input id={`eq-label-${item.id}`} type="text" maxLength={EQUIVALENCE_LIMITS.label} value={item.label} onChange={(e) => patch(item.id, { label: e.target.value })} className={FIELD} />
                  </div>
                  <ScriptureRefList itemLabel={`Expression ${index + 1}`} idPrefix={`eq-sc-${item.id}`} entries={item.scripture} onChange={(scripture) => patch(item.id, { scripture })} disabled={saving} />
                </li>
              ))}
            </ol>
          )}
          <button type="button" className={BTN} disabled={draft.items.length >= EQUIVALENCE_LIMITS.maxItems} onClick={() => setItems([...draft.items, { id: newId('i', draft.items), expression: '', label: '', scripture: [] }])}>
            Add expression
          </button>
          {draft.items.length >= EQUIVALENCE_LIMITS.maxItems && <p className="text-xs text-slate-700">At most {EQUIVALENCE_LIMITS.maxItems} expressions.</p>}
        </div>
      </fieldset>
      <Missing items={equivalenceReadiness(draft)} />
      {mode === 'create' && <LevelChoice lessonLevels={lessonLevels} levels={levels} setLevels={setLevels} disabled={saving} legend="Show this at" />}
      <Actions saving={saving} canSave={canSave} createLabel="Add equivalence to lesson" editLabel="Save equivalence" mode={mode} requestClose={requestClose} />
    </form>
  );
}

export function EquivalenceDialog({ isOpen, onClose, initial, ...rest }: CommonProps & { initial: EquivalenceContent | null }) {
  const { dirtyRef, requestClose } = useGuardedClose(rest.saving, onClose);
  return (
    <Shell isOpen={isOpen} requestClose={requestClose} title={rest.mode === 'create' ? 'Add a prophecy equivalence' : 'Edit prophecy equivalence'} description="Several expressions that you present as referring to one concept.">
      <EquivalenceBody {...rest} initial={initial} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Shell>
  );
}

// ------------------------------------------------------------------------------------------------------------------------ comparison

function ComparisonBody({ mode, lessonLevels, initial, saving, error, onSave, requestClose, dirtyRef }: BodyProps & { initial: ComparisonContent | null }) {
  const start = initial ?? EMPTY_COMPARISON;
  const [draft, setDraft] = useState<ComparisonContent>(start);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);
  dirtyRef.current = JSON.stringify(buildComparison(draft)) !== JSON.stringify(buildComparison(start));
  const canSave = !saving && (mode === 'edit' || levels.length > 0);
  const setEntities = (entities: ComparisonContent['entities']) => setDraft((d) => ({ ...d, entities }));
  const patch = (id: string, changes: Partial<ComparisonContent['entities'][number]>) => setEntities(draft.entities.map((e) => (e.id === id ? { ...e, ...changes } : e)));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(buildComparison(draft), levels);
      }}
      className="space-y-5"
    >
      <ErrorNote error={error} />
      <fieldset className="space-y-4" disabled={saving}>
        <legend className="sr-only">Prophecy comparison</legend>
        <div>
          <label htmlFor="cmp-title" className={LABEL}>Title (optional)</label>
          <input id="cmp-title" type="text" maxLength={COMPARISON_LIMITS.title} value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className={FIELD} />
        </div>
        <div className="space-y-3">
          <p className={LABEL}>Entities or passages, in the order learners read them</p>
          <p className="text-xs text-slate-700">
            Each one becomes a card with its own labelled characteristics, so a label and its value always stay together on a phone. Write the labels
            yourself; nothing is suggested, aligned or compared for you.
          </p>
          {draft.entities.length === 0 ? (
            <p className="p-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-700">Nothing to compare yet. Add the first entity or passage.</p>
          ) : (
            <ol className="space-y-3">
              {draft.entities.map((entity, index) => (
                <li key={entity.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">Entity {index + 1}</span>
                    <RowControls noun="entity" index={index} count={draft.entities.length} onMove={(d) => setEntities(moved(draft.entities, index, d))} onRemove={() => setEntities(draft.entities.filter((e) => e.id !== entity.id))} />
                  </div>
                  <div>
                    <label htmlFor={`cmp-name-${entity.id}`} className={SMALL}>Name of entity or passage {index + 1}</label>
                    <input id={`cmp-name-${entity.id}`} type="text" maxLength={COMPARISON_LIMITS.name} value={entity.name} onChange={(e) => patch(entity.id, { name: e.target.value })} className={FIELD} />
                  </div>
                  <div className="space-y-2">
                    <p className={SMALL}>Characteristics of entity {index + 1}</p>
                    {entity.characteristics.map((k, r) => (
                      <div key={k.id} className="rounded-md border border-slate-200 bg-slate-50/60 p-2 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-800">Characteristic {r + 1}</span>
                          <RowControls
                            noun={`characteristic of entity ${index + 1}`}
                            index={r}
                            count={entity.characteristics.length}
                            onMove={(d) => patch(entity.id, { characteristics: moved(entity.characteristics, r, d) })}
                            onRemove={() => patch(entity.id, { characteristics: entity.characteristics.filter((x) => x.id !== k.id) })}
                          />
                        </div>
                        <div>
                          <label htmlFor={`cmp-k-label-${k.id}`} className={SMALL}>Entity {index + 1}, characteristic {r + 1}: label</label>
                          <input id={`cmp-k-label-${k.id}`} type="text" maxLength={COMPARISON_LIMITS.label} value={k.label} onChange={(e) => patch(entity.id, { characteristics: entity.characteristics.map((x) => (x.id === k.id ? { ...x, label: e.target.value } : x)) })} className={FIELD} />
                        </div>
                        <div>
                          <label htmlFor={`cmp-k-value-${k.id}`} className={SMALL}>Entity {index + 1}, characteristic {r + 1}: value</label>
                          <textarea id={`cmp-k-value-${k.id}`} rows={2} maxLength={COMPARISON_LIMITS.value} value={k.value} onChange={(e) => patch(entity.id, { characteristics: entity.characteristics.map((x) => (x.id === k.id ? { ...x, value: e.target.value } : x)) })} className={FIELD} />
                        </div>
                      </div>
                    ))}
                    <button type="button" className={BTN} disabled={entity.characteristics.length >= COMPARISON_LIMITS.maxCharacteristics} onClick={() => patch(entity.id, { characteristics: [...entity.characteristics, { id: newId('k', entity.characteristics), label: '', value: '' }] })}>
                      Add characteristic to entity {index + 1}
                    </button>
                  </div>
                  <ScriptureRefList itemLabel={`Entity ${index + 1}`} idPrefix={`cmp-sc-${entity.id}`} title={`Supporting references for entity ${index + 1} (optional)`} entries={entity.scripture} onChange={(scripture) => patch(entity.id, { scripture })} disabled={saving} />
                  <div>
                    <label htmlFor={`cmp-expl-${entity.id}`} className={SMALL}>Explanation of entity {index + 1} (optional)</label>
                    <textarea id={`cmp-expl-${entity.id}`} rows={3} maxLength={COMPARISON_LIMITS.explanation} value={entity.explanation} onChange={(e) => patch(entity.id, { explanation: e.target.value })} className={FIELD} />
                  </div>
                </li>
              ))}
            </ol>
          )}
          <button type="button" className={BTN} disabled={draft.entities.length >= COMPARISON_LIMITS.maxEntities} onClick={() => setEntities([...draft.entities, { id: newId('e', draft.entities), name: '', characteristics: [], scripture: [], explanation: '' }])}>
            Add entity or passage
          </button>
          {draft.entities.length >= COMPARISON_LIMITS.maxEntities && <p className="text-xs text-slate-700">At most {COMPARISON_LIMITS.maxEntities} entities.</p>}
        </div>
      </fieldset>
      <Missing items={comparisonReadiness(draft)} />
      {mode === 'create' && <LevelChoice lessonLevels={lessonLevels} levels={levels} setLevels={setLevels} disabled={saving} legend="Show this at" />}
      <Actions saving={saving} canSave={canSave} createLabel="Add comparison to lesson" editLabel="Save comparison" mode={mode} requestClose={requestClose} />
    </form>
  );
}

export function ComparisonDialog({ isOpen, onClose, initial, ...rest }: CommonProps & { initial: ComparisonContent | null }) {
  const { dirtyRef, requestClose } = useGuardedClose(rest.saving, onClose);
  return (
    <Shell isOpen={isOpen} requestClose={requestClose} title={rest.mode === 'create' ? 'Add a prophecy comparison' : 'Edit prophecy comparison'} description="Entities or passages set out as cards, with characteristics you write.">
      <ComparisonBody {...rest} initial={initial} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Shell>
  );
}

// ------------------------------------------------------------------------------------------------------------------------ calculation

function CalculationBody({ mode, lessonLevels, initial, saving, error, onSave, requestClose, dirtyRef }: BodyProps & { initial: CalculationContent | null }) {
  const start = initial ?? EMPTY_CALCULATION;
  const [draft, setDraft] = useState<CalculationContent>(start);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);
  dirtyRef.current = JSON.stringify(buildCalculation(draft)) !== JSON.stringify(buildCalculation(start));
  const canSave = !saving && (mode === 'edit' || levels.length > 0);
  const setSteps = (steps: CalculationContent['steps']) => setDraft((d) => ({ ...d, steps }));
  const patch = (id: string, changes: Partial<CalculationContent['steps'][number]>) => setSteps(draft.steps.map((s) => (s.id === id ? { ...s, ...changes } : s)));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(buildCalculation(draft), levels);
      }}
      className="space-y-5"
    >
      <ErrorNote error={error} />
      <fieldset className="space-y-4" disabled={saving}>
        <legend className="sr-only">Prophecy calculation</legend>
        <p className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
          This block only <strong>displays</strong> the steps you write. The app does not calculate anything and does not check your results, so make sure
          they are right before publishing.
        </p>
        <div>
          <label htmlFor="calc-title" className={LABEL}>Title (optional)</label>
          <input id="calc-title" type="text" maxLength={CALCULATION_LIMITS.title} value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className={FIELD} />
        </div>
        <div className="space-y-3">
          <p className={LABEL}>Steps, in the order learners read them</p>
          {draft.steps.length === 0 ? (
            <p className="p-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-700">No steps yet. Add the first step.</p>
          ) : (
            <ol className="space-y-3">
              {draft.steps.map((step, index) => (
                <li key={step.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">Step {index + 1}</span>
                    <RowControls noun="step" index={index} count={draft.steps.length} onMove={(d) => setSteps(moved(draft.steps, index, d))} onRemove={() => setSteps(draft.steps.filter((s) => s.id !== step.id))} />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <label htmlFor={`calc-v-${step.id}`} className={SMALL}>Value {index + 1}</label>
                      <input id={`calc-v-${step.id}`} type="text" maxLength={CALCULATION_LIMITS.value} value={step.value} onChange={(e) => patch(step.id, { value: e.target.value })} className={FIELD} />
                    </div>
                    <div>
                      <label htmlFor={`calc-o-${step.id}`} className={SMALL}>Operator or explanation {index + 1} (optional)</label>
                      <input id={`calc-o-${step.id}`} type="text" maxLength={CALCULATION_LIMITS.operator} value={step.operator} onChange={(e) => patch(step.id, { operator: e.target.value })} className={FIELD} />
                    </div>
                    <div>
                      <label htmlFor={`calc-r-${step.id}`} className={SMALL}>Result {index + 1} (as you enter it)</label>
                      <input id={`calc-r-${step.id}`} type="text" maxLength={CALCULATION_LIMITS.result} value={step.result} onChange={(e) => patch(step.id, { result: e.target.value })} className={FIELD} />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <button type="button" className={BTN} disabled={draft.steps.length >= CALCULATION_LIMITS.maxSteps} onClick={() => setSteps([...draft.steps, { id: newId('s', draft.steps), value: '', operator: '', result: '' }])}>
            Add step
          </button>
          {draft.steps.length >= CALCULATION_LIMITS.maxSteps && <p className="text-xs text-slate-700">At most {CALCULATION_LIMITS.maxSteps} steps.</p>}
        </div>
      </fieldset>
      <Missing items={calculationReadiness(draft)} />
      {mode === 'create' && <LevelChoice lessonLevels={lessonLevels} levels={levels} setLevels={setLevels} disabled={saving} legend="Show this at" />}
      <Actions saving={saving} canSave={canSave} createLabel="Add calculation to lesson" editLabel="Save calculation" mode={mode} requestClose={requestClose} />
    </form>
  );
}

export function CalculationDialog({ isOpen, onClose, initial, ...rest }: CommonProps & { initial: CalculationContent | null }) {
  const { dirtyRef, requestClose } = useGuardedClose(rest.saving, onClose);
  return (
    <Shell isOpen={isOpen} requestClose={requestClose} title={rest.mode === 'create' ? 'Add a prophecy calculation' : 'Edit prophecy calculation'} description="Step-by-step rows you write, shown exactly as entered.">
      <CalculationBody {...rest} initial={initial} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Shell>
  );
}
