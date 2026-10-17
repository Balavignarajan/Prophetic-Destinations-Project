import type { LearningLevel } from '@/learning/levels';

/**
 * One saved item. Two kinds, one list:
 *  - a PUBLISHED backend lesson (identified by lesson id + learning level, because each level is its own published snapshot);
 *  - a scene of the BUILT-IN Daniel 2 lesson (identified by scene id). It is not a backend lesson and is never presented as one.
 *
 * The title is stored when the item is saved, so it can still be listed when the content cannot be loaded.
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

export type SceneBookmark = {
  id: string;
  type: 'daniel2-scene';
  sceneId: string;
  title: string;
  savedAt: number;
};

export type Bookmark = LessonBookmark | SceneBookmark;

export const lessonBookmarkId = (lessonId: string, level: LearningLevel) => `lesson:${lessonId}:${level}`;
export const sceneBookmarkId = (sceneId: string) => `daniel2:${sceneId}`;
