import { Injectable } from '@nestjs/common';
import { BusinessRuleError } from '../../../shared-kernel/index.js';
import {
  type BookId,
  type BookInfo,
  BOOKS,
  findBook,
  getBook,
} from '../domain/books.js';
import {
  type ParseResult,
  type ScriptureReference,
  formatReference,
  parseReference,
} from '../domain/reference.js';

/**
 * What other modules may ask of Scripture. Today that is reference SYNTAX only: reading the text of a reference,
 * and checking that its chapter and verses exist, need an approved data set and are deliberately not offered.
 * When that data exists, the lookup belongs here, behind this facade, so callers do not change.
 */
@Injectable()
export class ScriptureFacade {
  /** Parses a reference without throwing; the result says why a bad one was rejected. */
  parse(input: string): ParseResult {
    return parseReference(input);
  }

  /**
   * Parses a reference or throws a 422 business-rule error whose details carry the error `code`
   * (`EMPTY`, `MALFORMED`, `UNKNOWN_BOOK`, `INVALID_NUMBER` or `REVERSED_RANGE`).
   * A successful parse means the text is well formed and the book is supported. It does NOT mean that the
   * chapter or verses exist in that book.
   */
  requireReference(input: string): ScriptureReference {
    const result = parseReference(input);
    if (!result.ok) {
      throw new BusinessRuleError(result.message, { code: result.code });
    }
    return result.reference;
  }

  /** The canonical written form of a reference, e.g. `1 John 3:16-18`. */
  format(reference: ScriptureReference): string {
    return formatReference(reference);
  }

  /** The supported books in canonical order. */
  listBooks(): readonly BookInfo[] {
    return BOOKS;
  }

  /** The book a written name stands for, or null if it is not a supported spelling of exactly one book. */
  findBook(name: string): BookInfo | null {
    return findBook(name);
  }

  getBook(id: BookId): BookInfo {
    return getBook(id);
  }
}
