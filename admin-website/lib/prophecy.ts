import { type ScriptureEntryDraft, buildScriptureEntries, readScriptureEntries } from './scripture-info';

/**
 * PROPHECY_EQUIVALENCE, PROPHECY_COMPARISON and PROPHECY_CALCULATION blocks (backend/src/modules/lessons/domain/blocks/prophecy.ts). PROPOSED
 * schemas, not approved (open decision D13). All text is written by the author and shown as written: the app infers nothing, and the calculation
 * block DISPLAYS author-entered steps and results; it never evaluates, parses or verifies them.
 *   PROPHECY_EQUIVALENCE: { concept, items: [{ id, expression, label?, scripture? }] }
 *   PROPHECY_COMPARISON:  { title?, entities: [{ id, name, characteristics: [{ id, label, value }], scripture?, explanation? }] }
 *   PROPHECY_CALCULATION: { title?, steps: [{ id, value, operator?, result }] }
 */
export const EQUIVALENCE_LIMITS = { concept: 200, maxItems: 10, expression: 200, label: 200 } as const;
export const COMPARISON_LIMITS = { title: 200, maxEntities: 8, name: 200, maxCharacteristics: 12, label: 100, value: 500, explanation: 1500 } as const;
export const CALCULATION_LIMITS = { title: 200, maxSteps: 20, value: 100, operator: 300, result: 100 } as const;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value : '');

export function newId(prefix: string, existing: readonly { id: string }[]): string {
  const used = new Set(existing.map((e) => e.id));
  for (;;) {
    const id = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
    if (!used.has(id)) return id;
  }
}

/** Reads a list of objects, giving each a unique id (missing or repeated ids are replaced) and counting entries that are not objects. */
function readItems<T>(value: unknown, prefix: string, make: (raw: Record<string, unknown>, id: string) => T): { items: T[]; malformed: number; malformedAt: number[] } {
  const items: T[] = [];
  /** 1-based positions (in the stored list) of entries that are not objects, so the author is told WHICH one; 0 = the whole list is not a list. */
  const malformedAt: number[] = [];
  if (value !== undefined && !Array.isArray(value)) malformedAt.push(0);
  if (Array.isArray(value)) {
    const seen = new Set<string>();
    value.forEach((raw, index) => {
      if (!isObject(raw)) {
        malformedAt.push(index + 1);
        return;
      }
      let id = text(raw.id) || `${prefix}-${index + 1}`;
      while (seen.has(id)) id = `${id}-x`;
      seen.add(id);
      items.push(make(raw, id));
    });
  }
  return { items, malformed: malformedAt.length, malformedAt };
}

/** Names the stored entries that could not be read, in the author's numbering ("Item 2", "Entity 1, characteristic 3"). */
const describeMalformed = (noun: string, at: number[], prefix = ''): string[] => at.map((n) => (n === 0 ? `${prefix}${noun}s is not a list` : `${prefix}${noun} ${n} is not a valid entry`));

// ----------------------------------------------------------------------------------------------------------------------- equivalence

export interface EquivalenceItemDraft {
  id: string;
  expression: string;
  label: string;
  scripture: ScriptureEntryDraft[];
  scriptureRaw?: unknown;
}
export interface EquivalenceContent {
  concept: string;
  items: EquivalenceItemDraft[];
}
export const EMPTY_EQUIVALENCE: EquivalenceContent = { concept: '', items: [] };

export function readEquivalence(content: unknown): EquivalenceContent & { malformed: number; malformedWhere: string[] } {
  const c = isObject(content) ? content : {};
  const { items, malformed, malformedAt } = readItems<EquivalenceItemDraft>(c.items, 'i', (r, id) => ({ id, expression: text(r.expression), label: text(r.label), scripture: readScriptureEntries(r.scripture), scriptureRaw: r.scripture }));
  return { concept: text(c.concept), items, malformed, malformedWhere: describeMalformed('Item', malformedAt) };
}

export function buildEquivalence(draft: EquivalenceContent): Record<string, unknown> {
  return {
    concept: draft.concept.trim(),
    items: draft.items.map((i) => ({ id: i.id, expression: i.expression.trim(), ...(i.label.trim() ? { label: i.label.trim() } : {}), ...buildScriptureEntries(i.scripture) })),
  };
}

export function equivalenceReadiness(c: EquivalenceContent): string[] {
  const out: string[] = [];
  if (!c.concept.trim()) out.push('Add the central concept or time period.');
  if (c.items.length < 2) out.push('Add at least 2 equivalent items.');
  c.items.forEach((i, n) => {
    if (!i.expression.trim()) out.push(`Item ${n + 1} needs an expression.`);
  });
  return out;
}

// ------------------------------------------------------------------------------------------------------------------------ comparison

