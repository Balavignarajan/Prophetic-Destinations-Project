import { KJV_BOOK_LOADERS, KJV_CHAPTER_COUNTS, KJV_METADATA } from './data/kjv.generated';

/**
 * The offline Scripture data set, as the app sees it.
 *
 * STATUS: a community-maintained KJV transcription (Bible-kjv-master, MIT licence) is bundled, converted UNCHANGED by backend/scripts/convert-kjv.mjs. It is NOT
 * approved for release: its wording has not been verified against a printed edition, and the licence/UK position of the KJV text and the attribution wording are
 * still open (see backend/docs/scripture-source-research.md). Its edition is not stated by the source, so none is claimed. Nothing here edits, completes or
 * corrects any verse. Nothing here is a second Scripture model: the shapes below are the backend's reference identity and data contract
 * (backend/src/modules/scripture/domain/dataset.ts and reference.ts) unchanged.
 *
 * WHY BUNDLED: the full text must be readable offline whichever lessons have been opened, and without the backend. Caching the passages of opened lessons would
 * leave every other passage unreadable offline, so the whole set ships inside the app and is read from the app bundle only (no network, no storage, no cache).
 *
 * LAZY BY BOOK: the text is one JSON file per book (data/books). `books[bookId]` is a getter that reads that file the first time it is used, so opening one
 * chapter loads one book, not all 31,102 verses. Navigation (the book and chapter lists) never needs a book: it reads `chapterCounts`, generated from the same
 * source. Only confirming the text's identity (dataset-identity.ts) reads every book, once, and only when a lesson passage is opened in the Bible.
 *
 * HOW IT IS UPDATED: change nothing here by hand. Run `npm run scripture:convert` in backend/ (it also regenerates backend/data/kjv.json), so the backend and the
 * app always hold the same text and therefore the same fingerprint. The bundled text is not kept in step with lessons: a published lesson keeps its own frozen
 * passages, and the Bible reader says when its text differs from the lesson's.
 */
export type BookId = string;

/** A passage's stable identity: OSIS book id, and an explicit verse range within one chapter. Display text is derived, never stored. */
export interface ScriptureReference {
  bookId: BookId;
  chapter: number;
  startVerse: number;
  endVerse: number;
}

export interface ScriptureDataset {
  metadata: { id: string; translation: string; edition: string; version: string; source: string; checksum: string | null };
  /** books[bookId][chapter - 1][verse - 1] = verse text, exactly as supplied. */
  books: Readonly<Record<BookId, readonly (readonly string[])[]>>;
  /**
   * How many chapters each book has, when that is known without reading the books (the bundled set). The book and chapter lists use it so that listing the Bible
   * does not load any text. A data set without it (as the contract's file has none) is read directly.
   */
  chapterCounts?: Readonly<Record<BookId, number>>;
}

/** Each book's getter reads its file once (Metro keeps the loaded module); the keys are listed without loading anything. */
function lazyBooks(): Record<BookId, readonly (readonly string[])[]> {
  const books: Record<BookId, readonly (readonly string[])[]> = {};
  for (const [id, load] of Object.entries(KJV_BOOK_LOADERS)) {
    Object.defineProperty(books, id, { enumerable: true, get: load });
  }
  return books;
}

export const BUNDLED_SCRIPTURE: ScriptureDataset | null = {
  metadata: {
    id: KJV_METADATA.id,
    translation: KJV_METADATA.translation,
    edition: KJV_METADATA.edition,
    version: KJV_METADATA.version,
    source: KJV_METADATA.source,
    checksum: KJV_METADATA.checksum,
  },
  books: lazyBooks(),
  chapterCounts: KJV_CHAPTER_COUNTS,
};

/** What a reader of the bundled text is told about it: its review status, its attribution and the full licence notice that must accompany it. */
export const BUNDLED_SCRIPTURE_NOTICE = {
  review: 'A community-maintained transcription of the King James Version. Its wording has not yet been verified against a printed edition.',
  attribution: `Bible text: Bible-kjv-master. ${KJV_METADATA.license.copyright}. ${KJV_METADATA.license.name}.`,
  licenseText: KJV_METADATA.license.notice.trim(),
} as const;
