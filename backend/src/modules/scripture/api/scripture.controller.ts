import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { BusinessRuleError } from '../../../shared-kernel/index.js';
import { Role, Roles } from '../../identity/index.js';
import { ScriptureFacade } from '../application/scripture.facade.js';
import { BOOK_IDS, type BookId } from '../domain/books.js';
import { MAX_CHAPTER, MAX_VERSE, type ScriptureReference } from '../domain/reference.js';

const READ_ROLES = [Role.ADMIN, Role.EDITOR, Role.REVIEWER];

function bookId(raw: string): BookId {
  if (!(BOOK_IDS as readonly string[]).includes(raw)) {
    throw new BusinessRuleError(`"${raw}" is not a supported book id`, { code: 'UNKNOWN_BOOK' });
  }
  return raw as BookId;
}

function whole(raw: string | undefined, what: string, max: number): number {
  const value = raw === undefined ? NaN : Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new BusinessRuleError(`The ${what} must be a whole number from 1 to ${max}`, { code: 'INVALID_NUMBER' });
  }
  return value;
}

/**
 * READ-ONLY Scripture access for the admin tool (book, chapter, verse and passage selection). There is no write route: canonical text
 * can only come from the data file installed on the server. Every route needs a signed-in admin (ADMIN, EDITOR or REVIEWER).
 * Without an installed data set, lookups of counts and text answer "unavailable" (never made up), and `status` says why.
 */
@Controller('admin/scripture')
export class ScriptureController {
  constructor(private readonly scripture: ScriptureFacade) {}

  /** Whether canonical data is installed, and its provenance (translation, edition, version, source). */
  @Get('status')
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  status() {
    return this.scripture.status();
  }

  /** The supported books in canonical order, with their chapter count when data is installed (otherwise null). */
  @Get('books')
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async books() {
    const items = [];
    for (const book of this.scripture.listBooks()) {
      items.push({ id: book.id, name: book.name, order: book.order, chapters: await this.scripture.chapterCount(book.id) });
    }
    return { items };
  }

  /** How many verses a chapter has (null without data or when the chapter does not exist). */
  @Get('books/:bookId/chapters/:chapter')
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async chapter(@Param('bookId') book: string, @Param('chapter') chapter: string) {
    const id = bookId(book);
    const number = whole(chapter, 'chapter', MAX_CHAPTER);
    return { bookId: id, chapter: number, verses: await this.scripture.verseCount(id, number) };
  }

  /**
   * A passage by stable identity: `?book=John&chapter=3&start=16&end=18` (`end` optional). 422 for an invalid or non-existent passage
   * (`code`: UNKNOWN_BOOK, INVALID_NUMBER, REVERSED_RANGE, NO_SUCH_CHAPTER, NO_SUCH_VERSE) and `SCRIPTURE_DATA_UNAVAILABLE` when no data
   * set is installed. The response names the data set the text came from.
   */
  @Get('passage')
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async passage(
    @Query('book') book: string,
    @Query('chapter') chapter: string,
    @Query('start') start: string,
    @Query('end') end?: string,
  ) {
    const startVerse = whole(start, 'verse', MAX_VERSE);
    const endVerse = end === undefined || end === '' ? startVerse : whole(end, 'verse', MAX_VERSE);
    if (endVerse < startVerse) {
      throw new BusinessRuleError(`The range ends (${endVerse}) before it starts (${startVerse})`, { code: 'REVERSED_RANGE' });
    }
    const reference: ScriptureReference = { bookId: bookId(book), chapter: whole(chapter, 'chapter', MAX_CHAPTER), startVerse, endVerse };
    return this.scripture.requireVerified(reference);
  }
}
