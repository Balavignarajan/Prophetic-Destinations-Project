export interface ScriptureReference {
  bookId: string;
  chapter: number;
  startVerse: number;
  endVerse: number;
}

export type ReferenceErrorCode =
  | 'EMPTY'
  | 'MALFORMED'
  | 'UNKNOWN_BOOK'
  | 'INVALID_NUMBER'
  | 'REVERSED_RANGE';

export type ParseResult =
  | { ok: true; reference: ScriptureReference; formatted: string }
  | { ok: false; code: ReferenceErrorCode; message: string };

export const CANONICAL_BOOKS = [
  { id: 'Gen', name: 'Genesis' },
  { id: 'Exod', name: 'Exodus' },
  { id: 'Lev', name: 'Leviticus' },
  { id: 'Num', name: 'Numbers' },
  { id: 'Deut', name: 'Deuteronomy' },
  { id: 'Josh', name: 'Joshua' },
  { id: 'Judg', name: 'Judges' },
  { id: 'Ruth', name: 'Ruth' },
  { id: '1Sam', name: '1 Samuel' },
  { id: '2Sam', name: '2 Samuel' },
  { id: '1Kgs', name: '1 Kings' },
  { id: '2Kgs', name: '2 Kings' },
  { id: '1Chr', name: '1 Chronicles' },
  { id: '2Chr', name: '2 Chronicles' },
  { id: 'Ezra', name: 'Ezra' },
  { id: 'Neh', name: 'Nehemiah' },
  { id: 'Esth', name: 'Esther' },
  { id: 'Job', name: 'Job' },
  { id: 'Ps', name: 'Psalms' },
  { id: 'Prov', name: 'Proverbs' },
  { id: 'Eccl', name: 'Ecclesiastes' },
  { id: 'Song', name: 'Song of Solomon' },
  { id: 'Isa', name: 'Isaiah' },
  { id: 'Jer', name: 'Jeremiah' },
  { id: 'Lam', name: 'Lamentations' },
  { id: 'Ezek', name: 'Ezekiel' },
  { id: 'Dan', name: 'Daniel' },
  { id: 'Hos', name: 'Hosea' },
  { id: 'Joel', name: 'Joel' },
  { id: 'Amos', name: 'Amos' },
  { id: 'Obad', name: 'Obadiah' },
  { id: 'Jonah', name: 'Jonah' },
  { id: 'Mic', name: 'Micah' },
  { id: 'Nah', name: 'Nahum' },
  { id: 'Hab', name: 'Habakkuk' },
  { id: 'Zeph', name: 'Zephaniah' },
  { id: 'Hag', name: 'Haggai' },
  { id: 'Zech', name: 'Zechariah' },
  { id: 'Mal', name: 'Malachi' },
  { id: 'Matt', name: 'Matthew' },
  { id: 'Mark', name: 'Mark' },
  { id: 'Luke', name: 'Luke' },
  { id: 'John', name: 'John' },
  { id: 'Acts', name: 'Acts' },
  { id: 'Rom', name: 'Romans' },
  { id: '1Cor', name: '1 Corinthians' },
  { id: '2Cor', name: '2 Corinthians' },
  { id: 'Gal', name: 'Galatians' },
  { id: 'Eph', name: 'Ephesians' },
  { id: 'Phil', name: 'Philippians' },
  { id: 'Col', name: 'Colossians' },
  { id: '1Thess', name: '1 Thessalonians' },
  { id: '2Thess', name: '2 Thessalonians' },
  { id: '1Tim', name: '1 Timothy' },
  { id: '2Tim', name: '2 Timothy' },
  { id: 'Titus', name: 'Titus' },
  { id: 'Phlm', name: 'Philemon' },
  { id: 'Heb', name: 'Hebrews' },
  { id: 'Jas', name: 'James' },
  { id: '1Pet', name: '1 Peter' },
  { id: '2Pet', name: '2 Peter' },
  { id: '1John', name: '1 John' },
  { id: '2John', name: '2 John' },
  { id: '3John', name: '3 John' },
  { id: 'Jude', name: 'Jude' },
  { id: 'Rev', name: 'Revelation' },
];

const BOOK_ALIASES: Record<string, string> = {};
for (const b of CANONICAL_BOOKS) {
  BOOK_ALIASES[b.id.toLowerCase()] = b.id;
  BOOK_ALIASES[b.name.toLowerCase().replace(/[\s.]+/g, '')] = b.id;
}

const MAX_CHAPTER = 150;
const MAX_VERSE = 176;

/**
 * Validates and parses Scripture references adhering strictly to backend canon rules.
 */
export function validateScriptureReference(input: string): ParseResult {
  if (!input || !input.trim()) {
    return { ok: false, code: 'EMPTY', message: 'Reference cannot be empty.' };
  }

  const trimmed = input.trim();
  const match = trimmed.match(
    /^((?:\d\s*)?[A-Za-z\s.]+?)\s*(\d+)\s*:\s*(\d+)(?:\s*[-–]\s*(\d+))?$/
  );

  if (!match) {
    return {
      ok: false,
      code: 'MALFORMED',
      message: 'Format must be "Book Chapter:Verse" (e.g. "Daniel 7:13" or "Joel 2:28-32").',
    };
  }

  const rawBook = match[1].trim().toLowerCase().replace(/[\s.]+/g, '');
  const bookId = BOOK_ALIASES[rawBook];

  if (!bookId) {
    return {
      ok: false,
      code: 'UNKNOWN_BOOK',
      message: `"${match[1].trim()}" is not a recognized biblical book name or standard abbreviation.`,
    };
  }

  const chapter = parseInt(match[2], 10);
  const startVerse = parseInt(match[3], 10);
  const endVerse = match[4] ? parseInt(match[4], 10) : startVerse;

  if (chapter < 1 || chapter > MAX_CHAPTER) {
    return {
      ok: false,
      code: 'INVALID_NUMBER',
      message: `Chapter ${chapter} exceeds valid canonical limits (1-${MAX_CHAPTER}).`,
    };
  }

  if (startVerse < 1 || startVerse > MAX_VERSE || endVerse < 1 || endVerse > MAX_VERSE) {
    return {
      ok: false,
      code: 'INVALID_NUMBER',
      message: `Verses must be between 1 and ${MAX_VERSE}.`,
    };
  }

  if (endVerse < startVerse) {
    return {
      ok: false,
      code: 'REVERSED_RANGE',
      message: `Ending verse (${endVerse}) cannot precede starting verse (${startVerse}).`,
    };
  }

  const bookMeta = CANONICAL_BOOKS.find((b) => b.id === bookId)!;
  const formatted =
    startVerse === endVerse
      ? `${bookMeta.name} ${chapter}:${startVerse}`
      : `${bookMeta.name} ${chapter}:${startVerse}-${endVerse}`;

  return {
    ok: true,
    reference: {
      bookId,
      chapter,
      startVerse,
      endVerse,
    },
    formatted,
  };
}
