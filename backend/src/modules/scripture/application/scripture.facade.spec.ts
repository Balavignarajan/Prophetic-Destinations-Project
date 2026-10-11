import { BusinessRuleError } from '../../../shared-kernel/index.js';
import { ScriptureFacade } from './scripture.facade.js';

describe('ScriptureFacade', () => {
  const facade = new ScriptureFacade();

  it('parses without throwing and reports why a bad reference was rejected', () => {
    expect(facade.parse('John 3:16-18')).toEqual({
      ok: true,
      reference: { bookId: 'John', chapter: 3, startVerse: 16, endVerse: 18 },
    });
    expect(facade.parse('John 3:18-16')).toMatchObject({
      ok: false,
      code: 'REVERSED_RANGE',
    });
  });

  it('requireReference returns the reference or throws a business-rule error carrying the code', () => {
    expect(facade.requireReference('1 John 4:7')).toEqual({
      bookId: '1John',
      chapter: 4,
      startVerse: 7,
      endVerse: 7,
    });
    for (const [input, code] of [
      ['', 'EMPTY'],
      ['John', 'MALFORMED'],
      ['Johm 3:16', 'UNKNOWN_BOOK'],
      ['John 0:16', 'INVALID_NUMBER'],
      ['John 3:18-16', 'REVERSED_RANGE'],
    ] as const) {
      let thrown: unknown;
      try {
        facade.requireReference(input);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, input).toBeInstanceOf(BusinessRuleError);
      expect((thrown as BusinessRuleError).details).toEqual({ code });
    }
  });

  it('formats references and lists the books in canonical order', () => {
    expect(facade.format(facade.requireReference('ps 23:1-3'))).toBe(
      'Psalms 23:1-3',
    );
    const books = facade.listBooks();
    expect(books).toHaveLength(66);
    expect(books[0].id).toBe('Gen');
    expect(facade.findBook('Revelation')?.id).toBe('Rev');
    expect(facade.getBook('Titus').order).toBe(56);
  });

  it('offers no way to read Scripture text or to check that a passage exists', () => {
    expect(
      Object.getOwnPropertyNames(ScriptureFacade.prototype).sort(),
    ).toEqual([
      'constructor',
      'findBook',
      'format',
      'getBook',
      'listBooks',
      'parse',
      'requireReference',
    ]);
  });
});
