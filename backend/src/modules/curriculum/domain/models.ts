import type { ContentStatus } from './content-status.js';

export interface Course {
  id: string;
  title: string;
  description: string | null;
  status: ContentStatus;
  /** Incremented on every content change; used to detect conflicting edits. */
  version: number;
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
