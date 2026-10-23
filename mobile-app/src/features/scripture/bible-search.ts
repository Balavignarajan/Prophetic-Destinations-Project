import { listBibleBooks } from './bible-navigation';
import { BUNDLED_SCRIPTURE, type BookId, type ScriptureDataset } from './scripture-data';

/**
 * Keyword search over the bundled Bible text (BIB-006). Offline, on the device, with no service, no database and no dependency.
 *
 * WHAT MATCHES: whole words and phrases, ignoring capitals. Text and query are normalised the same way (letters and digits only; every other character, including straight
 * and curly apostrophes, hyphens and punctuation, counts as a space; runs of spaces collapse), then the query must appear as complete words. So `son of man` finds
 * "Son of man," and `lord` finds "the LORD's house", but `man` does not find "manna". No stemming, no fuzzy matching, no ranking: results are in Bible order.
 *
 * HOW IT STAYS FAST: each book is normalised ONCE, the first time it is searched, into one lower-case string with a table of where every verse starts. That index is kept
 * (module level, per data set), so typing another query never rebuilds anything: a search is one native `indexOf` loop per book. A book is read from the bundle only when it
 * is first needed (the data set loads books lazily). Searching goes book by book in Bible order, so a page of results is ready as soon as enough matches are found, a
 * cursor lets "show more" carry on from where it stopped instead of starting over, and control is handed back to the screen whenever the work has run for more than a
 * few milliseconds, so the UI never freezes. `warmSearchIndex` can build the indexes ahead of the first query.
 *
 * STALE WORK: every call takes `isStale`, checked between books; a search that is no longer wanted (the query changed, the screen closed) stops and resolves null.
 *
 * MEMORY: the indexes hold about one more copy of the text (about 4 MB, ASCII) plus three small tables per book. They are not released while the app runs.
 */
export type PreparedQuery = {
  /** ` word word ` (the normalised words, with a space either side): what is looked for in a verse. */
  needle: string;
  /** The normalised words. */
  words: readonly string[];
  /** The query as the reader wrote it, tidied (for messages). */
  label: string;
};

export type BibleHit = { bookId: BookId; chapter: number; verse: number; text: string };

/** Where the next page of the same search starts: `book` is an index into the listed books, `verse` the position (0-based) inside that book. */
export type SearchCursor = { book: number; verse: number };

export type SearchPage = { hits: BibleHit[]; next: SearchCursor | null };

/** The text a search compares: lower case, only letters and digits, single spaces. */
export const normalizeSearchText = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The query ready to search, or null when it holds no letter or digit to look for. */
export function prepareQuery(raw: string): PreparedQuery | null {
  const normalized = normalizeSearchText(raw);
  if (normalized === '') return null;
  return { needle: ` ${normalized} `, words: normalized.split(' '), label: raw.trim().replace(/\s+/g, ' ') };
}

type BookIndex = {
  haystack: string;
  starts: Int32Array;
  chapterOf: Uint16Array;
  verseOf: Uint16Array;
  count: number;
};

function buildBookIndex(chapters: readonly (readonly string[])[]): BookIndex {
  let count = 0;
  for (const verses of chapters) count += verses.length;
  const starts = new Int32Array(count);
  const chapterOf = new Uint16Array(count);
  const verseOf = new Uint16Array(count);
  const parts: string[] = [];
  let offset = 0;
  let position = 0;
  chapters.forEach((verses, chapterIndex) => {
    verses.forEach((text, verseIndex) => {
      const entry = ` ${normalizeSearchText(text)} `;
      starts[position] = offset;
      chapterOf[position] = chapterIndex + 1;
      verseOf[position] = verseIndex + 1;
      parts.push(entry);
      offset += entry.length + 1; // the newline between verses
      position += 1;
    });
  });
  return { haystack: parts.join('\n'), starts, chapterOf, verseOf, count };
}

const indexes = new WeakMap<ScriptureDataset, Map<BookId, BookIndex>>();

function indexFor(dataset: ScriptureDataset, bookId: BookId): BookIndex | null {
  let perBook = indexes.get(dataset);
  if (!perBook) {
    perBook = new Map();
    indexes.set(dataset, perBook);
  }
  const known = perBook.get(bookId);
  if (known) return known;
  const chapters = dataset.books[bookId];
  if (!Array.isArray(chapters)) return null;
  const built = buildBookIndex(chapters);
  perBook.set(bookId, built);
  return built;
}

/** The position of the verse that contains `at`: the last verse starting at or before it, looking from `low`. */
function verseAt(starts: Int32Array, at: number, low: number): number {
  let lo = low;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= at) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Up to `limit` matching verses of one book from `from` on, and where to resume (null when the book is exhausted). */
function scanBook(index: BookIndex, needle: string, from: number, limit: number): { found: number[]; resume: number | null } {
  const found: number[] = [];
  let position = from;
  while (position < index.count && found.length < limit) {
    const at = index.haystack.indexOf(needle, index.starts[position]);
    if (at < 0) {
      position = index.count;
      break;
    }
    const verse = verseAt(index.starts, at, position);
    found.push(verse);
    position = verse + 1;
  }
  return { found, resume: position < index.count ? position : null };
}

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
/** How long the search may run before it lets the screen draw. */
const SLICE_MS = 12;

