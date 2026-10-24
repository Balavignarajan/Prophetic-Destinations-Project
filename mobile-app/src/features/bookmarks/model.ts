import type { TitledLesson } from '@/features/learning/progress-model';
import type { LearningLevel } from '@/learning/levels';

/**
 * One saved item: a PUBLISHED backend lesson (identified by lesson id + learning level, because each level is its own published snapshot).
 *
 * The title is stored when the item is saved, so it can still be listed when the content cannot be loaded. It is the fallback only: when the live
 * published catalog gives the lesson a new title (the CMS renamed it) the stored title is replaced in place (`withCurrentBookmarkTitles`).
 */
export type LessonBookmark = {
  id: string;
  type: 'lesson';
  lessonId: string;
  level: LearningLevel;
  courseId: string | null;
  title: string;
  savedAt: number;
  /** Set when the backend last reported this lesson as not available; cleared when it loads again. */
  unavailableSince?: number;
};

export type Bookmark = LessonBookmark;

/**
 * The saved items with the title the published catalog gives their lessons now (a lesson renamed in the CMS). ONLY the title of a saved lesson changes: its id,
 * when it was saved, its place in the list, its level and course and its "no longer available" mark stay exactly as they were, and no item is removed or created.
 * A lesson the catalog did not name (unpublished, another level, no usable title) keeps the title it was saved with. Returns `items` itself, the very same array,
 * when every title already matches, so nothing is written for it.
 */
export function withCurrentBookmarkTitles(items: Bookmark[], lessons: readonly TitledLesson[]): Bookmark[] {
  const titles = new Map<string, string>();
  for (const lesson of lessons) {
    if (typeof lesson.title === 'string' && lesson.title.trim().length > 0) titles.set(`${lesson.lessonId}:${lesson.level}`, lesson.title);
  }
  if (titles.size === 0) return items;
  const next = items.map((item) => {
    const title = titles.get(`${item.lessonId}:${item.level}`);
    return title === undefined || title === item.title ? item : { ...item, title };
  });
  return next.some((item, index) => item !== items[index]) ? next : items;
}

export const lessonBookmarkId = (lessonId: string, level: LearningLevel) => `lesson:${lessonId}:${level}`;
