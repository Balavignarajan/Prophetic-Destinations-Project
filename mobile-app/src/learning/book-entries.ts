import type { CourseBook, CourseListItem } from '@/api/types';

/**
 * The dedicated Home entries (feature register APP-013 Daniel, APP-014 Revelation). A course is "the Daniel course" because the CMS marked it so (its `book`),
 * never because of its title. Pure rules, so they have no screen or storage in them.
 */
export const BOOK_ENTRIES: readonly { book: CourseBook; label: string }[] = [
  { book: 'DANIEL', label: 'Daniel' },
  { book: 'REVELATION', label: 'Revelation' },
];

export type BookEntryState =
  /** A published course at this level is marked for the book. */
  | { status: 'available'; course: CourseListItem }
  /** The catalog is current and no published course at this level is marked for the book. */
  | { status: 'unavailable' }
  /** The catalog is a saved copy from before courses carried a book, so nothing can be said about it until the app is online again. */
  | { status: 'unknown' };

/**
 * The course the entry for `book` opens, from the catalog already loaded for the learner's level (so it is published, at that level, and from the live
 * list or its saved copy). Several courses may be marked for one book: the first in the published order wins, which is the order the list is in.
 */
export function bookEntryState(courses: readonly CourseListItem[], book: CourseBook): BookEntryState {
  const course = courses.find((item) => item.book === book);
  if (course) return { status: 'available', course };
  // `book` is null for an ordinary course in a current response and absent in an older saved one. Only a catalog that carries it for no course at all, while listing
  // some, is an older copy; an empty catalog simply has nothing.
  const olderCopy = courses.length > 0 && courses.every((item) => item.book === undefined);
  return olderCopy ? { status: 'unknown' } : { status: 'unavailable' };
}
