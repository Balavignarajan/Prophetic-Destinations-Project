import type { CourseBook, LearningLevel } from '../../../shared-kernel/index.js';
import type {
  CatalogLessonEntry,
  CatalogLevelContent,
} from './catalog-snapshot.js';

/**
 * The learner-facing view of a stored catalog snapshot (pure rules; no database).
 *
 * The stored snapshot is the structure and the approved summaries; what a learner may SEE is that snapshot
 * filtered by live state: a listed lesson is shown only while it still has an active lesson publication
 * at the requested level (the caller passes that set from the database). Modules left without a lesson
 * are omitted, and a course left without any lesson has no view at all. Next/previous are computed over
 * what remains, in the snapshot's own order, so an ineligible lesson is skipped and never named.
 */
export interface PublishedLessonSummary {
  lessonId: string;
  moduleId: string | null;
  title: string;
  shortTitle: string | null;
  subtitle: string | null;
  estimatedMinutes: number | null;
  /** Published cover image of the lesson, or null (also for snapshots written before covers existed). */
  coverMediaId: string | null;
}

export interface PublishedLessonItem extends PublishedLessonSummary {
  previousLessonId: string | null;
  nextLessonId: string | null;
}

export interface PublishedModuleView {
  moduleId: string;
  title: string;
  description: string | null;
  lessons: PublishedLessonItem[];
}

export interface PublishedCourseView {
  courseId: string;
  level: LearningLevel;
  catalogVersion: number;
  title: string;
  description: string | null;
  /** Published cover image of the course, or null (also for snapshots written before covers existed). */
  coverMediaId: string | null;
  /** The course's CMS-managed Bible book (the dedicated Daniel / Revelation Home entry), or null. Set by the catalog service from the live course row. */
  book?: CourseBook | null;
  moduleCount: number;
  lessonCount: number;
  modules: PublishedModuleView[];
  directLessons: PublishedLessonItem[];
}

export interface LessonNavigation {
  lessonId: string;
  level: LearningLevel;
  courseId: string;
  /** The lesson's module, or null for a lesson placed directly in the course (it has no module). */
  moduleId: string | null;
  catalogVersion: number;
  previous: PublishedLessonSummary | null;
  next: PublishedLessonSummary | null;
}

/**
 * The modules of a stored snapshot. A snapshot is written only by this application, so a row without the
 * expected shape means corruption; it is treated as listing nothing (the course is simply not shown) rather
 * than failing every learner request that happens to read it.
 */
function modulesOf(
  content: CatalogLevelContent,
): CatalogLevelContent['modules'] {
  return Array.isArray(content?.modules)
    ? content.modules.filter((module) => Array.isArray(module?.lessons))
    : [];
}

function summaryOf(
  lesson: CatalogLessonEntry,
  moduleId: string | null,
): PublishedLessonSummary {
  return {
    lessonId: lesson.id,
    moduleId,
    title: lesson.title,
    shortTitle: lesson.shortTitle,
    subtitle: lesson.subtitle,
    estimatedMinutes: lesson.estimatedMinutes,
    coverMediaId: lesson.coverMediaId ?? null,
  };
}

/** The eligible lessons of a snapshot as one flat sequence: module order, then lesson order. */
export function eligibleSequence(
  content: CatalogLevelContent,
  eligible: ReadonlySet<string>,
): PublishedLessonSummary[] {
  return [...(content.directLessons ?? []).filter((lesson) => eligible.has(lesson.id)).map((lesson) => summaryOf(lesson, null)), ...modulesOf(content).flatMap((module) =>
    module.lessons
      .filter((lesson) => eligible.has(lesson.id))
      .map((lesson) => summaryOf(lesson, module.id)),
  )];
}

/** Every lesson id a snapshot lists (used to ask the database which of them are eligible now). */
export function listedLessonIds(content: CatalogLevelContent): string[] {
  return [...(content.directLessons ?? []).map((lesson) => lesson.id), ...modulesOf(content).flatMap((module) =>
    module.lessons.map((lesson) => lesson.id),
  )];
}

/** The view of one course at one level, or null when nothing in it is eligible. */
export function toCourseView(
  content: CatalogLevelContent,
  catalogVersion: number,
  eligible: ReadonlySet<string>,
): PublishedCourseView | null {
  const sequence = eligibleSequence(content, eligible);
  if (sequence.length === 0) return null;

  const neighbours = new Map<
    string,
    { previous: string | null; next: string | null }
  >();
  sequence.forEach((lesson, index) => {
    neighbours.set(lesson.lessonId, {
      previous: sequence[index - 1]?.lessonId ?? null,
      next: sequence[index + 1]?.lessonId ?? null,
    });
  });

  const modules: PublishedModuleView[] = [];
  for (const module of modulesOf(content)) {
    const lessons: PublishedLessonItem[] = module.lessons
      .filter((lesson) => eligible.has(lesson.id))
      .map((lesson) => ({
        ...summaryOf(lesson, module.id),
        previousLessonId: neighbours.get(lesson.id)!.previous,
        nextLessonId: neighbours.get(lesson.id)!.next,
      }));
    if (lessons.length > 0) {
      modules.push({
        moduleId: module.id,
        title: module.title,
        description: module.description,
        lessons,
      });
    }
  }
  const directLessons: PublishedLessonItem[] = (content.directLessons ?? []).filter((lesson) => eligible.has(lesson.id)).map((lesson) => ({ ...summaryOf(lesson, null), previousLessonId: neighbours.get(lesson.id)!.previous, nextLessonId: neighbours.get(lesson.id)!.next }));

  return {
    courseId: content.course.id,
    level: content.level,
    catalogVersion,
    title: content.course.title,
    description: content.course.description,
    coverMediaId: content.course.coverMediaId ?? null,
    moduleCount: modules.length,
    lessonCount: sequence.length,
    modules,
    directLessons,
  };
}

/**
 * Fills in each lesson's cover from `covers` (lesson id -> cover of its ACTIVE lesson snapshot). Catalog snapshots do not
 * carry lesson covers, so this is the only source and it always matches what the lesson media route will serve.
 */
export function withLessonCovers(
  view: PublishedCourseView,
  covers: ReadonlyMap<string, string>,
): PublishedCourseView {
  const apply = (lesson: PublishedLessonItem): PublishedLessonItem => ({
    ...lesson,
    coverMediaId: covers.get(lesson.lessonId) ?? null,
  });
  return {
    ...view,
    modules: view.modules.map((module) => ({ ...module, lessons: module.lessons.map(apply) })),
    directLessons: view.directLessons.map(apply),
  };
}

/**
 * Previous and next eligible lesson of `lessonId`, or null if the lesson is not itself an eligible
 * entry of this catalog version (then it has no navigation).
 */
export function navigationFor(
  content: CatalogLevelContent,
  catalogVersion: number,
  lessonId: string,
  eligible: ReadonlySet<string>,
): LessonNavigation | null {
  const sequence = eligibleSequence(content, eligible);
  const index = sequence.findIndex((lesson) => lesson.lessonId === lessonId);
  if (index === -1) return null;
  return {
    lessonId,
    level: content.level,
    courseId: content.course.id,
    moduleId: sequence[index].moduleId,
    catalogVersion,
    previous: sequence[index - 1] ?? null,
    next: sequence[index + 1] ?? null,
  };
}
