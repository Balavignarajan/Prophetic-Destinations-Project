/**
 * The books of the 66-book Protestant canon: identifier, canonical order, display name and accepted aliases.
 *
 * This is naming metadata only. It contains no Bible text and no chapter or verse counts.
 *
 * Identifier convention: the OSIS book abbreviations (the published OSIS 2.x standard, e.g. `Gen`, `1Sam`, `Song`,
 * `Phlm`). They are an open, widely used standard, they are what Bible data sets and tools key books by, and they
 * do not depend on any one data set, so adopting them now does not tie the project to a source that has not been
 * approved yet. `order` is the position in the canonical Protestant order (1 = Genesis ... 66 = Revelation).
 * Whether the confirmed KJV edition includes more books (the Apocrypha) is not confirmed; this list does not.
 *
 * Aliases are matched case-insensitively, ignoring periods and spaces (see `normalizeBookName`), so `1 Sam`,
 * `1 sam.` and `1Sam` are one alias. An abbreviation that two books share is deliberately absent (for example
 * `Jud`, which could be Judges or Jude): an ambiguous name is rejected rather than guessed.
 */
export const BOOK_IDS = [
  'Gen',
  'Exod',
  'Lev',
  'Num',
  'Deut',
  'Josh',
  'Judg',
  'Ruth',
  '1Sam',
  '2Sam',
  '1Kgs',
  '2Kgs',
  '1Chr',
  '2Chr',
  'Ezra',
  'Neh',
  'Esth',
  'Job',
  'Ps',
  'Prov',
  'Eccl',
  'Song',
  'Isa',
  'Jer',
  'Lam',
  'Ezek',
  'Dan',
  'Hos',
  'Joel',
  'Amos',
  'Obad',
  'Jonah',
  'Mic',
  'Nah',
  'Hab',
  'Zeph',
  'Hag',
  'Zech',
  'Mal',
  'Matt',
  'Mark',
  'Luke',
  'John',
  'Acts',
  'Rom',
  '1Cor',
  '2Cor',
  'Gal',
  'Eph',
  'Phil',
  'Col',
  '1Thess',
  '2Thess',
  '1Tim',
  '2Tim',
  'Titus',
  'Phlm',
  'Heb',
  'Jas',
  '1Pet',
  '2Pet',
  '1John',
  '2John',
  '3John',
  'Jude',
  'Rev',
] as const;

export type BookId = (typeof BOOK_IDS)[number];

export interface BookInfo {
  /** OSIS identifier. */
  readonly id: BookId;
  /** 1-based position in the canonical Protestant order. */
  readonly order: number;
  /** The name used when a reference is written out in full. */
  readonly name: string;
  /** Extra accepted spellings; the display name and the identifier are always accepted too. */
  readonly aliases: readonly string[];
}

