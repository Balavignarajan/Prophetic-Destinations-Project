import type { BookId } from './scripture-data';

/**
 * Display names of the 66 books of the Protestant canon, in canonical order, keyed by the SAME OSIS identifiers the backend and the data set
 * contract use (backend/src/modules/scripture/domain/books.ts). Naming metadata only: no Bible text and no chapter or verse counts (those come
 * from the data set, never from here). KNOWN DUPLICATION: this list mirrors the backend's; there is no shared package. A book is offered to a
 * reader only if the data set actually contains it (see bible-navigation.ts), so this list never makes a book selectable by itself.
 */
export const BOOK_NAMES: readonly (readonly [BookId, string])[] = [
  ['Gen', 'Genesis'],
  ['Exod', 'Exodus'],
  ['Lev', 'Leviticus'],
  ['Num', 'Numbers'],
  ['Deut', 'Deuteronomy'],
  ['Josh', 'Joshua'],
  ['Judg', 'Judges'],
  ['Ruth', 'Ruth'],
  ['1Sam', '1 Samuel'],
  ['2Sam', '2 Samuel'],
  ['1Kgs', '1 Kings'],
  ['2Kgs', '2 Kings'],
  ['1Chr', '1 Chronicles'],
  ['2Chr', '2 Chronicles'],
  ['Ezra', 'Ezra'],
  ['Neh', 'Nehemiah'],
  ['Esth', 'Esther'],
  ['Job', 'Job'],
  ['Ps', 'Psalms'],
  ['Prov', 'Proverbs'],
  ['Eccl', 'Ecclesiastes'],
  ['Song', 'Song of Solomon'],
  ['Isa', 'Isaiah'],
  ['Jer', 'Jeremiah'],
  ['Lam', 'Lamentations'],
  ['Ezek', 'Ezekiel'],
  ['Dan', 'Daniel'],
  ['Hos', 'Hosea'],
  ['Joel', 'Joel'],
  ['Amos', 'Amos'],
  ['Obad', 'Obadiah'],
  ['Jonah', 'Jonah'],
  ['Mic', 'Micah'],
  ['Nah', 'Nahum'],
  ['Hab', 'Habakkuk'],
  ['Zeph', 'Zephaniah'],
  ['Hag', 'Haggai'],
  ['Zech', 'Zechariah'],
  ['Mal', 'Malachi'],
  ['Matt', 'Matthew'],
  ['Mark', 'Mark'],
  ['Luke', 'Luke'],
  ['John', 'John'],
  ['Acts', 'Acts'],
  ['Rom', 'Romans'],
  ['1Cor', '1 Corinthians'],
  ['2Cor', '2 Corinthians'],
  ['Gal', 'Galatians'],
  ['Eph', 'Ephesians'],
  ['Phil', 'Philippians'],
  ['Col', 'Colossians'],
  ['1Thess', '1 Thessalonians'],
  ['2Thess', '2 Thessalonians'],
  ['1Tim', '1 Timothy'],
  ['2Tim', '2 Timothy'],
  ['Titus', 'Titus'],
  ['Phlm', 'Philemon'],
  ['Heb', 'Hebrews'],
  ['Jas', 'James'],
  ['1Pet', '1 Peter'],
  ['2Pet', '2 Peter'],
  ['1John', '1 John'],
  ['2John', '2 John'],
  ['3John', '3 John'],
  ['Jude', 'Jude'],
  ['Rev', 'Revelation'],
];

const NAMES = new Map<string, string>(BOOK_NAMES);

/** The display name of a book, or the identifier itself if it is not a canonical book (never a guess). */
export function bookName(bookId: string): string {
  return NAMES.get(bookId) ?? bookId;
}
