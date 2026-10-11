import {
  BOOKS,
  BOOK_IDS,
  findBook,
  getBook,
  normalizeBookName,
} from './books.js';
import {
  MAX_CHAPTER,
  MAX_REFERENCE_LENGTH,
  MAX_VERSE,
  formatReference,
  parseReference,
} from './reference.js';

const ok = (input: string) => {
  const result = parseReference(input);
  if (!result.ok)
    throw new Error(`expected "${input}" to parse: ${result.code}`);
  return result.reference;
};
const code = (input: string) => {
  const result = parseReference(input);
  return result.ok ? 'OK' : result.code;
};

describe('book table', () => {
  it('lists the 66 books once each, in canonical order, with unique ids', () => {
    expect(BOOKS).toHaveLength(66);
    expect(new Set(BOOK_IDS).size).toBe(66);
    // getBook() indexes the table by BOOK_IDS, so the two must list the same books in the same order
    expect(BOOKS.map((b) => b.id)).toEqual([...BOOK_IDS]);
    expect(BOOKS.map((b) => b.order)).toEqual(
      Array.from({ length: 66 }, (_, i) => i + 1),
    );
    expect(BOOKS[0]).toMatchObject({ id: 'Gen', name: 'Genesis', order: 1 });
    expect(BOOKS[38]).toMatchObject({ id: 'Mal', order: 39 });
    expect(BOOKS[39]).toMatchObject({ id: 'Matt', order: 40 });
    expect(BOOKS[65]).toMatchObject({
      id: 'Rev',
      name: 'Revelation',
      order: 66,
    });
    expect(getBook('John').name).toBe('John');
  });

  it('finds every book by its id and by its display name', () => {
    for (const book of BOOKS) {
      expect(findBook(book.id)?.id).toBe(book.id);
      expect(findBook(book.name)?.id).toBe(book.id);
    }
  });

  it('accepts aliases regardless of case, periods and spacing', () => {
    expect(findBook('GENESIS')?.id).toBe('Gen');
    expect(findBook('gen.')?.id).toBe('Gen');
    expect(findBook('  Song   of   Solomon ')?.id).toBe('Song');
    expect(findBook('Song of Songs')?.id).toBe('Song');
    expect(findBook('1 sam.')?.id).toBe('1Sam');
    expect(findBook('1Sam')?.id).toBe('1Sam');
    expect(findBook('I Samuel')?.id).toBe('1Sam');
    expect(findBook('II Kings')?.id).toBe('2Kgs');
    expect(findBook('III John')?.id).toBe('3John');
    expect(findBook('Psalm')?.id).toBe('Ps');
    expect(findBook('Revelations')?.id).toBe('Rev');
  });

  it('does not guess ambiguous or unknown names', () => {
    for (const name of [
      'Jud',
      'J',
      'Jo',
      'Ph',
      'Sam',
      'John 3',
      '',
      'Tobit',
      'Wisdom',
      'Sirach',
      '4 John',
      'IV John',
      'Genesiss',
    ]) {
      expect(findBook(name), name).toBeNull();
    }
  });

  it('normalizes names to a stable key', () => {
    expect(normalizeBookName(' I   John. ')).toBe('1john');
    expect(normalizeBookName('1 John')).toBe('1john');
    expect(normalizeBookName('Isaiah')).toBe('isaiah');
  });
});

describe('parseReference: valid references', () => {
  it('parses a single verse with start and end equal', () => {
    expect(ok('John 3:16')).toEqual({
      bookId: 'John',
      chapter: 3,
      startVerse: 16,
      endVerse: 16,
    });
  });

  it('parses a verse range', () => {
    expect(ok('John 3:16-18')).toEqual({
      bookId: 'John',
      chapter: 3,
      startVerse: 16,
      endVerse: 18,
    });
  });

  it('allows a range of one verse (start equals end)', () => {
    expect(ok('John 3:16-16')).toMatchObject({ startVerse: 16, endVerse: 16 });
  });

  it('handles books with numbers, several words and aliases', () => {
    expect(ok('1 John 4:7-8')).toMatchObject({ bookId: '1John', chapter: 4 });
    expect(ok('1John 4:7')).toMatchObject({ bookId: '1John' });
    expect(ok('II Timothy 3:16')).toMatchObject({ bookId: '2Tim' });
    expect(ok('Song of Solomon 2:1')).toMatchObject({ bookId: 'Song' });
    expect(ok('Ps. 23:1-6')).toMatchObject({ bookId: 'Ps', chapter: 23 });
    expect(ok('psalms 119:176')).toMatchObject({ bookId: 'Ps', endVerse: 176 });
    expect(ok('rev 22:21')).toMatchObject({ bookId: 'Rev' });
  });

  it('tolerates surrounding and inner whitespace and an en dash', () => {
    const expected = {
      bookId: 'John',
      chapter: 3,
      startVerse: 16,
      endVerse: 18,
    };
    expect(ok('  John   3:16-18  ')).toEqual(expected);
    expect(ok('John 3 : 16 - 18')).toEqual(expected);
    expect(ok('John\t3:16–18')).toEqual(expected);
    expect(ok('John3:16-18')).toEqual(expected);
  });

  it('accepts the numeric limits', () => {
    expect(ok(`Ps ${MAX_CHAPTER}:${MAX_VERSE}`)).toMatchObject({
      chapter: MAX_CHAPTER,
      startVerse: MAX_VERSE,
    });
    expect(ok('Gen 1:1')).toMatchObject({ chapter: 1, startVerse: 1 });
    expect(ok(`Ps 119:1-${MAX_VERSE}`)).toMatchObject({ endVerse: MAX_VERSE });
  });
});