export interface CharacteristicDraft {
  id: string;
  label: string;
  value: string;
}
export interface EntityDraft {
  id: string;
  name: string;
  characteristics: CharacteristicDraft[];
  scripture: ScriptureEntryDraft[];
  scriptureRaw?: unknown;
  explanation: string;
}
export interface ComparisonContent {
  title: string;
  entities: EntityDraft[];
}
export const EMPTY_COMPARISON: ComparisonContent = { title: '', entities: [] };

export function readComparison(content: unknown): ComparisonContent & { malformed: number; malformedWhere: string[] } {
  const c = isObject(content) ? content : {};
  const { items, malformed, malformedAt } = readItems<EntityDraft & { rowsMalformed: number; rowsWhere: number[] }>(c.entities, 'e', (r, id) => {
    const rows = readItems<CharacteristicDraft>(r.characteristics, 'k', (row, rid) => ({ id: rid, label: text(row.label), value: text(row.value) }));
    return { id, name: text(r.name), characteristics: rows.items, rowsMalformed: rows.malformed, rowsWhere: rows.malformedAt, scripture: readScriptureEntries(r.scripture), scriptureRaw: r.scripture, explanation: text(r.explanation) };
  });
  // Characteristic positions are reported against the entity's position in the AUTHOR's list (entities that were dropped shift the numbering, so use the stored order).
  const stored = Array.isArray(c.entities) ? c.entities : [];
  const objectPositions = stored.map((e, i) => (isObject(e) ? i + 1 : 0)).filter((n) => n > 0);
  const rowsWhere = items.flatMap((e, k) => describeMalformed('characteristic', e.rowsWhere, `Entity ${objectPositions[k] ?? k + 1}, `));
  return {
    title: text(c.title),
    entities: items,
    malformed: malformed + items.reduce((n, e) => n + e.rowsMalformed, 0),
    malformedWhere: [...describeMalformed('Entity', malformedAt).map((m) => m.replace('Entitys', 'entities')), ...rowsWhere],
  };
}

export function buildComparison(draft: ComparisonContent): Record<string, unknown> {
  const out: Record<string, unknown> = {
    entities: draft.entities.map((e) => ({
      id: e.id,
      name: e.name.trim(),
      characteristics: e.characteristics.map((k) => ({ id: k.id, label: k.label.trim(), value: k.value.trim() })),
      ...(e.explanation.trim() ? { explanation: e.explanation.trim() } : {}),
      ...buildScriptureEntries(e.scripture),
    })),
  };
  if (draft.title.trim()) out.title = draft.title.trim();
  return out;
}

export function comparisonReadiness(c: ComparisonContent): string[] {
  const out: string[] = [];
  if (c.entities.length < 2) out.push('Add at least 2 entities or passages to compare.');
  c.entities.forEach((e, n) => {
    if (!e.name.trim()) out.push(`Entity ${n + 1} needs a name.`);
    if (e.characteristics.length === 0) out.push(`Entity ${n + 1} needs at least one characteristic.`);
    e.characteristics.forEach((k, r) => {
      if (!k.label.trim()) out.push(`Entity ${n + 1}, characteristic ${r + 1} needs a label.`);
      if (!k.value.trim()) out.push(`Entity ${n + 1}, characteristic ${r + 1} needs a value.`);
    });
  });
  return out;
}

// ----------------------------------------------------------------------------------------------------------------------- calculation

export interface StepDraft {
  id: string;
  value: string;
  operator: string;
  result: string;
}
export interface CalculationContent {
  title: string;
  steps: StepDraft[];
}
export const EMPTY_CALCULATION: CalculationContent = { title: '', steps: [] };

export function readCalculation(content: unknown): CalculationContent & { malformed: number; malformedWhere: string[] } {
  const c = isObject(content) ? content : {};
  const { items, malformed, malformedAt } = readItems<StepDraft>(c.steps, 's', (r, id) => ({ id, value: text(r.value), operator: text(r.operator), result: text(r.result) }));
  return { title: text(c.title), steps: items, malformed, malformedWhere: describeMalformed('Step', malformedAt) };
}

export function buildCalculation(draft: CalculationContent): Record<string, unknown> {
  const out: Record<string, unknown> = {
    steps: draft.steps.map((s) => ({ id: s.id, value: s.value.trim(), ...(s.operator.trim() ? { operator: s.operator.trim() } : {}), result: s.result.trim() })),
  };
  if (draft.title.trim()) out.title = draft.title.trim();
  return out;
}

export function calculationReadiness(c: CalculationContent): string[] {
  const out: string[] = [];
  if (c.steps.length === 0) out.push('Add at least one step.');
  c.steps.forEach((s, n) => {
    if (!s.value.trim()) out.push(`Step ${n + 1} needs a value.`);
    if (!s.result.trim()) out.push(`Step ${n + 1} needs a result.`);
  });
  return out;
}
