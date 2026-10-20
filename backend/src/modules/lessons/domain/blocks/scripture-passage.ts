import { type ContentProblem, isMarkupLikeKey } from './rich-text.js';

/**
 * SCRIPTURE_PASSAGE content contract (feature register BLK-004: a passage shown from the canonical Scripture text).
 *
 * PROPOSED, NOT APPROVED. The workbook lists the component but the repository holds no field-level schema for it, so this is the
 * minimum that works and is meant to be revised:
 *
 *   { "reference": { "bookId": "John", "chapter": 3, "startVerse": 16, "endVerse": 18 },
 *     "commentary": "optional author text, shown separately from the Scripture",
 *     "dataset": { "id": "kjv", "version": "...", "fingerprint": "<sha-256 of the text>" }   // SET BY THE SERVER, see below
 *   }
 *
 *  - `reference` is the shared structured reference (scripture/domain/reference.ts): OSIS book id and an explicit verse range within ONE
 *    chapter. The block NEVER stores Bible text: the text is looked up from the installed Scripture data set when the lesson is published
 *    and frozen into the lesson snapshot together with the reference and the data set identity (see ScriptureEmbedService).
 *  - `dataset` records which data set (id + version) the reference was verified against when the block was saved. Clients cannot set it.
 *    If the installed data set differs at publication, the lesson is not ready until the block is saved again (which also takes the
 *    lesson back to Draft, so a changed text is approved again before it is published).
 *  - Ranges across chapters, whole chapters and comma lists are not supported (unresolved product decision). No level variants.
 * A draft may have no reference yet; publishing requires a reference that the installed data set confirms exists.
 */
export const SCRIPTURE_PASSAGE_LIMITS = { maxCommentaryLength: 2000, maxBookIdLength: 10 } as const;

const ALLOWED_KEYS = ['reference', 'commentary', 'dataset'] as const;
const REFERENCE_KEYS = ['bookId', 'chapter', 'startVerse', 'endVerse'] as const;
const BOOK_ID = /^[1-3]?[A-Za-z]+$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const whole = (value: unknown, max: number) => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max;

export function validateScripturePassageShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: 'Scripture passage content must be an object' }];
  const problems: ContentProblem[] = [];
  for (const key of Object.keys(content)) {
    if (isMarkupLikeKey(key)) problems.push({ path: key, message: `Markup-like key "${key}" is not allowed` });
    else if (!(ALLOWED_KEYS as readonly string[]).includes(key)) problems.push({ path: key, message: `Unknown key "${key}"` });
  }
  if (content.commentary !== undefined) {
    const c = content.commentary;
    if (typeof c !== 'string') problems.push({ path: 'commentary', message: 'The commentary must be text' });
    else if (c.length > SCRIPTURE_PASSAGE_LIMITS.maxCommentaryLength) {
      problems.push({ path: 'commentary', message: `The commentary must be at most ${SCRIPTURE_PASSAGE_LIMITS.maxCommentaryLength} characters` });
    } else if (c.includes('\u0000')) problems.push({ path: 'commentary', message: 'The commentary must not contain NUL characters' });
  }
  if (content.dataset !== undefined) {
    const d = content.dataset;
    if (!isPlainObject(d) || typeof d.id !== 'string' || typeof d.version !== 'string' || (d.fingerprint !== undefined && typeof d.fingerprint !== 'string') || Object.keys(d).some((k) => !['id', 'version', 'fingerprint'].includes(k))) {
      problems.push({ path: 'dataset', message: 'dataset must be { id, version, fingerprint }' });
    }
  }
  const ref = content.reference;
  if (ref === undefined) return problems;
  if (!isPlainObject(ref)) {
    problems.push({ path: 'reference', message: 'reference must be an object' });
    return problems;
  }
  for (const key of Object.keys(ref)) {
    if (!(REFERENCE_KEYS as readonly string[]).includes(key)) problems.push({ path: `reference.${key}`, message: `Unknown key "reference.${key}"` });
  }
  if (typeof ref.bookId !== 'string' || ref.bookId.length > SCRIPTURE_PASSAGE_LIMITS.maxBookIdLength || !BOOK_ID.test(ref.bookId)) {
    problems.push({ path: 'reference.bookId', message: 'The book must be a book id such as "John" or "1Sam"' });
  }
  if (!whole(ref.chapter, 150)) problems.push({ path: 'reference.chapter', message: 'The chapter must be a whole number from 1 to 150' });
  if (!whole(ref.startVerse, 176)) problems.push({ path: 'reference.startVerse', message: 'The first verse must be a whole number from 1 to 176' });
  if (!whole(ref.endVerse, 176)) problems.push({ path: 'reference.endVerse', message: 'The last verse must be a whole number from 1 to 176' });
  if (whole(ref.startVerse, 176) && whole(ref.endVerse, 176) && (ref.endVerse as number) < (ref.startVerse as number)) {
    problems.push({ path: 'reference', message: 'The last verse comes before the first verse' });
  }
  return problems;
}

/** What publishing needs from the block itself (the passage is checked against the data set separately). */
export function validateScripturePassageComplete(content: unknown): ContentProblem[] {
  if (!isPlainObject(content) || !isPlainObject(content.reference)) {
    return [{ path: 'reference', message: 'Choose a Scripture passage for this block before publishing' }];
  }
  return [];
}

export interface PassageRef {
  bookId: string;
  chapter: number;
  startVerse: number;
  endVerse: number;
}

/** The stored reference, or null when absent or malformed. */
export function passageReferenceOf(content: unknown): PassageRef | null {
  if (!isPlainObject(content) || !isPlainObject(content.reference)) return null;
  const r = content.reference;
  if (typeof r.bookId !== 'string' || !whole(r.chapter, 150) || !whole(r.startVerse, 176) || !whole(r.endVerse, 176)) return null;
  return { bookId: r.bookId, chapter: r.chapter as number, startVerse: r.startVerse as number, endVerse: r.endVerse as number };
}

export function sameReference(a: PassageRef | null, b: PassageRef | null): boolean {
  return a !== null && b !== null && a.bookId === b.bookId && a.chapter === b.chapter && a.startVerse === b.startVerse && a.endVerse === b.endVerse;
}

/** The data set stamp the server recorded, or null. */
export function datasetStampOf(content: unknown): { id: string; version: string; fingerprint: string | null } | null {
  return stampOf(isPlainObject(content) ? content.dataset : undefined);
}

/** A stamp object { id, version, fingerprint? }; an older stamp has no fingerprint (null) and is never treated as verified. */
export function stampOf(value: unknown): { id: string; version: string; fingerprint: string | null } | null {
  if (!isPlainObject(value)) return null;
  return typeof value.id === 'string' && typeof value.version === 'string'
    ? { id: value.id, version: value.version, fingerprint: typeof value.fingerprint === 'string' ? value.fingerprint : null }
    : null;
}
