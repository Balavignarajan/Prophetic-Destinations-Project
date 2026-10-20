/**
 * The offline Scripture data set, as the app sees it.
 *
 * STATUS: NO DATA SET IS BUNDLED. The KJV source and its licence are not approved (see backend/docs/scripture-source-research.md), so
 * the repository holds no Bible text and no verse counts, and this file does not invent any. `BUNDLED_SCRIPTURE` is therefore null and
 * every lookup answers "unavailable" explicitly. Nothing here is a second Scripture model: the shapes below are the backend's
 * reference identity and data contract (backend/src/modules/scripture/domain/dataset.ts and reference.ts) unchanged.
 *
 * WHY BUNDLED: the full text must be readable offline whichever lessons have been opened. Caching the passages of opened lessons would
 * leave every other passage unreadable offline, so the whole set ships inside the app (or is downloaded once as a whole, which is a
 * separate decision) and is read from local storage only.
 *
 * LATER MANUAL VERIFICATION (documented only; nothing is created in this change): use a contract-valid, NON-production data set kept OUTSIDE the
 * repository and the shipped app, with all 66 OSIS book ids (Gen ... Rev, as in features/scripture/books.ts) so it passes the backend's
 * `parseDataset` unchanged. Connect it only on a developer's machine by the same one-line change as below, and do not commit it, bundle it in a
 * release build, or loosen any production completeness or provenance check to accept a partial file. Fake Bible text must never ship in the app.
 *
 * HOW THE APPROVED DATA SET IS CONNECTED (once one exists):
 *   1. Convert it to the backend's format ({ metadata, books: { Gen: [[verses of ch.1], [ch.2], ...], ... } }) and run it through the
 *      backend's `parseDataset` check, which also enforces the totals the file declares.
 *   2. Place the converted file in this folder (for example `kjv.json`) WITHOUT editing any verse text.
 *      (The mobile loader does NOT verify `metadata.checksum`: a declared checksum is a label. The text's real identity is computed from the verses on
 *      demand in dataset-identity.ts, with the backend's fingerprint format, and only that computed value is called verified.)
 *   3. Replace `null` below by `require('./kjv.json') as ScriptureDataset`. Nothing else changes: `lookupPassage` and the availability
 *      state start working, and the Bible reader and Scripture blocks can use them.
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
}

export const BUNDLED_SCRIPTURE: ScriptureDataset | null = null;