describe('parseReference: rejected input', () => {
  it('rejects empty input', () => {
    expect(code('')).toBe('EMPTY');
    expect(code('   \t ')).toBe('EMPTY');
  });

  it('rejects text that is not a single chapter:verse reference', () => {
    for (const input of [
      'John',
      'John 3',
      '3:16',
      ':16',
      'John :16',
      'John 3:',
      'John 3:16-',
      'John 3:-16',
      'John 3:16--18',
      'John 3:16-18-20',
      'John 3:16,18',
      'John 3:16; 4:1',
      'John 3:16-4:2',
      'John 3.16',
      'John 3:16 and more',
      'John -3:16',
      'John 3:+16',
      'John 3:1.5',
      'John 3:1e2',
      'John 3:16\nJohn 3:17',
      'Jude 5',
      '---',
    ]) {
      expect(code(input), JSON.stringify(input)).toBe('MALFORMED');
    }
  });

  it('rejects non-ASCII digits and non-string input', () => {
    expect(code('John ٣:١٦')).toBe('MALFORMED');
    expect(code('John ３:１６')).toBe('MALFORMED');
    expect(parseReference(undefined as unknown as string)).toMatchObject({
      ok: false,
      code: 'MALFORMED',
    });
  });

  it('rejects unsupported books', () => {
    expect(code('Johm 3:16')).toBe('UNKNOWN_BOOK');
    expect(code('Tobit 1:1')).toBe('UNKNOWN_BOOK');
    expect(code('4 John 1:1')).toBe('UNKNOWN_BOOK');
    expect(code('Jud 1:1')).toBe('UNKNOWN_BOOK');
    expect(code('1 3:16')).toBe('MALFORMED'); // no book name
    const result = parseReference('Johm 3:16');
    expect(result.ok ? '' : result.message).toContain('Johm');
  });

  it('rejects zero, leading-zero and over-limit numbers', () => {
    for (const input of [
      'John 0:16',
      'John 3:0',
      'John 3:16-0',
      'John 03:16',
      'John 3:016',
      'John 3:16-018',
      `John ${MAX_CHAPTER + 1}:1`,
      `John 3:${MAX_VERSE + 1}`,
      `John 3:1-${MAX_VERSE + 1}`,
      'John 99999999999999999999:1',
      'John 3:99999999999999999999',
    ]) {
      expect(code(input), input).toBe('INVALID_NUMBER');
    }
  });

  it('rejects a reversed range without truncating it', () => {
    expect(code('John 3:18-16')).toBe('REVERSED_RANGE');
    expect(code('John 3:17-16')).toBe('REVERSED_RANGE');
  });

  it('rejects over-long input before matching', () => {
    expect(code(`John 3:16${' '.repeat(MAX_REFERENCE_LENGTH)}`)).toBe('OK'); // trimmed first
    expect(code(`${'a'.repeat(MAX_REFERENCE_LENGTH)} 3:16`)).toBe('MALFORMED');
  });

  it('reports the first problem in a fixed order: book, then numbers, then range order', () => {
    expect(code('Johm 0:18-16')).toBe('UNKNOWN_BOOK');
    expect(code('John 0:18-16')).toBe('INVALID_NUMBER');
  });

  it('is fast on hostile input', () => {
    const started = Date.now();
    code(`${'1 '.repeat(39)}x:`);
    code(`${'9'.repeat(70)}:${'9'.repeat(5)}`);
    expect(Date.now() - started).toBeLessThan(200);
  });
});

describe('formatReference', () => {
  it('writes the canonical form and round-trips', () => {
    expect(formatReference(ok('jn 3:16'))).toBe('John 3:16');
    expect(formatReference(ok('I john 4 : 7 – 8'))).toBe('1 John 4:7-8');
    expect(formatReference(ok('John 3:16-16'))).toBe('John 3:16');
    for (const input of [
      'Genesis 1:1',
      'Song of Solomon 2:1-3',
      '3 John 1:4',
    ]) {
      expect(formatReference(ok(input))).toBe(input);
    }
  });
});
