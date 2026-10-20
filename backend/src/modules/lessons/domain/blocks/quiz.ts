import { type ContentProblem, isMarkupLikeKey } from './rich-text.js';

/**
 * QUIZ block content contract: a REFERENCE to a quiz of the quiz library.
 *
 *   { "quizId": "<uuid>", "quizVersion": <integer> }
 *
 * `quizVersion` is set by the server when the block is saved: it is the version of the quiz the author chose. At publication the
 * quiz's questions, options, correct answers and explanations are copied into the lesson snapshot (see QuizEmbedService), so a
 * published lesson never changes when the quiz is edited. If the quiz has been edited since the block was saved, the lesson is
 * not ready to publish until the block is saved again (which also takes the lesson back to Draft for approval).
 * No level variants: how a quiz would differ by level is undecided (visibility per level still works).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_KEYS = ['quizId', 'quizVersion'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateQuizShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: 'Quiz content must be an object' }];
  const problems: ContentProblem[] = [];
  for (const key of Object.keys(content)) {
    if (isMarkupLikeKey(key)) problems.push({ path: key, message: `Markup-like key "${key}" is not allowed` });
    else if (!(ALLOWED_KEYS as readonly string[]).includes(key)) problems.push({ path: key, message: `Unknown key "${key}"` });
  }
  if (content.quizId !== undefined && (typeof content.quizId !== 'string' || !UUID.test(content.quizId))) {
    problems.push({ path: 'quizId', message: 'quizId must be a quiz id' });
  }
  if (content.quizVersion !== undefined && (!Number.isInteger(content.quizVersion) || (content.quizVersion as number) < 1)) {
    problems.push({ path: 'quizVersion', message: 'quizVersion must be a positive whole number' });
  }
  return problems;
}

export function validateQuizComplete(content: unknown): ContentProblem[] {
  if (!isPlainObject(content) || typeof content.quizId !== 'string') {
    return [{ path: 'quizId', message: 'Choose a quiz for this block before publishing' }];
  }
  return [];
}

/** The quiz id this content points at, if it has a well-formed one. */
export function quizIdOf(content: unknown): string | null {
  return isPlainObject(content) && typeof content.quizId === 'string' && UUID.test(content.quizId) ? content.quizId : null;
}

export function quizVersionOf(content: unknown): number | null {
  return isPlainObject(content) && Number.isInteger(content.quizVersion) ? (content.quizVersion as number) : null;
}
