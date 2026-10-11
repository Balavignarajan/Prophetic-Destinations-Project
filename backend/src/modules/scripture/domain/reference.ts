import { type BookId, findBook, getBook } from './books.js';

/**
 * Scripture references: parsing and SYNTAX validation only.
 *
 * Supported forms (the confirmed ones):
 *   - a single verse:  `John 3:16`
 *   - a verse range:   `John 3:16-18`   (within one chapter)
 *
 * Not supported, and rejected as malformed: several references in one string (`John 3:16; 4:1`, `John 3:16,18`),
 * a range across chapters (`John 3:16-4:2`), a whole chapter (`John 3`), a book without a chapter, and
 * single-chapter shorthand (`Jude 5`).
 *
 * What this module can and cannot say: it knows the supported book names, and it applies fixed sanity limits to
 * the numbers. It does NOT know how many chapters a book has or how many verses a chapter has, because no
 * authoritative Scripture data set has been approved. So `Obadiah 9:1` or `John 3:99` parse successfully here, and
 * whether the passage really exists is a separate check that needs that data (see `ScriptureFacade`).
 */

/** A parsed reference. For a single verse `startVerse` equals `endVerse`. */
export interface ScriptureReference {
  readonly bookId: BookId;
  readonly chapter: number;
  readonly startVerse: number;
  readonly endVerse: number;
}

/**
 * Sanity limits on the numbers, not statements about any book: no book has more than 150 chapters, and no chapter
 * has more than 176 verses, in the canon. They exist so absurd input (`John 99999999999:1`) is rejected early and
 * cheaply; they do not make smaller numbers valid.
 */
export const MAX_CHAPTER = 150;
export const MAX_VERSE = 176;
/** References longer than this are rejected before any pattern matching. */
export const MAX_REFERENCE_LENGTH = 80;

export type ReferenceErrorCode =
  'EMPTY' | 'MALFORMED' | 'UNKNOWN_BOOK' | 'INVALID_NUMBER' | 'REVERSED_RANGE';

export type ParseResult =
  | { readonly ok: true; readonly reference: ScriptureReference }
  | {
      readonly ok: false;
      readonly code: ReferenceErrorCode;
      readonly message: string;
    };

const fail = (code: ReferenceErrorCode, message: string): ParseResult => ({
  ok: false,
  code,
  message,
});

/**
 * Shape: `<book> <chapter>:<verse>` or `<book> <chapter>:<verse>-<verse>`.
 * Spaces are allowed around the colon and the dash; the dash may be a hyphen-minus or an en dash. The book is
 * everything before the chapter number, so it may contain spaces and a leading number (`1 John`, `Song of Solomon`).
 * The numbers are captured as text so their form (leading zeros, size) can be judged separately.
 */
const SHAPE =
  /^((?:\d\s*)?\p{L}[\p{L}.\s]*?)\s*(\d+)\s*:\s*(\d+)(?:\s*[-–]\s*(\d+))?$/u;

/**
 * Parses the text of a reference. Order of checks: empty, shape, book, numbers (chapter, start, end), range order.
 * The first problem found is reported.
 */
export function parseReference(input: string): ParseResult {
  if (typeof input !== 'string') {
    return fail('MALFORMED', 'A reference must be text');
  }
  const text = input.trim();
  if (text === '') return fail('EMPTY', 'The reference is empty');
  if (text.length > MAX_REFERENCE_LENGTH) {
    return fail(
      'MALFORMED',
      `The reference is longer than ${MAX_REFERENCE_LENGTH} characters`,
    );
  }

  const match = SHAPE.exec(text);
  if (!match) {
    return fail(
      'MALFORMED',
      'Expected a book, a chapter and a verse, like "John 3:16", or a verse range, like "John 3:16-18"',
    );
  }
  const [, bookText, chapterText, startText, endText] = match;

  const book = findBook(bookText);
  if (!book) {
    return fail('UNKNOWN_BOOK', `"${bookText.trim()}" is not a supported book`);
  }

  const chapter = toNumber(chapterText, 'chapter', MAX_CHAPTER);
  if (typeof chapter !== 'number') return chapter;
  const startVerse = toNumber(startText, 'verse', MAX_VERSE);
  if (typeof startVerse !== 'number') return startVerse;
  const endVerse =
    endText === undefined ? startVerse : toNumber(endText, 'verse', MAX_VERSE);
  if (typeof endVerse !== 'number') return endVerse;

  if (endVerse < startVerse) {
    return fail(
      'REVERSED_RANGE',
      `The range ends (${endVerse}) before it starts (${startVerse})`,
    );
  }
  return {
    ok: true,
    reference: { bookId: book.id, chapter, startVerse, endVerse },
  };
}

/** A whole positive number written in plain digits, with no leading zero, up to `max`; otherwise a failure. */
function toNumber(
  text: string,
  what: 'chapter' | 'verse',
  max: number,
): number | ParseResult {
  if (text.length > 1 && text.startsWith('0')) {
    return fail(
      'INVALID_NUMBER',
      `The ${what} number must not have leading zeros`,
    );
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 1) {
    return fail('INVALID_NUMBER', `The ${what} number must be 1 or more`);
  }
  if (value > max) {
    return fail(
      'INVALID_NUMBER',
      `The ${what} number must not be greater than ${max}`,
    );
  }
  return value;
}

/** The canonical written form, e.g. `John 3:16` or `1 John 3:16-18`. */
export function formatReference(reference: ScriptureReference): string {
  const name = getBook(reference.bookId).name;
  const verses =
    reference.startVerse === reference.endVerse
      ? `${reference.startVerse}`
      : `${reference.startVerse}-${reference.endVerse}`;
  return `${name} ${reference.chapter}:${verses}`;
}
