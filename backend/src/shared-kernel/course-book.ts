/**
 * The Bible books that get a dedicated entry point on the learner Home (feature register APP-013 Daniel, APP-014 Revelation).
 * Optional, CMS-managed classification of a course: it is what identifies "the Daniel course" and "the Revelation course", so the app never
 * has to guess from a title. Stored and exposed in this exact (upper-case) form, like LearningLevel.
 */
export const COURSE_BOOKS = ['DANIEL', 'REVELATION'] as const;

export type CourseBook = (typeof COURSE_BOOKS)[number];

export function isCourseBook(value: unknown): value is CourseBook {
  return COURSE_BOOKS.includes(value as CourseBook);
}