/**
 * One page of results (in Bible order) for a prepared query, starting at `from` (null = the beginning). Resolves null if `isStale()` turned true meanwhile. `next` is
 * where the following page starts, or null when nothing is left to search.
 */
export async function searchBible(
  query: PreparedQuery,
  from: SearchCursor | null,
  limit: number,
  isStale: () => boolean,
  dataset: ScriptureDataset | null = BUNDLED_SCRIPTURE,
): Promise<SearchPage | null> {
  if (!dataset) return { hits: [], next: null };
  const books = listBibleBooks(dataset);
  const hits: BibleHit[] = [];
  let bookPosition = from?.book ?? 0;
  let verse = from?.verse ?? 0;
  let sliceStart = Date.now();
  while (bookPosition < books.length) {
    if (isStale()) return null;
    const book = books[bookPosition];
    const index = indexFor(dataset, book.id);
    if (index) {
      const { found, resume } = scanBook(index, query.needle, verse, limit - hits.length);
      const chapters = dataset.books[book.id];
      for (const position of found) {
        const chapter = index.chapterOf[position];
        const number = index.verseOf[position];
        hits.push({ bookId: book.id, chapter, verse: number, text: chapters[chapter - 1][number - 1] });
      }
      if (hits.length >= limit) {
        const next: SearchCursor | null = resume !== null ? { book: bookPosition, verse: resume } : bookPosition + 1 < books.length ? { book: bookPosition + 1, verse: 0 } : null;
        return { hits, next };
      }
    }
    bookPosition += 1;
    verse = 0;
    if (Date.now() - sliceStart > SLICE_MS) {
      await yieldToUi();
      sliceStart = Date.now();
    }
  }
  return isStale() ? null : { hits, next: null };
}

/** Builds the indexes of every book ahead of the first search, a book at a time, handing control back as it goes. Stops when `isStale()` turns true. */
export async function warmSearchIndex(isStale: () => boolean, dataset: ScriptureDataset | null = BUNDLED_SCRIPTURE): Promise<void> {
  if (!dataset) return;
  let sliceStart = Date.now();
  for (const book of listBibleBooks(dataset)) {
    if (isStale()) return;
    indexFor(dataset, book.id);
    if (Date.now() - sliceStart > SLICE_MS) {
      await yieldToUi();
      sliceStart = Date.now();
    }
  }
}

// ----------------------------------------------------------------------------------------------------------------------------- showing a hit

export type HitPart = { text: string; match: boolean };

/** The pattern for the query's words in ORIGINAL text: any punctuation between words, and whole words only (the same rule the search used). */
function highlightPattern(words: readonly string[]): RegExp {
  return new RegExp(`(^|[^A-Za-z0-9])(${words.join('[^A-Za-z0-9]+')})(?![A-Za-z0-9])`, 'gi');
}

function matchesIn(text: string, pattern: RegExp): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  pattern.lastIndex = 0;
  let found = pattern.exec(text);
  while (found !== null) {
    const start = found.index + found[1].length;
    out.push({ start, end: start + found[2].length });
    found = pattern.exec(text);
  }
  return out;
}

/**
 * A readable piece of the verse around the first match, cut at word boundaries with an ellipsis where text was left out, split into parts so the matched words can be
 * shown in a different style. A verse that already fits is shown whole. The words are the verse's own, unchanged.
 */
export function describeHit(text: string, query: PreparedQuery, maxLength = 200): HitPart[] {
  const pattern = highlightPattern(query.words);
  const first = matchesIn(text, pattern)[0];
  let from = 0;
  let to = text.length;
  if (text.length > maxLength && first) {
    const room = Math.max(0, maxLength - (first.end - first.start));
    from = Math.max(0, first.start - Math.floor(room / 2));
    to = Math.min(text.length, from + maxLength);
    from = Math.max(0, to - maxLength);
    if (from > 0) {
      const space = text.indexOf(' ', from);
      if (space >= 0 && space < first.start) from = space + 1;
    }
    if (to < text.length) {
      const space = text.lastIndexOf(' ', to);
      if (space > first.end) to = space;
    }
  } else if (text.length > maxLength) {
    to = maxLength;
    const space = text.lastIndexOf(' ', to);
    if (space > 0) to = space;
  }
  const piece = text.slice(from, to);
  const lead = from > 0 ? '…' : '';
  const tail = to < text.length ? '…' : '';
  const parts: HitPart[] = [];
  let cursor = 0;
  for (const found of matchesIn(piece, pattern)) {
    if (found.start > cursor) parts.push({ text: piece.slice(cursor, found.start), match: false });
    parts.push({ text: piece.slice(found.start, found.end), match: true });
    cursor = found.end;
  }
  if (cursor < piece.length) parts.push({ text: piece.slice(cursor), match: false });
  if (lead) parts.unshift({ text: lead, match: false });
  if (tail) parts.push({ text: tail, match: false });
  return parts;
}
