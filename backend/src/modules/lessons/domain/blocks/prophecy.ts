import { type ContentProblem, isMarkupLikeKey } from './rich-text.js';
import { validateScriptureEntries } from './scripture-refs.js';

/**
 * PROPHECY_EQUIVALENCE, PROPHECY_COMPARISON and PROPHECY_CALCULATION content contracts (feature register BLK-010, BLK-012, BLK-011; CMS-024..026).
 * The identifiers already exist (block-types.ts, the database CHECK): no migration. The workbook enumerates fields but gives no schema, limits
 * or required/optional marking, and decision D13 (the open shapes) is unanswered, so every schema below is PROPOSED, NOT APPROVED. Where the
 * field list is ambiguous the proposal takes the smallest reading and says so. No level variants (D3, D4).
 *
 * All text is AUTHOR-WRITTEN plain text and is shown as the author's words. Nothing is inferred, looked up or checked: no equivalence, date
 * relationship, prophetic meaning or arithmetic result is ever produced or verified by the application.
 *
 * PROPHECY_EQUIVALENCE ("central concept; equivalent items; Scripture references; labels; optional calculation"):
 *   { "concept": "the common concept or time period",
 *     "items": [ { "id", "expression": "42 months", "label": "optional explanatory label", "scripture": [ { reference, dataset?, refresh? }, ... ] } ] }
 *   - Items keep the author's order. `scripture` (up to 5 per item, scripture-refs.ts) is optional: the field list does not say it is mandatory.
 *   - Publishing needs a concept and at least two items (it connects multiple expressions), each with an expression.
 *   - "Optional calculation" is NOT implemented: how it relates to PROPHECY_CALCULATION is undecided (D13). Unknown keys are rejected.
 *
 * PROPHECY_COMPARISON ("entities/passages; characteristics; supporting references; explanation"; phones show cards, never a wide table):
 *   { "title": "optional",
 *     "entities": [ { "id", "name": "the entity or passage", "characteristics": [ { "id", "label", "value" } ],
 *                     "scripture": [ … ], "explanation": "optional" } ] }
 *   - The matrix semantics (entities x characteristics) are open (D13). The proposal does NOT force shared columns: each entity is a card with its
 *     own labelled characteristics, so a label and its value always stay together and nothing is aligned or compared by the application. The
 *     author may reuse the same labels across entities. Entities and characteristics keep the author's order.
 *   - Publishing needs at least two entities, each with a name and at least one characteristic with both a label and a value.
 *
 * PROPHECY_CALCULATION ("title; ordered steps; value; operator/explanation; result"; presentation only, not a formula engine):
 *   { "title": "optional", "steps": [ { "id", "value": "42", "operator": "x 30" | "explanation text", "result": "1,260" } ] }
 *   - DISPLAY ONLY. `value`, `operator` and `result` are plain text shown exactly as written. The application never parses, evaluates or
 *     verifies them, never executes anything, and presents results as entered by the author.
 *   - "Operator/explanation" is read as ONE optional text field. Publishing needs at least one step, each with a value and a result.
 */
export const EQUIVALENCE_LIMITS = { concept: 200, maxItems: 10, expression: 200, label: 200 } as const;
export const COMPARISON_LIMITS = { title: 200, maxEntities: 8, name: 200, maxCharacteristics: 12, label: 100, value: 500, explanation: 1500 } as const;
export const CALCULATION_LIMITS = { title: 200, maxSteps: 20, value: 100, operator: 300, result: 100 } as const;
const MAX_ID = 40;
const ID = /^[A-Za-z0-9_-]+$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkText(source: Record<string, unknown>, key: string, max: number, path: string, label: string, problems: ContentProblem[]): void {
  const value = source[key];
  if (value === undefined) return;
  if (typeof value !== 'string') problems.push({ path, message: `${label} must be text` });
  else if (value.length > max) problems.push({ path, message: `${label} must be at most ${max} characters` });
  else if (value.includes('\u0000')) problems.push({ path, message: `${label} must not contain NUL characters` });
}

function checkKeys(content: Record<string, unknown>, allowed: readonly string[], prefix: string, label: string, problems: ContentProblem[]): void {
  for (const key of Object.keys(content)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isMarkupLikeKey(key)) problems.push({ path, message: `${label}markup-like key "${key}" is not allowed` });
    else if (!allowed.includes(key)) problems.push({ path, message: `${label}unknown key "${key}"` });
  }
}

