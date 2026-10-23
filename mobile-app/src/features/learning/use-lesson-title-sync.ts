import { useEffect, useEffectEvent } from 'react';

import { getCourse, listCourses } from '@/api/learner-api';
import type { CourseListItem } from '@/api/types';
import { useBookmarks } from '@/features/bookmarks/bookmarks-provider';
import type { LearningLevel } from '@/learning/levels';

import { useLearningProgress } from './learning-provider';
import { catalogTitlesOf, coursesHolding } from './lesson-titles';
import type { TitledLesson } from './progress-model';

/** A course page (or course list) that was just asked for is not asked for again for this long (this session only; nothing is stored). */
const FRESH_FOR_MS = 5 * 60 * 1000;
const appliedAt = new Map<string, number>();
const listings = new Map<LearningLevel, { at: number; courses: CourseListItem[] }>();

type Fetched = { key: string; lessons: TitledLesson[] };

/** The live titles of these courses at `level`. A course that cannot be reached (offline, no longer published, an unusable answer) simply contributes nothing. */
async function fetchTitles(courseIds: readonly string[], level: LearningLevel, signal: AbortSignal): Promise<Fetched[]> {
  const now = Date.now();
  const fetched = await Promise.all(
    courseIds.map(async (courseId): Promise<Fetched | null> => {
      const key = `${level}:${courseId}`;
      const at = appliedAt.get(key);
      if (at !== undefined && now - at < FRESH_FOR_MS) return null;
      try {
        // The plain request, not the saved-copy loader: a saved copy may be older than a title already refreshed, so only the live answer may change a saved
        // title, and asking for titles must not save a copy of the course or download its images.
        return { key, lessons: catalogTitlesOf(await getCourse(courseId, level, signal)) };
      } catch {
        return null;
      }
    }),
  );
  return fetched.filter((entry): entry is Fetched => entry !== null);
}

/** The live course list at `level` (for finding which courses hold a lesson), or null when it cannot be reached. */
async function fetchCourseList(level: LearningLevel, signal: AbortSignal): Promise<CourseListItem[] | null> {
  const known = listings.get(level);
  if (known && Date.now() - known.at < FRESH_FOR_MS) return known.courses;
  try {
    const list = await listCourses(level, signal);
    listings.set(level, { at: Date.now(), courses: list.courses });
    return list.courses;
  } catch {
    return null;
  }
}

/**
 * Where a live title goes: every record the app keeps of a lesson's title, through the same two entry points, each of which changes titles only and writes nothing
 * when they already match. The progress records (lessons in progress, completed, last opened, quiz results) and the saved items. `settled` is false until both
 * have been read, so nothing is asked for that could not be applied.
 */
function useTitleTargets(): { settled: boolean; apply: (lessons: readonly TitledLesson[]) => void } {
  const { syncTitles: syncProgress, status } = useLearningProgress();
  const { syncTitles: syncSaved, ready: savedReady } = useBookmarks();
  return {
    settled: status !== 'loading' && savedReady,
    apply: (lessons) => {
      syncProgress(lessons);
      syncSaved(lessons);
    },
  };
}

/**
 * Keeps the titles saved with the learner's progress and saved items current for the lessons a screen is about to show. When the course list is LIVE (not a saved
 * copy), the courses that contain those lessons are asked for their current published titles and the saved titles are brought up to date (titles only; completion
 * dates, positions, quiz results and the saved items' ids, times and order are untouched, and nothing is written when they already match). Offline, or while the
 * list is only a saved copy, nothing is asked and the saved titles are shown as they are.
 *
 * Only the lessons at the learner's chosen `level` can be checked, because the catalog is per level; others keep their saved title until they are opened.
 */
export function useLessonTitleSync({ level, courses, live, lessonIds }: { level: LearningLevel; courses: readonly CourseListItem[]; live: boolean; lessonIds: readonly string[] }): void {
  const { settled, apply } = useTitleTargets();
  const courseIds = live && settled ? coursesHolding(courses, lessonIds) : [];
  const key = courseIds.length > 0 ? `${level}|${courseIds.join(',')}` : null;

  const run = useEffectEvent(async (signal: AbortSignal) => {
    const fetched = await fetchTitles(courseIds, level, signal);
    if (signal.aborted || fetched.length === 0) return;
    for (const entry of fetched) appliedAt.set(entry.key, Date.now());
    apply(fetched.flatMap((entry) => entry.lessons));
  });

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    void run(controller.signal);
    return () => controller.abort();
  }, [key]);
}

/**
 * The same for the Saved screen, whose lessons are at any level: for each level that has a saved lesson, the live course list says which courses hold them and those
 * courses' live titles are applied. Nothing is asked while offline. A saved lesson that is no longer published (or whose level's list does not name it) simply keeps
 * the title it was saved with, and the screen's existing "no longer available" handling is unchanged.
 */
export function useSavedTitleSync(saved: readonly { lessonId: string; level: LearningLevel }[]): void {
  const { settled, apply } = useTitleTargets();
  const key = settled && saved.length > 0 ? [...new Set(saved.map((entry) => `${entry.level}:${entry.lessonId}`))].sort().join(',') : null;

  const run = useEffectEvent(async (signal: AbortSignal) => {
    const levels = [...new Set(saved.map((entry) => entry.level))];
    const perLevel = await Promise.all(
      levels.map(async (level): Promise<Fetched[]> => {
        const courses = await fetchCourseList(level, signal);
        if (!courses) return [];
        const ids = saved.filter((entry) => entry.level === level).map((entry) => entry.lessonId);
        return fetchTitles(coursesHolding(courses, ids), level, signal);
      }),
    );
    const fetched = perLevel.flat();
    if (signal.aborted || fetched.length === 0) return;
    for (const entry of fetched) appliedAt.set(entry.key, Date.now());
    apply(fetched.flatMap((entry) => entry.lessons));
  });

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    void run(controller.signal);
    return () => controller.abort();
  }, [key]);
}
