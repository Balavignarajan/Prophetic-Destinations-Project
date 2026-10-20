import { BOOK_NAMES } from './books';
import { BUNDLED_SCRIPTURE, type BookId, type ScriptureDataset, type ScriptureReference } from './scripture-data';
import { getScriptureAvailability, lookupPassage } from './scripture-lookup';

/**
 * Navigation over the bundled Scripture data set for the Bible reader (book -> chapter -> reading) and for "Open in Bible" from a lesson.
 * Pure and synchronous, built on scripture-data.ts and scripture-lookup.ts (no second Scripture model, no cache, no network). Everything is
 * derived from the data set that is actually bundled: a book is listed only if the data set contains it, chapter counts are the data set's
 * own, and with no data set nothing is listed and nothing is invented.
 */
export const BIBLE_ROUTES = { books: '/bible', chapters: '/bible/book', read: '/bible/read' } as const;

export type BibleBook = { id: BookId; name: string; chapters: number };

/** The books the data set contains, in canonical order. Empty without a data set. */
export function listBibleBooks(dataset: ScriptureDataset | null = BUNDLED_SCRIPTURE): BibleBook[] {
  if (!dataset) return [];
  const out: BibleBook[] = [];
  for (const [id, name] of BOOK_NAMES) {
    const chapters = dataset.books[id];
    if (Array.isArray(chapters) && chapters.length > 0) out.push({ id, name, chapters: chapters.length });
  }
  return out;
}

export function findBibleBook(bookId: string, dataset: ScriptureDataset | null = BUNDLED_SCRIPTURE): BibleBook | null {
  return listBibleBooks(dataset).find((book) => book.id === bookId) ?? null;
}

export type ChapterText = { verses: { verse: number; text: string }[]; translation: string; edition: string; version: string; datasetId: string };

/** A whole chapter, verse texts exactly as supplied; null if the data set lacks it. */
export function readChapter(bookId: string, chapter: number, dataset: ScriptureDataset | null = BUNDLED_SCRIPTURE): ChapterText | null {
  if (!dataset || !Number.isInteger(chapter) || chapter < 1) return null;
  const rows = dataset.books[bookId]?.[chapter - 1];
  if (!rows || rows.length === 0) return null;
  const { translation, edition, version, id } = dataset.metadata;
  return { verses: rows.map((text, index) => ({ verse: index + 1, text })), translation, edition, version, datasetId: id };
}

export type ChapterRef = { bookId: BookId; chapter: number };

/** The previous or next chapter, continuing into the neighbouring book; null at the first or last chapter of the data set. */
export function adjacentChapter(from: ChapterRef, direction: -1 | 1, dataset: ScriptureDataset | null = BUNDLED_SCRIPTURE): ChapterRef | null {
  const books = listBibleBooks(dataset);
  const index = books.findIndex((book) => book.id === from.bookId);
  if (index < 0) return null;
  const target = from.chapter + direction;
  if (target >= 1 && target <= books[index].chapters) return { bookId: from.bookId, chapter: target };
  const neighbour = books[index + direction];
  if (!neighbour) return null;
  return { bookId: neighbour.id, chapter: direction === 1 ? 1 : neighbour.chapters };
}

// ------------------------------------------------------------------------------------------------------------- route parameters

type Param = string | string[] | undefined;
const first = (value: Param) => (Array.isArray(value) ? value[0] : value);
const whole = (value: Param): number | null => {
  const text = first(value);
  return typeof text === 'string' && /^[1-9]\d{0,3}$/.test(text) ? Number(text) : null;
};

/** The published Scripture a reader was opened from, so the reader can say when its own text differs. */
export type PassageSource = { id?: string; version?: string; translation?: string; edition?: string; fingerprint?: string };

/** The reader's route parameters, strictly parsed (strings only; anything malformed gives null). */
export type ReaderParams = { bookId: string; chapter: number; range: { startVerse: number; endVerse: number } | null; source: PassageSource; fromLesson: boolean };

