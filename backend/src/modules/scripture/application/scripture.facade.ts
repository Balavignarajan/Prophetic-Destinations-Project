import { Injectable } from '@nestjs/common';
import { BusinessRuleError } from '../../../shared-kernel/index.js';
import {
  type BookId,
  type BookInfo,
  BOOKS,
  findBook,
  getBook,
} from '../domain/books.js';
import { BOOK_IDS } from '../domain/books.js';
import { type LookupFailure, chapterCount, readPassage, verseCount } from '../domain/dataset.js';
import {
  type ParseResult,
  type ScriptureReference,
  formatReference,
  parseReference,
} from '../domain/reference.js';
import { type ScriptureDataStatus, ScriptureDataService } from './scripture-data.service.js';

/** The data set a verified passage was read from (translation identity travels with the text). */
export interface PassageSource {
  id: string;
  translation: string;
  edition: string;
  version: string;
  /** SHA-256 of the installed text content: the identity used to detect that the text changed. */
  fingerprint: string;
}

export type VerifyResult =
  | { verified: true; reference: ScriptureReference; display: string; source: PassageSource; verses: { verse: number; text: string }[] }
  | { verified: false; reason: 'DATA_UNAVAILABLE' | 'UNKNOWN_BOOK' | LookupFailure; message: string };

/** A reference as stored by a block: the book is a plain string until it has been checked against the supported books. */
export type StoredReference = Omit<ScriptureReference, 'bookId'> & { bookId: string };

/**
 * What other modules may ask of Scripture.
 *
 * REFERENCE IDENTITY is `ScriptureReference` = { bookId (OSIS), chapter, startVerse, endVerse }, one chapter per reference (the confirmed
 * range rule). It is what blocks should STORE; the written form from `format` is for display only and never the identity.
 * Syntax checks (`parse`, `requireReference`) need no data. Canonical checks (`verify`, `requireVerified`) need the approved data set and
 * answer "unavailable" without it: a reference is never called valid on syntax alone.
 *
 * Unresolved range behaviour (not guessed here): ranges across chapters, whole chapters, comma lists and single-chapter shorthand are
 * rejected, as before. Whether and how to support them is an open product decision.
 */
@Injectable()
export class ScriptureFacade {
  constructor(private readonly data: ScriptureDataService) {}

  /** Parses a reference without throwing; the result says why a bad one was rejected. */
  parse(input: string): ParseResult {
    return parseReference(input);
  }

  /**
   * Parses a reference or throws a 422 business-rule error whose details carry the error `code`
   * (`EMPTY`, `MALFORMED`, `UNKNOWN_BOOK`, `INVALID_NUMBER` or `REVERSED_RANGE`).
   * A successful parse means the text is well formed and the book is supported. It does NOT mean that the
   * chapter or verses exist in that book: use `verify` / `requireVerified` for that.
   */
  requireReference(input: string): ScriptureReference {
    const result = parseReference(input);
    if (!result.ok) {
      throw new BusinessRuleError(result.message, { code: result.code });
    }
    return result.reference;
  }

  /** Checks that the passage exists in the installed data set and returns its text; never throws. */
  async verify(input: StoredReference): Promise<VerifyResult> {
    if (!(BOOK_IDS as readonly string[]).includes(input.bookId)) {
      return { verified: false, reason: 'UNKNOWN_BOOK', message: `"${input.bookId}" is not a supported book` };
    }
    const reference = input as ScriptureReference;
    const dataset = await this.data.get();
    if (!dataset) {
      return {
        verified: false,
        reason: 'DATA_UNAVAILABLE',
        message: 'The Scripture text is not installed on the server, so this passage cannot be verified.',
      };
    }
    const passage = readPassage(dataset, reference);
    if (!passage.ok) return { verified: false, reason: passage.code, message: passage.message };
    const { id, translation, edition, version, fingerprint } = dataset.metadata;
    return { verified: true, reference, display: formatReference(reference), source: { id, translation, edition, version, fingerprint }, verses: passage.verses };
  }

  /** Like `verify`, but throws a 422 whose details carry `code` (`DATA_UNAVAILABLE`, `NO_SUCH_CHAPTER` or `NO_SUCH_VERSE`). */
  async requireVerified(reference: StoredReference): Promise<Extract<VerifyResult, { verified: true }>> {
    const result = await this.verify(reference);
    if (!result.verified) {
      throw new BusinessRuleError(result.message, { code: result.reason === 'DATA_UNAVAILABLE' ? 'SCRIPTURE_DATA_UNAVAILABLE' : result.reason });
    }
    return result;
  }

  status(): Promise<ScriptureDataStatus> {
    return this.data.status();
  }

  /** Number of chapters of a book from the installed data set, or null when no data set is installed. */
  async chapterCount(bookId: BookId): Promise<number | null> {
    const dataset = await this.data.get();
    return dataset ? chapterCount(dataset, bookId) : null;
  }

  /** Number of verses of a chapter, or null when there is no data set or no such chapter. */
  async verseCount(bookId: BookId, chapter: number): Promise<number | null> {
    const dataset = await this.data.get();
    return dataset ? verseCount(dataset, bookId, chapter) : null;
  }

  /** The canonical written form of a reference, e.g. `1 John 3:16-18`. Display only. */
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
