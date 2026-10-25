/**
 * LEGACY (superseded by Home Entries, Batch 28). The Bible books that used to get a fixed entry point on the learner Home (feature register APP-013 Daniel, APP-014 Revelation),
 * stored in `courses.book`. Nothing writes that column any more: the Home is now a list of administrator-managed Home Entries with no fixed books. This type remains only to read
 * the frozen column when the public catalog serves it unchanged to mobile builds released before Home Entries. Stored and exposed in this exact (upper-case) form, like LearningLevel.
 */
export const COURSE_BOOKS = ['DANIEL', 'REVELATION'] as const;

export type CourseBook = (typeof COURSE_BOOKS)[number];

export function isCourseBook(value: unknown): value is CourseBook {
  return COURSE_BOOKS.includes(value as CourseBook);
}
