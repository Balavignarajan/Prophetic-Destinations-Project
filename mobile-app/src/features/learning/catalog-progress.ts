import type { CourseListItem } from '@/api/types';
import { LEARNING_LEVELS, LEVEL_LABELS, type LearningLevel } from '@/learning/levels';

import type { CompletedEntry } from './progress-model';

/**
 * Lessons completed against lessons available, for the learner's level (APP-012, PROG-002). Pure rules: no React, no storage, nothing here is saved or changes
 * the saved progress.
 *
 * "Available" is exactly the lessons the published catalog lists at the level (the backend only lists lessons that are deliverable right now), taken from the
 * course list the screen has already loaded, live or its saved copy. A lesson that was completed and has since been unpublished is not available, so it is not
 * counted against the total either: "3 of 15" can never read "16 of 15". A lesson that is not in the catalog (a draft, an unpublished one, another level) is
 * never counted as available.
 *
 * Deliberately no percentage. The documents ask for "overall progress" but do not define what it is a percentage of (all published lessons or one level;
 * lessons only or lessons plus quizzes; how a course or a quiz would be weighted), so none is invented (decision C-14). Counts are the facts the saved progress
 * and the catalog actually give.
 */
export type PublishedLessons = {
  /** How many lessons the catalog lists at the level. */
  total: number;
  /** Their ids; null when the list is a saved copy from before ids were included, in which case only the total is known. */
  ids: ReadonlySet<string> | null;
};

/** What the loaded course list says is published at its level. Never throws on a list that does not look right: unusable parts count as unknown. */
export function publishedLessonsOf(courses: readonly CourseListItem[]): PublishedLessons {
  let ids: Set<string> | null = new Set();
  let counted = 0;
  for (const course of courses) {
    if (Number.isInteger(course.lessonCount) && course.lessonCount > 0) counted += course.lessonCount;
    if (ids === null) continue;
    if (Array.isArray(course.lessonIds) && course.lessonIds.every((id) => typeof id === 'string')) {
      for (const id of course.lessonIds) ids.add(id);
    } else if (course.lessonCount > 0) {
      ids = null; // this course lists lessons but not which ones: the ids of the level are not known
    }
  }
  return ids === null ? { total: counted, ids: null } : { total: ids.size, ids };
}

/**
 * True when the LIVE catalog says exactly which lessons are published at `level` and this lesson (at that level) is not one of them: it was unpublished or taken
 * down. A saved copy of the catalog never decides this (`live` false): it may simply be older than the lesson's publication, so a lesson missing from it says
 * nothing. Lessons at another level are never judged by this level's catalog. Nothing is saved or changed; the learner's record of the lesson stays.
 */
export function isMissingFromCatalog(published: PublishedLessons | null, live: boolean, lesson: { lessonId: string; level: LearningLevel }, level: LearningLevel): boolean {
  return live && published !== null && published.ids !== null && lesson.level === level && !published.ids.has(lesson.lessonId);
}

export type LevelProgress =
  /** The catalog is known and nothing is published at the level, so there is nothing to complete. */
  | { kind: 'empty' }
  /** Lessons completed among the lessons available now, and how many are left. */
  | { kind: 'counts'; completed: number; total: number; remaining: number }
  /** The available lessons are not known (loading, offline without a saved list, or a saved list without ids): only what this device recorded is stated. */
  | { kind: 'unknown'; completed: number; available: number | null };

/** The level's progress: `published` is null while the catalog is not known. Counts only lessons completed at `level`. */
export function levelProgressOf(done: readonly CompletedEntry[], level: LearningLevel, published: PublishedLessons | null): LevelProgress {
  const atLevel = done.filter((lesson) => lesson.level === level);
  if (published === null) return { kind: 'unknown', completed: atLevel.length, available: null };
  if (published.total === 0) return { kind: 'empty' };
  const ids = published.ids;
  if (ids === null) return { kind: 'unknown', completed: atLevel.length, available: published.total };
  const completed = atLevel.filter((lesson) => ids.has(lesson.lessonId)).length;
  return { kind: 'counts', completed, total: ids.size, remaining: ids.size - completed };
}

const lessons = (count: number) => (count === 1 ? 'lesson' : 'lessons');

/**
 * How many lessons are completed at each learning level, straight from what this device recorded (no catalog, no request), so it is true offline and never a guess.
 * Completion is kept per lesson AND level, so a lesson completed at Beginner is not counted at Advanced and the three counts add up to the all-levels total.
 */
export function completedByLevel(done: readonly CompletedEntry[]): Record<LearningLevel, number> {
  const counts: Record<LearningLevel, number> = { BEGINNER: 0, INTERMEDIATE: 0, ADVANCED: 0 };
  for (const lesson of done) if (lesson.level in counts) counts[lesson.level] += 1;
  return counts;
}

/** "Completed by level: Beginner 3 · Intermediate 0 · Advanced 1". Counts of completed lessons only; no totals, no percentage. */
export function completedByLevelLine(counts: Record<LearningLevel, number>): string {
  return `Completed by level: ${LEARNING_LEVELS.map((level) => `${LEVEL_LABELS[level]} ${counts[level]}`).join(' · ')}`;
}

/** "Beginner level: 3 of 15 lessons completed · 12 remaining". States only what is known; never a percentage. */
export function levelProgressLine(level: LearningLevel, progress: LevelProgress): string {
  const name = `${LEVEL_LABELS[level]} level`;
  switch (progress.kind) {
    case 'counts':
      return `${name}: ${progress.completed} of ${progress.total} ${lessons(progress.total)} completed${progress.remaining > 0 ? ` · ${progress.remaining} remaining` : ''}`;
    case 'empty':
      return `${name}: no lessons are published yet`;
    case 'unknown':
      return `${name}: ${progress.completed} ${lessons(progress.completed)} completed${progress.available !== null ? ` · ${progress.available} available` : ''}`;
  }
}