const BOOK_DEFINITIONS: readonly [BookId, string, readonly string[]][] = [
  ['Gen', 'Genesis', ['Gn']],
  ['Exod', 'Exodus', ['Ex', 'Exo']],
  ['Lev', 'Leviticus', ['Lv']],
  ['Num', 'Numbers', ['Nm', 'Nu']],
  ['Deut', 'Deuteronomy', ['Dt', 'Deu']],
  ['Josh', 'Joshua', ['Jos', 'Jsh']],
  ['Judg', 'Judges', ['Jdg', 'Jg']],
  ['Ruth', 'Ruth', ['Rth', 'Ru']],
  ['1Sam', '1 Samuel', ['1 Sa', '1 Sm']],
  ['2Sam', '2 Samuel', ['2 Sa', '2 Sm']],
  ['1Kgs', '1 Kings', ['1 Ki', '1 Kg']],
  ['2Kgs', '2 Kings', ['2 Ki', '2 Kg']],
  ['1Chr', '1 Chronicles', ['1 Ch', '1 Chron']],
  ['2Chr', '2 Chronicles', ['2 Ch', '2 Chron']],
  ['Ezra', 'Ezra', ['Ezr']],
  ['Neh', 'Nehemiah', ['Ne']],
  ['Esth', 'Esther', ['Est', 'Es']],
  ['Job', 'Job', ['Jb']],
  ['Ps', 'Psalms', ['Psalm', 'Psa', 'Pss', 'Psm']],
  ['Prov', 'Proverbs', ['Pro', 'Prv', 'Pr']],
  ['Eccl', 'Ecclesiastes', ['Ecc', 'Eccles', 'Qoh']],
  ['Song', 'Song of Solomon', ['Song of Songs', 'SOS', 'Canticles']],
  ['Isa', 'Isaiah', ['Is']],
  ['Jer', 'Jeremiah', ['Jr']],
  ['Lam', 'Lamentations', ['La']],
  ['Ezek', 'Ezekiel', ['Eze', 'Ezk']],
  ['Dan', 'Daniel', ['Dn', 'Da']],
  ['Hos', 'Hosea', ['Ho']],
  ['Joel', 'Joel', ['Joe', 'Jl']],
  ['Amos', 'Amos', ['Am']],
  ['Obad', 'Obadiah', ['Oba', 'Ob']],
  ['Jonah', 'Jonah', ['Jon', 'Jnh']],
  ['Mic', 'Micah', ['Mi']],
  ['Nah', 'Nahum', ['Na']],
  ['Hab', 'Habakkuk', ['Hb']],
  ['Zeph', 'Zephaniah', ['Zep', 'Zp']],
  ['Hag', 'Haggai', ['Hg']],
  ['Zech', 'Zechariah', ['Zec', 'Zc']],
  ['Mal', 'Malachi', ['Ml']],
  ['Matt', 'Matthew', ['Mt']],
  ['Mark', 'Mark', ['Mrk', 'Mk']],
  ['Luke', 'Luke', ['Luk', 'Lk']],
  ['John', 'John', ['Jhn', 'Jn']],
  ['Acts', 'Acts', ['Act', 'Ac', 'Acts of the Apostles']],
  ['Rom', 'Romans', ['Ro', 'Rm']],
  ['1Cor', '1 Corinthians', ['1 Co']],
  ['2Cor', '2 Corinthians', ['2 Co']],
  ['Gal', 'Galatians', ['Ga']],
  ['Eph', 'Ephesians', ['Ephes']],
  ['Phil', 'Philippians', ['Php']],
  ['Col', 'Colossians', ['Co']],
  ['1Thess', '1 Thessalonians', ['1 Thes', '1 Th']],
  ['2Thess', '2 Thessalonians', ['2 Thes', '2 Th']],
  ['1Tim', '1 Timothy', ['1 Ti']],
  ['2Tim', '2 Timothy', ['2 Ti']],
  ['Titus', 'Titus', ['Tit', 'Ti']],
  ['Phlm', 'Philemon', ['Philem', 'Phm']],
  ['Heb', 'Hebrews', ['He']],
  ['Jas', 'James', ['Jam', 'Jm']],
  ['1Pet', '1 Peter', ['1 Pe', '1 Pt']],
  ['2Pet', '2 Peter', ['2 Pe', '2 Pt']],
  ['1John', '1 John', ['1 Jn', '1 Jhn']],
  ['2John', '2 John', ['2 Jn', '2 Jhn']],
  ['3John', '3 John', ['3 Jn', '3 Jhn']],
  ['Jude', 'Jude', []],
  ['Rev', 'Revelation', ['Revelations', 'Rv', 'Revelation of John']],
];

export const BOOKS: readonly BookInfo[] = BOOK_DEFINITIONS.map(
  ([id, name, aliases], index) => ({
    id,
    order: index + 1,
    name,
    aliases,
  }),
);

/**
 * The lookup key of a written book name: lower case, with periods and spaces removed, and a leading Roman numeral
 * (`I`, `II`, `III` followed by a space) read as the digit it stands for. `I John`, `1 John`, `1john` and `1 Jn.`
 * therefore reduce to `1john` / `1jn`.
 */
export function normalizeBookName(raw: string): string {
  const text = raw.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
  const roman = /^(iii|ii|i) (?=\S)/.exec(text);
  const numeral = roman
    ? String(roman[1].length === 3 ? 3 : roman[1].length)
    : '';
  const rest = roman ? text.slice(roman[0].length) : text;
  return (numeral + rest).replace(/ /g, '');
}

const BY_KEY = new Map<string, BookInfo>();
for (const book of BOOKS) {
  for (const spelling of [book.id, book.name, ...book.aliases]) {
    const key = normalizeBookName(spelling);
    const existing = BY_KEY.get(key);
    if (existing && existing.id !== book.id) {
      // A shared spelling would make a reference ambiguous: fail loudly when the table is edited, not at request time.
      throw new Error(
        `Scripture book alias "${spelling}" is used by ${existing.id} and ${book.id}`,
      );
    }
    BY_KEY.set(key, book);
  }
}

/** The book a written name stands for, or null if the name is not a supported spelling of exactly one book. */
export function findBook(raw: string): BookInfo | null {
  return BY_KEY.get(normalizeBookName(raw)) ?? null;
}

export function getBook(id: BookId): BookInfo {
  return BOOKS[BOOK_IDS.indexOf(id)];
}
