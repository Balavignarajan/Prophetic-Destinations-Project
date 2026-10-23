import type { CourseListItem, CourseResponse } from '@/api/types';

import type { TitledLesson } from './progress-model';

/**
 * The published titles of lessons, for keeping the titles saved with the learner's progress current (APP-011, PROG-001). Pure rules: no React, no storage, no
 * requests. A lesson renamed in the CMS is titled by the published catalog from then on; the title saved when the learner opened or completed it is only the fallback
 * for when the catalog cannot be reached, and it is replaced (titles only, see `withCurrentTitles`) the next time the live catalog is known.
 */

/**
 * Every lesson of a course page with the title the catalog gives it at the page's level: the modules' lessons first, then lessons placed directly in the course.
 * A lesson without a usable title is left out, so it never blanks a saved one.
 */
export function catalogTitlesOf(course: CourseResponse): TitledLesson[] {
  const out: TitledLesson[] = [];
  const add = (lessons: unknown) => {
    if (!Array.isArray(lessons)) return;
    for (const lesson of lessons as Partial<{ lessonId: unknown; title: unknown }>[]) {
      if (lesson && typeof lesson.lessonId === 'string' && typeof lesson.title === 'string' && lesson.title.trim().length > 0) {
        out.push({ lessonId: lesson.lessonId, level: course.level, title: lesson.title });
      }
    }
  };
  if (Array.isArray(course.modules)) for (const catalogModule of course.modules) add(catalogModule?.lessons);
  add(course.directLessons);
  return out;
}

/**
 * The courses whose page is worth asking for to title `lessonIds`: the ones the course list says contain at least one of them. A course whose list of lessons is
 * not known (a saved list from before ids were included) is asked for too, as long as it has lessons, because nothing says it does not contain one.
 */
export function coursesHolding(courses: readonly CourseListItem[], lessonIds: readonly string[]): string[] {
  if (lessonIds.length === 0) return [];
  const wanted = new Set(lessonIds);
  const out: string[] = [];
  for (const course of courses) {
    const ids = course.lessonIds;
    const holds = Array.isArray(ids) && ids.every((id) => typeof id === 'string') ? ids.some((id) => wanted.has(id)) : course.lessonCount > 0;
    if (holds) out.push(course.courseId);
  }
  return out;
}
