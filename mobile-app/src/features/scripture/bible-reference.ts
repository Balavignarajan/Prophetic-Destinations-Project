import { findBibleBook, readChapter } from './bible-navigation';
import { findBookByName, suggestBooks } from './books';
import { BUNDLED_SCRIPTURE, type BookId, type ScriptureDataset } from './scripture-data';

/**
 * Reading a typed Scripture reference for the Bible search: `John 3:16`, `Daniel 2`, `Psalm 23`, `1 Corinthians 13:4`, `Rev 22:21`, `John 3:16-18`. Pure and synchronous.
 *
 * BOOKS: a name is accepted only if it is a canonical name, an identifier or one of the backend's accepted abbreviations (books.ts mirrors the backend's table), so a
 * reference means the same book here, in the CMS and on the server. A name that is not one of those is NEVER resolved: when it could mean several books (`Jud`: Judges or
 * Jude) or looks like one, the reader is told which and asked to write the full name, and nothing is opened.
 *
 * SYNTAX: a book, a chapter, and optionally one verse or a verse range inside that chapter. The chapter and verse may be separated by a colon, a full stop or a comma, with or
 * without spaces; a range may use a hyphen or a dash. A range across chapters (`John 3:16-4:2`), several references in one text and a book written without its chapter number
 * as a verse (`Jude 5`) are not supported and say so. Nothing is invented from prose: text that does not read as a reference is simply searched for as words.
 *
 * BOUNDS: whether the chapter and verses exist is checked against the Bible text that is bundled (its own chapter counts and verses), never against remembered numbers.
 */
export type ReferenceAttempt =
  /** Not a reference: search the text for these words. */
  | { kind: 'none' }
  /** Just a book's name. */
  | { kind: 'book'; bookId: BookId; name: string }
  /** A book, a chapter and optionally verses (null = the whole chapter). Not yet checked against the Bible text. */
  | { kind: 'reference'; bookId: BookId; name: string; chapter: number; startVerse: number | null; endVerse: number | null }
  /** Written like a reference but not one that can be opened; `message` says why. */
  | { kind: 'invalid'; message: string };

const MAX_LENGTH = 80;
/**
 * `<book> <chapter>`, optionally followed by a verse (after a colon, full stop, comma or just a space) and `-<verse>`. The book is everything before the chapter number
 * (it may hold spaces, dots and a leading 1-3).
 */
const SHAPE = /^((?:[1-3]\s*)?[a-z][a-z.\s]*?)\s*(\d{1,3})(?:(?:\s*[:.,]\s*|\s+)(\d{1,3})(?:\s*-\s*(\d{1,3}))?)?$/i;
/** The start of a reference written some other way (a list, a second chapter): a book name and then a number. */
const BOOK_THEN_NUMBER = /^((?:[1-3]\s*)?[a-z][a-z.\s]*?)\s*\d/i;
const ACROSS_CHAPTERS = /-\s*\d+\s*[:.]\s*\d+\s*$/;

const quoted = (text: string) => `“${text.trim()}”`;

function unknownBook(typed: string, strict: boolean): ReferenceAttempt {
  const guesses = suggestBooks(typed);
  if (guesses.length > 1) {
    const names = guesses.map((book) => book.name);
    return { kind: 'invalid', message: `${quoted(typed)} could mean ${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}. Write the book's full name.` };
  }
  if (guesses.length === 1) return { kind: 'invalid', message: `${quoted(typed)} is not a book name the search recognises. Did you mean ${guesses[0].name}? Write its full name.` };
  // No book starts like this: with a verse (a colon) it was meant as a reference, otherwise it is probably just words.
  return strict ? { kind: 'invalid', message: `${quoted(typed)} is not a book of the Bible.` } : { kind: 'none' };
}

export function parseBibleReference(raw: string): ReferenceAttempt {
  const text = raw.trim().replace(/[‒–—―−]/g, '-').replace(/\s+/g, ' ');
  if (text === '' || text.length > MAX_LENGTH) return { kind: 'none' };

  const wholeBook = findBookByName(text);
  if (wholeBook) return { kind: 'book', bookId: wholeBook.id, name: wholeBook.name };

  if (ACROSS_CHAPTERS.test(text) && BOOK_THEN_NUMBER.test(text)) {
    return { kind: 'invalid', message: 'A range across chapters is not supported. Search one chapter at a time, for example John 3:16-18.' };
  }

  const match = SHAPE.exec(text);
  if (!match) {
    const start = BOOK_THEN_NUMBER.exec(text);
    if (start && findBookByName(start[1])) return { kind: 'invalid', message: 'Search one reference at a time, such as John 3:16, John 3:16-18 or Daniel 2.' };
    return { kind: 'none' };
  }
  const [, bookText, chapterText, startText, endText] = match;
  const book = findBookByName(bookText);
  if (!book) return unknownBook(bookText, startText !== undefined);

  const chapter = Number(chapterText);
  const startVerse = startText === undefined ? null : Number(startText);
  const endVerse = startVerse === null ? null : endText === undefined ? startVerse : Number(endText);
  if (chapter < 1) return { kind: 'invalid', message: 'Chapters start at 1.' };
  if (startVerse !== null && (startVerse < 1 || (endVerse !== null && endVerse < 1))) return { kind: 'invalid', message: 'Verses start at 1.' };
  if (startVerse !== null && endVerse !== null && endVerse < startVerse) return { kind: 'invalid', message: `The range ends (${endVerse}) before it starts (${startVerse}).` };
  return { kind: 'reference', bookId: book.id, name: book.name, chapter, startVerse, endVerse };
}

export type ReferenceCheck =
  | { ok: true; bookId: BookId; chapter: number; startVerse: number | null; endVerse: number | null; label: string }
  | { ok: false; message: string };

const plural = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`;

/** Whether a parsed reference exists in the Bible text, and how to name it; otherwise what is wrong, in words (never a wrong book, chapter or verse). */
export function checkBibleReference(
  reference: Extract<ReferenceAttempt, { kind: 'reference' }>,
  dataset: ScriptureDataset | null = BUNDLED_SCRIPTURE,
): ReferenceCheck {
  const book = findBibleBook(reference.bookId, dataset);
  if (!book) return { ok: false, message: `${reference.name} is not in the Bible text.` };
  const { chapter, startVerse, endVerse } = reference;
  if (chapter > book.chapters) {
    if (book.chapters === 1 && startVerse === null) return { ok: false, message: `${book.name} has only 1 chapter. To open verse ${chapter} write ${book.name} 1:${chapter}.` };
    return { ok: false, message: `${book.name} has ${book.chapters === 1 ? 'only 1 chapter' : `${book.chapters} chapters`}.` };
  }
  if (startVerse === null || endVerse === null) return { ok: true, bookId: book.id, chapter, startVerse: null, endVerse: null, label: `${book.name} ${chapter}` };

  const text = readChapter(book.id, chapter, dataset);
  if (!text) return { ok: false, message: `${book.name} ${chapter} is not in the Bible text.` };
  const verses = text.verses.length;
  if (startVerse > verses || endVerse > verses) return { ok: false, message: `${book.name} ${chapter} has ${plural(verses, 'verse')}.` };
  const range = endVerse === startVerse ? `${startVerse}` : `${startVerse}-${endVerse}`;
  return { ok: true, bookId: book.id, chapter, startVerse, endVerse, label: `${book.name} ${chapter}:${range}` };
}