function checkId(item: Record<string, unknown>, seen: Set<string>, path: string, label: string, noun: string, problems: ContentProblem[]): void {
  const id = item.id;
  if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ID || !ID.test(id)) {
    problems.push({ path, message: `${label} needs an id of letters, digits, "-" or "_" (up to ${MAX_ID} characters)` });
  } else if (seen.has(id)) {
    problems.push({ path, message: `${label} repeats the id of another ${noun}` });
  } else {
    seen.add(id);
  }
}

/** Reads a list under `key`; returns it (or null with a problem recorded) and notes an excess length. */
function readList(content: Record<string, unknown>, key: string, max: number, what: string, problems: ContentProblem[]): unknown[] | null {
  const list = content[key];
  if (list === undefined) return null;
  if (!Array.isArray(list)) {
    problems.push({ path: key, message: `${key} must be a list` });
    return null;
  }
  if (list.length > max) problems.push({ path: key, message: `At most ${max} ${what} are allowed` });
  return list.slice(0, max);
}

const blank = (value: unknown) => typeof value !== 'string' || value.trim() === '';
const listOf = (content: unknown, key: string): unknown[] => (isPlainObject(content) && Array.isArray(content[key]) ? (content[key] as unknown[]) : []);

// ----------------------------------------------------------------------------------------------------------- PROPHECY_EQUIVALENCE

export function validateEquivalenceShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: 'Prophecy equivalence content must be an object' }];
  const L = EQUIVALENCE_LIMITS;
  const problems: ContentProblem[] = [];
  checkKeys(content, ['concept', 'items'], '', '', problems);
  checkText(content, 'concept', L.concept, 'concept', 'The central concept', problems);
  const items = readList(content, 'items', L.maxItems, 'equivalent items', problems);
  const seen = new Set<string>();
  items?.forEach((item, index) => {
    const at = `items[${index}]`;
    const n = `Item ${index + 1}`;
    if (!isPlainObject(item)) {
      problems.push({ path: at, message: `${n} must be an object` });
      return;
    }
    checkKeys(item, ['id', 'expression', 'label', 'scripture'], at, `${n}: `, problems);
    checkId(item, seen, `${at}.id`, n, 'item', problems);
    checkText(item, 'expression', L.expression, `${at}.expression`, `${n}: the expression`, problems);
    checkText(item, 'label', L.label, `${at}.label`, `${n}: the label`, problems);
    validateScriptureEntries(item.scripture, `${at}.scripture`, n, problems);
  });
  return problems;
}

export function validateEquivalenceComplete(content: unknown): ContentProblem[] {
  const problems: ContentProblem[] = [];
  if (!isPlainObject(content) || blank(content.concept)) problems.push({ path: 'concept', message: 'Add the central concept or time period before publishing' });
  const items = listOf(content, 'items');
  if (items.length < 2) problems.push({ path: 'items', message: 'Add at least 2 equivalent items before publishing (it connects multiple expressions)' });
  items.forEach((raw, index) => {
    if (blank(isPlainObject(raw) ? raw.expression : undefined)) problems.push({ path: `items[${index}].expression`, message: `Item ${index + 1} needs an expression` });
  });
  return problems;
}

// ------------------------------------------------------------------------------------------------------------ PROPHECY_COMPARISON

