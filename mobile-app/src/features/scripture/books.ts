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

/** The Protestant canon: the first 39 books of the canonical order are the Old Testament, the other 27 the New. */
export const OLD_TESTAMENT_BOOK_COUNT = 39;

export type Testament = 'OT' | 'NT';

/** Which testament a canonical book belongs to, from its place in the canonical order; null for an identifier that is not a canonical book. */
export function testamentOf(bookId: string): Testament | null {
  const position = BOOK_NAMES.findIndex(([id]) => id === bookId);
  if (position < 0) return null;
  return position < OLD_TESTAMENT_BOOK_COUNT ? 'OT' : 'NT';
}

/**
 * The extra spellings accepted for a book name when a reference is typed, COPIED from the backend's table (backend/src/modules/scripture/domain/books.ts), which is the
 * reference: the same aliases and the same matching rule, so a reference means the same book in the app, the CMS and the server. KNOWN DUPLICATION (there is no shared
 * package). An abbreviation that two books share (for example `Jud`, Judges or Jude) is deliberately absent there, and it is never guessed here either.
 */
const BOOK_ALIASES: Readonly<Record<BookId, readonly string[]>> = {
  Gen: ['Gn'],
  Exod: ['Ex', 'Exo'],
  Lev: ['Lv'],
  Num: ['Nm', 'Nu'],
  Deut: ['Dt', 'Deu'],
  Josh: ['Jos', 'Jsh'],
  Judg: ['Jdg', 'Jg'],
  Ruth: ['Rth', 'Ru'],
  '1Sam': ['1 Sa', '1 Sm'],
  '2Sam': ['2 Sa', '2 Sm'],
  '1Kgs': ['1 Ki', '1 Kg'],
  '2Kgs': ['2 Ki', '2 Kg'],
  '1Chr': ['1 Ch', '1 Chron'],
  '2Chr': ['2 Ch', '2 Chron'],
  Ezra: ['Ezr'],
  Neh: ['Ne'],
  Esth: ['Est', 'Es'],
  Job: ['Jb'],
  Ps: ['Psalm', 'Psa', 'Pss', 'Psm'],
  Prov: ['Pro', 'Prv', 'Pr'],
  Eccl: ['Ecc', 'Eccles', 'Qoh'],
  Song: ['Song of Songs', 'SOS', 'Canticles'],
  Isa: ['Is'],
  Jer: ['Jr'],
  Lam: ['La'],
  Ezek: ['Eze', 'Ezk'],
  Dan: ['Dn', 'Da'],
  Hos: ['Ho'],
  Joel: ['Joe', 'Jl'],
  Amos: ['Am'],
  Obad: ['Oba', 'Ob'],
  Jonah: ['Jon', 'Jnh'],
  Mic: ['Mi'],
  Nah: ['Na'],
  Hab: ['Hb'],
  Zeph: ['Zep', 'Zp'],
  Hag: ['Hg'],
  Zech: ['Zec', 'Zc'],
  Mal: ['Ml'],
  Matt: ['Mt'],
  Mark: ['Mrk', 'Mk'],
  Luke: ['Luk', 'Lk'],
  John: ['Jhn', 'Jn'],
  Acts: ['Act', 'Ac', 'Acts of the Apostles'],
  Rom: ['Ro', 'Rm'],
  '1Cor': ['1 Co'],
  '2Cor': ['2 Co'],
  Gal: ['Ga'],
  Eph: ['Ephes'],
  Phil: ['Php'],
  Col: ['Co'],
  '1Thess': ['1 Thes', '1 Th'],
  '2Thess': ['2 Thes', '2 Th'],
  '1Tim': ['1 Ti'],
  '2Tim': ['2 Ti'],
  Titus: ['Tit', 'Ti'],
  Phlm: ['Philem', 'Phm'],
  Heb: ['He'],
  Jas: ['Jam', 'Jm'],
  '1Pet': ['1 Pe', '1 Pt'],
  '2Pet': ['2 Pe', '2 Pt'],
  '1John': ['1 Jn', '1 Jhn'],
  '2John': ['2 Jn', '2 Jhn'],
  '3John': ['3 Jn', '3 Jhn'],
  Jude: [],
  Rev: ['Revelations', 'Rv', 'Revelation of John'],
};

/**
 * The lookup key of a written book name (the backend's rule): lower case, periods and spaces removed, and a leading Roman numeral (`I`, `II`, `III` then a space) read as
 * the digit it stands for, so `I John`, `1 John`, `1john` and `1 Jn.` reduce to `1john` / `1jn`.
 */
export function normalizeBookName(raw: string): string {
  const text = raw.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
  const roman = /^(iii|ii|i) (?=\S)/.exec(text);
  const numeral = roman ? String(roman[1].length === 3 ? 3 : roman[1].length) : '';
  const rest = roman ? text.slice(roman[0].length) : text;
  return (numeral + rest).replace(/ /g, '');
}

/** key -> the one book it names. A key two different books would share is left out, so it can never pick the wrong book. */
const BY_KEY = new Map<string, BookId>();
const SHARED_KEYS = new Set<string>();
for (const [id, name] of BOOK_NAMES) {
  for (const spelling of [id, name, ...(BOOK_ALIASES[id] ?? [])]) {
    const key = normalizeBookName(spelling);
    const existing = BY_KEY.get(key);
    if (existing !== undefined && existing !== id) SHARED_KEYS.add(key);
    else BY_KEY.set(key, id);
  }
}
for (const key of SHARED_KEYS) BY_KEY.delete(key);

/** The book a written name stands for (a full name, an identifier or one of the accepted abbreviations), or null if it is not a spelling of exactly one book. */
export function findBookByName(raw: string): { id: BookId; name: string } | null {
  const id = BY_KEY.get(normalizeBookName(raw));
  return id === undefined ? null : { id, name: bookName(id) };
}

/**
 * Books whose name or accepted spelling BEGINS with what was typed, for telling the reader what an unrecognised name might have meant. It never chooses one: a name that is
 * not an accepted spelling is not resolved, however likely the guess. At most `limit` books, in canonical order; nothing for a single letter.
 */
export function suggestBooks(raw: string, limit = 4): { id: BookId; name: string }[] {
  const typed = normalizeBookName(raw);
  if (typed.length < 2) return [];
  const out: { id: BookId; name: string }[] = [];
  for (const [id, name] of BOOK_NAMES) {
    if ([id, name, ...(BOOK_ALIASES[id] ?? [])].some((spelling) => normalizeBookName(spelling).startsWith(typed))) out.push({ id, name });
    if (out.length === limit) break;
  }
  return out;
}
