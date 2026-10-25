import type { ContentStatus } from '../../../shared-kernel/index.js';

export interface Course {
  id: string;
  title: string;
  description: string | null;
  status: ContentStatus;
  /** Working cover image (media asset id), or null. */
  coverMediaId: string | null;
  /** The Home Entry (learner Home topic) this course belongs to, or null. Like the order, not a content edit: status and version do not move. */
  homeEntryId: string | null;
  /** 1-based place in the manual course order. Changing it is not a content edit: status and version do not move. */
  position: number;
  /** Incremented on every content change; used to detect conflicting edits. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** A course assigned to a Home Entry, as the Admin CMS lists it. */
export interface HomeEntryCourse {
  id: string;
  title: string;
  status: ContentStatus;
}

/** One topic on the learner Home screen, managed in the Admin CMS. It holds any number of courses (see `courses.home_entry_id`), including none. */
export interface HomeEntry {
  id: string;
  title: string;
  description: string | null;
  /** The card's own picture (media asset id), or null: then the learner app shows the cover of the first published course. */
  imageMediaId: string | null;
  /** 1-based place on the learner Home. Changing it is not a content edit: the version does not move. */
  position: number;
  /** A disabled entry is kept but not shown to learners. */
  isEnabled: boolean;
  /** Incremented on every content change; used to detect conflicting edits. */
  version: number;
  /** How many courses are assigned (any status). */
  courseCount: number;
  /** The assigned courses in the course order (any status): the CMS shows which are published, learners only ever get the published ones. */
  courses: HomeEntryCourse[];
  createdAt: Date;
  updatedAt: Date;
}

/** A Module inside a Course (product term; not a NestJS module). */
export interface CourseModule {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  status: ContentStatus;
  /** 1-based, gap-free position within the course. */
  position: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