export function parseReaderParams(params: Record<string, Param>): ReaderParams | null {
  const bookId = first(params.bookId);
  const chapter = whole(params.chapter);
  if (typeof bookId !== 'string' || !/^[1-3]?[A-Za-z]{1,10}$/.test(bookId) || chapter === null) return null;
  const start = whole(params.startVerse);
  const end = whole(params.endVerse);
  const range = start !== null && end !== null && end >= start ? { startVerse: start, endVerse: end } : null;
  const text = (value: Param) => {
    const v = first(value);
    return typeof v === 'string' && v.length > 0 && v.length <= 100 ? v : undefined;
  };
  return {
    bookId,
    chapter,
    range,
    source: {
      id: text(params.srcId),
      version: text(params.srcVersion),
      translation: text(params.srcTranslation),
      edition: text(params.srcEdition),
      fingerprint: /^[0-9a-fA-F]{64}$/.test(first(params.srcFingerprint) ?? '') ? first(params.srcFingerprint) : undefined,
    },
    fromLesson: first(params.from) === 'lesson',
  };
}

export type ReaderCheck =
  | { ok: true; chapter: ChapterText; range: { startVerse: number; endVerse: number } | null; rangeNote: string | null }
  | { ok: false; reason: 'NO_DATASET' | 'NOT_FOUND'; message: string };

/** Checks reader parameters against the local data set. An invalid verse range still opens the chapter, with a note. */
export function checkReaderParams(params: ReaderParams, dataset: ScriptureDataset | null = BUNDLED_SCRIPTURE): ReaderCheck {
  const availability = getScriptureAvailability(dataset);
  if (!availability.available) return { ok: false, reason: 'NO_DATASET', message: availability.message };
  const chapter = readChapter(params.bookId, params.chapter, dataset);
  if (!chapter) return { ok: false, reason: 'NOT_FOUND', message: 'That chapter is not in the Bible text.' };
  if (!params.range) return { ok: true, chapter, range: null, rangeNote: null };
  const reference: ScriptureReference = { bookId: params.bookId, chapter: params.chapter, ...params.range };
  const found = lookupPassage(reference, dataset);
  if (!found.ok) return { ok: true, chapter, range: null, rangeNote: `The verses from the lesson could not be marked here. ${found.message}` };
  return { ok: true, chapter, range: params.range, rangeNote: null };
}

/**
 * Do the reader's TRANSLATION and EDITION labels differ from the ones the lesson passage was published with? This is about names only and is shown
 * apart from text identity (dataset-identity.ts), which is decided by the content fingerprint, never by these labels.
 */
export function describeLabelDifference(source: PassageSource, reader: { translation: string; edition: string }): string | null {
  const translationDiffers = Boolean(source.translation) && source.translation !== reader.translation;
  const editionDiffers = Boolean(source.edition) && source.edition !== reader.edition;
  if (!translationDiffers && !editionDiffers) return null;
  const published = [source.translation, source.edition].filter(Boolean).join(', ');
  return `This reader uses ${reader.translation}, ${reader.edition}. The lesson passage was published as ${published}. The translation or edition is not the same.`;
}

// ---------------------------------------------------------------------------------------------------------------------- hrefs

/** Route (with string params) that opens a chapter, optionally marking a verse range and recording the published source. */
export function bibleReadHref(reference: ScriptureReference, source?: PassageSource) {
  return {
    pathname: BIBLE_ROUTES.read,
    params: {
      bookId: reference.bookId,
      chapter: String(reference.chapter),
      startVerse: String(reference.startVerse),
      endVerse: String(reference.endVerse),
      from: 'lesson',
      ...(source?.id ? { srcId: source.id } : {}),
      ...(source?.version ? { srcVersion: source.version } : {}),
      ...(source?.translation ? { srcTranslation: source.translation } : {}),
      ...(source?.edition ? { srcEdition: source.edition } : {}),
      ...(source?.fingerprint ? { srcFingerprint: source.fingerprint } : {}),
    },
  } as const;
}

/** A structured reference read from a frozen passage; null if it is missing or malformed. */
export function referenceFromFrozen(value: unknown): ScriptureReference | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  const whole1 = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 1;
  if (typeof r.bookId !== 'string' || !whole1(r.chapter) || !whole1(r.startVerse) || !whole1(r.endVerse) || (r.endVerse as number) < (r.startVerse as number)) return null;
  return { bookId: r.bookId, chapter: r.chapter as number, startVerse: r.startVerse as number, endVerse: r.endVerse as number };
}
