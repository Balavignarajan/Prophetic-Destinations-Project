import { type ContentProblem, isMarkupLikeKey } from './rich-text.js';
import { itemReferenceOf, validateScriptureEntries } from './scripture-refs.js';

/**
 * REFLECTION_STUDY_ACTIVITY and GUIDED_DISCOVERY_QUESTION content contracts. Both schemas are PROPOSED, NOT APPROVED; the documented FIELDS are the
 * workbook's (CMS Components sheet, BLK-018 / BLK-019). REFLECTION_STUDY_ACTIVITY already exists in block-types.ts and the database CHECK.
 * GUIDED_DISCOVERY_QUESTION is a new identifier (open decision D1) added with migration AddGuidedDiscoveryBlockType1791800000000.
 *
 * Everything is AUTHOR-WRITTEN plain text shown as the author's prompt. Neither block collects, stores or scores anything from the learner: there
 * is no text entry, no saved answer, no journal and no completion state (the workbook rules a learner journal OUT OF SCOPE: "use Reflection / Study
 * Activity prompts only"). No level variants (D3).
 *
 * REFLECTION_STUDY_ACTIVITY ("Activity type; instruction; Scripture references"; "Display configured Reflect/Compare/Find/Study/Read/Personal
 * Application instruction with references. No in-app journal required"):
 *
 *   { "activityType": "REFLECT" | "COMPARE" | "FIND" | "STUDY" | "READ" | "PERSONAL_APPLICATION",
 *     "instruction": "what the learner is asked to do, in the author's words",
 *     "scripture": [ { reference, dataset?, refresh? }, ... ] }       // optional, up to 5 (scripture-refs.ts)
 *
 *   - The six activity types are exactly the ones NAMED in the requirement; no other type exists.
 *   - Publishing needs an activity type and an instruction. "With references" does not say they are mandatory, so Scripture is optional here
 *     (a gap to confirm); a reference-free activity needs no Scripture text.
 *
 * GUIDED_DISCOVERY_QUESTION ("Question; Scripture; explanation; optional response interaction"; "Ask a configured study question and direct learner
 * to passage/explanation; use sparingly, not as needless tap-to-reveal"):
 *
 *   { "question": "the study question",
 *     "scripture": [ { reference, dataset?, refresh? }, ... ],        // up to 5
 *     "explanation": "the author's explanation" }
 *
 *   - A SINGLE question, not a sequence: the requirement describes one configured question, so no step list or branching is invented.
 *   - The passage and the explanation are shown directly in the reading flow (LESS-007), never hidden behind a tap.
 *   - Publishing needs the question, at least one passage and the explanation (the field list names all three without marking any optional; the
 *     "passage/explanation" wording is ambiguous, so this reads it strictly). The block therefore cannot be published while the Scripture text is
 *     missing; the requirement is not weakened to work around that.
 *   - "Optional response interaction" is NOT implemented: its meaning is undefined (open decision D13), so there is no response field, no storage and
 *     no answer checking. Unknown keys are rejected so nothing is stored silently.
 */
export const ACTIVITY_TYPES = ['REFLECT', 'COMPARE', 'FIND', 'STUDY', 'READ', 'PERSONAL_APPLICATION'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export const REFLECTION_LIMITS = { instruction: 1500 } as const;
export const DISCOVERY_LIMITS = { question: 500, explanation: 2000 } as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkText(source: Record<string, unknown>, key: string, max: number, label: string, problems: ContentProblem[]): void {
  const value = source[key];
  if (value === undefined) return;
  if (typeof value !== 'string') problems.push({ path: key, message: `${label} must be text` });
  else if (value.length > max) problems.push({ path: key, message: `${label} must be at most ${max} characters` });
  else if (value.includes('\u0000')) problems.push({ path: key, message: `${label} must not contain NUL characters` });
}

function checkKeys(content: Record<string, unknown>, allowed: readonly string[], problems: ContentProblem[]): void {
  for (const key of Object.keys(content)) {
    if (isMarkupLikeKey(key)) problems.push({ path: key, message: `Markup-like key "${key}" is not allowed` });
    else if (!allowed.includes(key)) problems.push({ path: key, message: `Unknown key "${key}"` });
  }
}

const blank = (value: unknown) => typeof value !== 'string' || value.trim() === '';

// ------------------------------------------------------------------------------------------------------------ REFLECTION_STUDY_ACTIVITY

export function validateReflectionShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: 'Study activity content must be an object' }];
  const problems: ContentProblem[] = [];
  checkKeys(content, ['activityType', 'instruction', 'scripture'], problems);
  if (content.activityType !== undefined && !(ACTIVITY_TYPES as readonly unknown[]).includes(content.activityType)) {
    problems.push({ path: 'activityType', message: `The activity type must be one of ${ACTIVITY_TYPES.join(', ')}` });
  }
  checkText(content, 'instruction', REFLECTION_LIMITS.instruction, 'The instruction', problems);
  validateScriptureEntries(content.scripture, 'scripture', 'Scripture references', problems);
  return problems;
}

export function validateReflectionComplete(content: unknown): ContentProblem[] {
  const c = isPlainObject(content) ? content : {};
  const problems: ContentProblem[] = [];
  if (typeof c.activityType !== 'string') problems.push({ path: 'activityType', message: 'Choose the activity type (Reflect, Compare, Find, Study, Read or Personal application)' });
  if (blank(c.instruction)) problems.push({ path: 'instruction', message: 'The study activity needs an instruction' });
  return problems;
}

// ----------------------------------------------------------------------------------------------------------- GUIDED_DISCOVERY_QUESTION

export function validateDiscoveryShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: 'Guided discovery content must be an object' }];
  const problems: ContentProblem[] = [];
  checkKeys(content, ['question', 'scripture', 'explanation'], problems);
  checkText(content, 'question', DISCOVERY_LIMITS.question, 'The question', problems);
  checkText(content, 'explanation', DISCOVERY_LIMITS.explanation, 'The explanation', problems);
  validateScriptureEntries(content.scripture, 'scripture', 'Passages', problems);
  return problems;
}

export function validateDiscoveryComplete(content: unknown): ContentProblem[] {
  const c = isPlainObject(content) ? content : {};
  const problems: ContentProblem[] = [];
  if (blank(c.question)) problems.push({ path: 'question', message: 'The guided question needs the question itself' });
  const passages = Array.isArray(c.scripture) ? c.scripture : [];
  if (passages.length === 0) problems.push({ path: 'scripture', message: 'The guided question needs at least one Scripture passage' });
  passages.forEach((entry, index) => {
    if (itemReferenceOf(entry) === null) problems.push({ path: `scripture[${index}]`, message: `Passage ${index + 1} is incomplete` });
  });
  if (blank(c.explanation)) problems.push({ path: 'explanation', message: 'The guided question needs an explanation' });
  return problems;
}
