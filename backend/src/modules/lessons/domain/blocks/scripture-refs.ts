import type { ContentProblem } from './rich-text.js';
import { stampOf } from './scripture-passage.js';

/**
 * Scripture references attached to an ITEM of another block (a timeline event or an image hotspot). PROPOSED, NOT APPROVED:
 *
 *   "scripture": [ { "reference": { "bookId": "Dan", "chapter": 2, "startVerse": 31, "endVerse": 35 },
 *                    "dataset": { "id", "version", "fingerprint" },   // SET BY THE SERVER only
 *                    "refresh": true                                    // INPUT only: asks the server to re-verify against the installed text
 *                  }, ... ]                                             // up to MAX_REFS_PER_ITEM, in the author's order
 *
 * The same structured reference as the SCRIPTURE_PASSAGE block (one chapter, explicit verse range); never Bible text. In a published
 * snapshot each entry is replaced by the frozen passage { reference, display, source, verses } (see ScriptureEmbedService).
 * Items keep their own ids and order; nothing here touches per-item level rules (D4 stays open).
 */
export const MAX_REFS_PER_ITEM = 5;

const REFERENCE_KEYS = ['bookId', 'chapter', 'startVerse', 'endVerse'] as const;
const ENTRY_KEYS = ['reference', 'dataset', 'refresh'] as const;
const BOOK_ID = /^[1-3]?[A-Za-z]+$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const whole = (value: unknown, max: number) => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max;

export interface ItemReference {
  bookId: string;
  chapter: number;
  startVerse: number;
  endVerse: number;
}

/** Shape check of the `scripture` list of one item; `label` names the item in messages ("Event 2"). */
export function validateScriptureEntries(value: unknown, path: string, label: string, problems: ContentProblem[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    problems.push({ path, message: `${label}: scripture must be a list of passages` });
    return;
  }
  if (value.length > MAX_REFS_PER_ITEM) problems.push({ path, message: `${label}: at most ${MAX_REFS_PER_ITEM} Scripture passages are allowed` });
  value.slice(0, MAX_REFS_PER_ITEM).forEach((entry, index) => {
    const at = `${path}[${index}]`;
    const n = `${label}, passage ${index + 1}`;
    if (!isPlainObject(entry)) {
      problems.push({ path: at, message: `${n} must be an object` });
      return;
    }
    for (const key of Object.keys(entry)) {
      if (!(ENTRY_KEYS as readonly string[]).includes(key)) problems.push({ path: `${at}.${key}`, message: `${n}: unknown key "${key}"` });
    }
    if (entry.refresh !== undefined && typeof entry.refresh !== 'boolean') problems.push({ path: `${at}.refresh`, message: `${n}: refresh must be true or false` });
    if (entry.dataset !== undefined && stampOf(entry.dataset) === null) problems.push({ path: `${at}.dataset`, message: `${n}: dataset must be { id, version, fingerprint }` });
    const ref = entry.reference;
    if (!isPlainObject(ref)) {
      problems.push({ path: `${at}.reference`, message: `${n} needs a reference` });
      return;
    }
    for (const key of Object.keys(ref)) {
      if (!(REFERENCE_KEYS as readonly string[]).includes(key)) problems.push({ path: `${at}.reference.${key}`, message: `${n}: unknown key "${key}"` });
    }
    if (typeof ref.bookId !== 'string' || ref.bookId.length > 10 || !BOOK_ID.test(ref.bookId)) problems.push({ path: `${at}.reference.bookId`, message: `${n}: the book must be a book id such as "John"` });
    if (!whole(ref.chapter, 150)) problems.push({ path: `${at}.reference.chapter`, message: `${n}: the chapter must be a whole number from 1 to 150` });
    if (!whole(ref.startVerse, 176) || !whole(ref.endVerse, 176)) problems.push({ path: `${at}.reference.startVerse`, message: `${n}: verses must be whole numbers from 1 to 176` });
    else if ((ref.endVerse as number) < (ref.startVerse as number)) problems.push({ path: `${at}.reference`, message: `${n}: the last verse comes before the first verse` });
  });
}

export function itemReferenceOf(entry: unknown): ItemReference | null {
  if (!isPlainObject(entry) || !isPlainObject(entry.reference)) return null;
  const r = entry.reference;
  if (typeof r.bookId !== 'string' || !whole(r.chapter, 150) || !whole(r.startVerse, 176) || !whole(r.endVerse, 176)) return null;
  return { bookId: r.bookId, chapter: r.chapter as number, startVerse: r.startVerse as number, endVerse: r.endVerse as number };
}

export function sameItemReference(a: ItemReference | null, b: ItemReference | null): boolean {
  return a !== null && b !== null && a.bookId === b.bookId && a.chapter === b.chapter && a.startVerse === b.startVerse && a.endVerse === b.endVerse;
}