export function validateComparisonShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: 'Prophecy comparison content must be an object' }];
  const L = COMPARISON_LIMITS;
  const problems: ContentProblem[] = [];
  checkKeys(content, ['title', 'entities'], '', '', problems);
  checkText(content, 'title', L.title, 'title', 'The title', problems);
  const entities = readList(content, 'entities', L.maxEntities, 'entities', problems);
  const seen = new Set<string>();
  entities?.forEach((entity, index) => {
    const at = `entities[${index}]`;
    const n = `Entity ${index + 1}`;
    if (!isPlainObject(entity)) {
      problems.push({ path: at, message: `${n} must be an object` });
      return;
    }
    checkKeys(entity, ['id', 'name', 'characteristics', 'scripture', 'explanation'], at, `${n}: `, problems);
    checkId(entity, seen, `${at}.id`, n, 'entity', problems);
    checkText(entity, 'name', L.name, `${at}.name`, `${n}: the name`, problems);
    checkText(entity, 'explanation', L.explanation, `${at}.explanation`, `${n}: the explanation`, problems);
    validateScriptureEntries(entity.scripture, `${at}.scripture`, n, problems);
    const rows = readList(entity, 'characteristics', L.maxCharacteristics, 'characteristics per entity', []) ;
    if (entity.characteristics !== undefined && !Array.isArray(entity.characteristics)) problems.push({ path: `${at}.characteristics`, message: `${n}: characteristics must be a list` });
    if (Array.isArray(entity.characteristics) && entity.characteristics.length > L.maxCharacteristics) problems.push({ path: `${at}.characteristics`, message: `${n}: at most ${L.maxCharacteristics} characteristics are allowed` });
    const seenRows = new Set<string>();
    rows?.forEach((row, r) => {
      const rat = `${at}.characteristics[${r}]`;
      const rn = `${n}, characteristic ${r + 1}`;
      if (!isPlainObject(row)) {
        problems.push({ path: rat, message: `${rn} must be an object` });
        return;
      }
      checkKeys(row, ['id', 'label', 'value'], rat, `${rn}: `, problems);
      checkId(row, seenRows, `${rat}.id`, rn, 'characteristic', problems);
      checkText(row, 'label', L.label, `${rat}.label`, `${rn}: the label`, problems);
      checkText(row, 'value', L.value, `${rat}.value`, `${rn}: the value`, problems);
    });
  });
  return problems;
}

export function validateComparisonComplete(content: unknown): ContentProblem[] {
  const problems: ContentProblem[] = [];
  const entities = listOf(content, 'entities');
  if (entities.length < 2) problems.push({ path: 'entities', message: 'Add at least 2 entities or passages to compare before publishing' });
  entities.forEach((raw, index) => {
    const entity = isPlainObject(raw) ? raw : {};
    const n = `Entity ${index + 1}`;
    if (blank(entity.name)) problems.push({ path: `entities[${index}].name`, message: `${n} needs a name` });
    const rows = listOf(entity, 'characteristics');
    if (rows.length === 0) problems.push({ path: `entities[${index}].characteristics`, message: `${n} needs at least one characteristic` });
    rows.forEach((r, k) => {
      const row = isPlainObject(r) ? r : {};
      if (blank(row.label)) problems.push({ path: `entities[${index}].characteristics[${k}].label`, message: `${n}, characteristic ${k + 1} needs a label` });
      if (blank(row.value)) problems.push({ path: `entities[${index}].characteristics[${k}].value`, message: `${n}, characteristic ${k + 1} needs a value` });
    });
  });
  return problems;
}

// ----------------------------------------------------------------------------------------------------------- PROPHECY_CALCULATION

export function validateCalculationShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: 'Prophecy calculation content must be an object' }];
  const L = CALCULATION_LIMITS;
  const problems: ContentProblem[] = [];
  checkKeys(content, ['title', 'steps'], '', '', problems);
  checkText(content, 'title', L.title, 'title', 'The title', problems);
  const steps = readList(content, 'steps', L.maxSteps, 'steps', problems);
  const seen = new Set<string>();
  steps?.forEach((step, index) => {
    const at = `steps[${index}]`;
    const n = `Step ${index + 1}`;
    if (!isPlainObject(step)) {
      problems.push({ path: at, message: `${n} must be an object` });
      return;
    }
    checkKeys(step, ['id', 'value', 'operator', 'result'], at, `${n}: `, problems);
    checkId(step, seen, `${at}.id`, n, 'step', problems);
    checkText(step, 'value', L.value, `${at}.value`, `${n}: the value`, problems);
    checkText(step, 'operator', L.operator, `${at}.operator`, `${n}: the operator or explanation`, problems);
    checkText(step, 'result', L.result, `${at}.result`, `${n}: the result`, problems);
  });
  return problems;
}

export function validateCalculationComplete(content: unknown): ContentProblem[] {
  const problems: ContentProblem[] = [];
  const steps = listOf(content, 'steps');
  if (steps.length === 0) problems.push({ path: 'steps', message: 'Add at least one step before publishing' });
  steps.forEach((raw, index) => {
    const step = isPlainObject(raw) ? raw : {};
    if (blank(step.value)) problems.push({ path: `steps[${index}].value`, message: `Step ${index + 1} needs a value` });
    if (blank(step.result)) problems.push({ path: `steps[${index}].result`, message: `Step ${index + 1} needs a result` });
  });
  return problems;
}
