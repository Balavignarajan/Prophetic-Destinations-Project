import { BUNDLED_SCRIPTURE, type ScriptureDataset, type ScriptureReference } from './scripture-data';

/**
 * Local, offline Scripture lookup over the bundled data set (see scripture-data.ts). Pure and synchronous: no network, no cache of
 * opened lessons. Without a data set every answer is "unavailable" with an explicit reason; nothing is guessed or substituted, and a
 * reference is never reported as valid just because it is well formed.
 */
export type ScriptureAvailability =
  | { available: true; translation: string; edition: string; version: string }
  | { available: false; reason: 'NO_DATASET_BUNDLED'; message: string };

export function getScriptureAvailability(dataset: ScriptureDataset | null = BUNDLED_SCRIPTURE): ScriptureAvailability {
  if (!dataset) {
    return {
      available: false,
      reason: 'NO_DATASET_BUNDLED',
      message: 'The Bible text is not included in this version of the app yet.',
    };
  }
  const { translation, edition, version } = dataset.metadata;
  return { available: true, translation, edition, version };
}

export type PassageLookup =
  | { ok: true; verses: { verse: number; text: string }[]; translation: string; edition: string; version: string }
  | { ok: false; reason: 'NO_DATASET_BUNDLED' | 'UNKNOWN_BOOK' | 'NO_SUCH_CHAPTER' | 'NO_SUCH_VERSE'; message: string };

export function lookupPassage(reference: ScriptureReference, dataset: ScriptureDataset | null = BUNDLED_SCRIPTURE): PassageLookup {
  if (!dataset) return { ok: false, reason: 'NO_DATASET_BUNDLED', message: 'The Bible text is not included in this version of the app yet.' };
  const book = dataset.books[reference.bookId];
  if (!book) return { ok: false, reason: 'UNKNOWN_BOOK', message: 'This book is not in the Bible text.' };
  const chapter = book[reference.chapter - 1];
  if (!chapter) return { ok: false, reason: 'NO_SUCH_CHAPTER', message: `This book has no chapter ${reference.chapter}.` };
  if (reference.startVerse < 1 || reference.endVerse < reference.startVerse || reference.endVerse > chapter.length) {
    return { ok: false, reason: 'NO_SUCH_VERSE', message: `This chapter has ${chapter.length} verses.` };
  }
  const verses: { verse: number; text: string }[] = [];
  for (let verse = reference.startVerse; verse <= reference.endVerse; verse += 1) verses.push({ verse, text: chapter[verse - 1] });
  const { translation, edition, version } = dataset.metadata;
  return { ok: true, verses, translation, edition, version };
}
