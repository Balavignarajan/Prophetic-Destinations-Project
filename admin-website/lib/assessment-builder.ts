import { type EditorQuestion, LEVELS, LEVEL_LABEL, LIMITS, type Level, fieldIdForPath, newKey } from './assessments';

/**
 * Pure helpers of the Assessment Question Builder (no React, no requests): what a question is still missing, whether a points entry is acceptable, duplicating a question, and the ids of the
 * fields a problem points at. The rules are the ones the assessment backend and `checkEditor` (lib/assessments.ts) already apply: a question needs text, between 2 and 6 answers, text in every answer,
 * no two answers with the same text (a publishing check) and whole-number points from 0 to 100 for each of the three levels on every answer. Nothing here is a new rule, and nothing is scoring:
 * the points are the author's, and nothing is pre-filled or calculated.
 */

/** The same test the save uses for one points entry: a whole number of up to three digits, not above the maximum. */
export function isValidPoints(raw: string): boolean {
  const text = raw.trim();
  return text !== '' && text.length <= 3 && Array.from(text).every((char) => char >= '0' && char <= '9') && Number(text) <= LIMITS.pointsMax;
}

/** The id of the points field of one level of one answer (the first level keeps the id the problem list has always linked to). */
export const pointsFieldId = (qi: number, oi: number, level: Level): string => (level === LEVELS[0] ? `as-q${qi}-o${oi}-points` : `as-q${qi}-o${oi}-points-${level}`);
export const answerTextFieldId = (qi: number, oi: number): string => `as-q${qi}-o${oi}-text`;
export const promptFieldId = (qi: number): string => `as-q${qi}-prompt`;

export interface QuestionIssue {
  code: 'prompt' | 'prompt-long' | 'few-answers' | 'answer-text' | 'answer-long' | 'duplicate' | 'points';
  /** The few words shown beside the question in the list. */
  short: string;
  /** The sentence that finishes "Question 3: ..." in a message. */
  message: string;
  /** The field to take the author to. */
  fieldId: string;
}

const same = (text: string) => text.trim().toLocaleLowerCase();

/** What stops this question from being saved or published, in the order an author would fix it. `qi` is the question's 0-based place. Guidance only: the server is the judge. */
export function questionIssues(q: EditorQuestion, qi: number): QuestionIssue[] {
  const issues: QuestionIssue[] = [];
  if (q.prompt.trim() === '') issues.push({ code: 'prompt', short: 'Missing question text', message: 'the question text is required', fieldId: promptFieldId(qi) });
  else if (q.prompt.trim().length > LIMITS.promptMax) issues.push({ code: 'prompt-long', short: 'Question text too long', message: `the question text can be at most ${LIMITS.promptMax} characters`, fieldId: promptFieldId(qi) });
  if (q.options.length < LIMITS.optionsMin) issues.push({ code: 'few-answers', short: `Needs ${LIMITS.optionsMin} to ${LIMITS.optionsMax} answers`, message: `it needs at least ${LIMITS.optionsMin} answers`, fieldId: `as-q${qi}-add` });
  const emptyAnswer = q.options.findIndex((o) => o.text.trim() === '');
  if (emptyAnswer >= 0) issues.push({ code: 'answer-text', short: 'Missing answer text', message: `answer ${emptyAnswer + 1} has no text`, fieldId: answerTextFieldId(qi, emptyAnswer) });
  const longAnswer = q.options.findIndex((o) => o.text.trim().length > LIMITS.optionTextMax);
  if (longAnswer >= 0) issues.push({ code: 'answer-long', short: 'Answer text too long', message: `answer ${longAnswer + 1} can be at most ${LIMITS.optionTextMax} characters`, fieldId: answerTextFieldId(qi, longAnswer) });
  const seen = new Set<string>();
  const duplicate = q.options.findIndex((o) => {
    const key = same(o.text);
    if (key === '') return false;
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
  if (duplicate >= 0) issues.push({ code: 'duplicate', short: 'Duplicate answers', message: 'two answers have the same text', fieldId: answerTextFieldId(qi, duplicate) });
  for (let oi = 0; oi < q.options.length; oi += 1) {
    const level = LEVELS.find((l) => !isValidPoints(q.options[oi].scores[l]));
    if (level) {
      issues.push({ code: 'points', short: 'Missing score configuration', message: `answer ${oi + 1} needs ${LEVEL_LABEL[level]} points (a whole number from 0 to ${LIMITS.pointsMax})`, fieldId: pointsFieldId(qi, oi, level) });
      break;
    }
  }
  return issues;
}

/** A copy of a question for "Duplicate question": the same text, answers and points, with keys of its own and NO ids, so the server treats it as a new question when the assessment is saved. */
export function copyQuestion(q: EditorQuestion): EditorQuestion {
  return { key: newKey(), prompt: q.prompt, options: q.options.map((o) => ({ key: newKey(), text: o.text, scores: { ...o.scores } })) };
}

/** True when the question holds anything the author typed (so removing it asks first). */
export const questionHasContent = (q: EditorQuestion): boolean =>
  q.prompt.trim() !== '' || q.options.some((o) => o.text.trim() !== '' || LEVELS.some((l) => o.scores[l].trim() !== ''));

/** "A", "B", ... for the first six answers (a question has at most six). */
export const answerLetter = (index: number): string => String.fromCharCode(65 + index);

// ------------------------------------------------------------------------------------------------------------------------------------ where a problem leads

/** The tabs a problem can lead to (Publishing holds the checks themselves, so nothing there is fixed). */
export type FixTab = 'overview' | 'questions' | 'scoring';

/** Where to take the author to fix something: the tab, the question to open first (0-based) and the id of the field to focus. */
export interface FixTarget {
  tab: FixTab;
  questionIndex?: number;
  fieldId: string;
}

/** The number inside `key[...]` in a server path ("questions[2].options[1]" has 2 after "questions" and 1 after "options"), or undefined. */
function indexAfter(path: string, key: string): number | undefined {
  const start = path.indexOf(`${key}[`);
  if (start < 0) return undefined;
  const from = start + key.length + 1;
  const end = path.indexOf(']', from);
  if (end < 0) return undefined;
  const value = Number(path.slice(from, end));
  return Number.isInteger(value) ? value : undefined;
}

/**
 * Where a problem path (the server's own paths, which `checkEditor` also uses) is fixed: its tab, its question and its field. A points problem leads to the points field of the level it names;
 * every other path leads where `fieldIdForPath` already led. null when the path names nothing the editor shows.
 */
export function targetForPath(path: string | undefined): FixTarget | null {
  const fieldId = fieldIdForPath(path);
  if (!path || !fieldId) return null;
  if (path === 'title' || path === 'description') return { tab: 'overview', fieldId };
  if (path.startsWith('scoringConfig')) return { tab: 'scoring', fieldId };
  const questionIndex = path.startsWith('questions[') ? indexAfter(path, 'questions') : undefined;
  const marker = '.scores.';
  const scoresAt = path.indexOf(marker);
  if (questionIndex !== undefined && scoresAt >= 0) {
    const optionIndex = indexAfter(path, 'options');
    const level = LEVELS.find((l) => l === path.slice(scoresAt + marker.length));
    if (optionIndex !== undefined && level) return { tab: 'questions', questionIndex, fieldId: pointsFieldId(questionIndex, optionIndex, level) };
  }
  return { tab: 'questions', questionIndex, fieldId };
}
