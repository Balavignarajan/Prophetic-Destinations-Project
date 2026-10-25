import type { LearningLevel } from '../../../../shared-kernel/index.js';
import type { CourseListItemDto } from './catalog-delivery.dto.js';

/** One topic on the learner Home screen. Only what the card needs: nothing about the entry's administration, and nothing from a draft. */
export class HomeEntryItemDto {
  entryId: string;
  /** What the card says (set by the administrators). */
  title: string;
  description: string | null;
  /** The administrators' Home position. The list is already in this order. */
  sortOrder: number;
  /** The card's own picture, or null: then use `coverMediaId`. Fetch it with GET /home-entries/:entryId/media/:imageMediaId?level=. */
  imageMediaId: string | null;
  /** How many courses a learner can open in this entry at this level (at least 1), and the lessons in them. */
  courseCount: number;
  lessonCount: number;
  /** The published cover of the entry's first eligible course that has one, with that course's id; both null if none has. Fetch it with GET /courses/:coverCourseId/media/:coverMediaId?level=. */
  coverCourseId: string | null;
  coverMediaId: string | null;
}

/**
 * Response of `GET /api/v1/home-entries?level=`: the topics a learner at that level may see, in the administrators' order. An entry is present only while it is enabled and at least
 * one course assigned to it is published with a lesson at that level; otherwise it is simply absent. Possibly empty (never an error).
 */
export class HomeEntryListResponseDto {
  level: LearningLevel;
  entries: HomeEntryItemDto[];
}

/**
 * Response of `GET /api/v1/home-entries/:entryId/courses?level=`: the entry and the courses a learner can open in it at that level, each exactly as in `GET /courses?level=` and in
 * the same order. Only published courses ever appear. An unknown or disabled entry, or one with no eligible course at that level, is a 404 (all the same answer).
 */
export class HomeEntryCoursesResponseDto {
  level: LearningLevel;
  entry: HomeEntryItemDto;
  courses: CourseListItemDto[];
}
