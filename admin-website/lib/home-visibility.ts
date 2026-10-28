import { api } from './api';
import type { HomeEntry, LearningLevel } from './types';

/**
 * What learners actually see on the Home screen, asked of the SERVER instead of worked out here. The learner app reads two public, read-only routes: GET /home-entries?level= (the topics
 * available at a level, in the administrators' order, each with how many courses and lessons a learner can open) and GET /home-entries/:id/courses?level= (those courses). Both apply the real
 * rules (the entry is enabled; at least one assigned course is published; it has published lessons at that level), so the Admin reuses them for the visibility badges and for the Home
 * preview and never repeats the rules in the browser. Asking is read-only and changes nothing.
 */
export const HOME_LEVELS: readonly LearningLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
export const HOME_LEVEL_NAMES: Record<LearningLevel, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

/** One topic as the learner app receives it. */
export interface LearnerHomeEntry {
  entryId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  imageMediaId: string | null;
  courseCount: number;
  lessonCount: number;
  coverCourseId: string | null;
  coverMediaId: string | null;
}

/** One course of a topic as the learner app receives it (the fields the preview shows). */
export interface LearnerHomeCourse {
  courseId: string;
  title: string;
  description: string | null;
  coverMediaId: string | null;
  moduleCount: number;
  lessonCount: number;
}

export async function fetchLearnerHome(level: LearningLevel, signal?: AbortSignal): Promise<LearnerHomeEntry[]> {
  const body = await api.request<{ entries?: LearnerHomeEntry[] }>(`/home-entries?level=${level}`, { signal });
  return Array.isArray(body?.entries) ? body.entries : [];
}

/** The courses a learner can open in one topic at a level. A topic that stopped being visible meanwhile (the server answers 404) simply has none. */
export async function fetchLearnerHomeCourses(entryId: string, level: LearningLevel, signal?: AbortSignal): Promise<LearnerHomeCourse[]> {
  try {
    const body = await api.request<{ courses?: LearnerHomeCourse[] }>(`/home-entries/${entryId}/courses?level=${level}`, { signal });
    return Array.isArray(body?.courses) ? body.courses : [];
  } catch (error) {
    if ((error as { status?: number } | null)?.status === 404) return [];
    throw error;
  }
}

type ByLevel = Record<LearningLevel, Map<string, LearnerHomeEntry>>;

/** What the server says about every topic at every level: all or nothing, so a partial answer is never shown as if it were complete. */
export async function fetchVisibility(signal?: AbortSignal): Promise<ByLevel> {
  const [beginner, intermediate, advanced] = await Promise.all(HOME_LEVELS.map((level) => fetchLearnerHome(level, signal)));
  const toMap = (list: LearnerHomeEntry[]) => new Map(list.map((entry) => [entry.entryId, entry]));
  return { BEGINNER: toMap(beginner), INTERMEDIATE: toMap(intermediate), ADVANCED: toMap(advanced) };
}

export type VisibilityData = { status: 'loading' } | { status: 'error' } | { status: 'ready'; byLevel: ByLevel };

export type Visibility =
  /** The server is being asked. */
  | { kind: 'checking' }
  /** The server could not be asked: nothing is claimed. */
  | { kind: 'unknown' }
  | { kind: 'disabled' }
  | { kind: 'hidden'; why: string }
  | { kind: 'visible'; levels: LearningLevel[]; perLevel: Partial<Record<LearningLevel, { courses: number; lessons: number }>> };

/** Why an enabled entry that no level shows is hidden, in words, from what the Admin list already holds (the server's answer is that it IS hidden; this only explains the likely reason). */
function hiddenReason(entry: HomeEntry): string {
  if (entry.courses.length === 0) return 'No course is assigned to it.';
  if (!entry.courses.some((course) => course.status === 'PUBLISHED')) return 'None of its courses is published yet.';
  return 'Its published courses have no published lessons at any learning level.';
}

/** Whether, and at which levels, learners see this entry: from the server's answer, never guessed from course statuses. A disabled entry is hidden whatever the answer says. */
export function entryVisibility(entry: HomeEntry, data: VisibilityData): Visibility {
  if (!entry.isEnabled) return { kind: 'disabled' };
  if (data.status === 'loading') return { kind: 'checking' };
  if (data.status === 'error') return { kind: 'unknown' };
  const levels: LearningLevel[] = [];
  const perLevel: Partial<Record<LearningLevel, { courses: number; lessons: number }>> = {};
  for (const level of HOME_LEVELS) {
    const found = data.byLevel[level].get(entry.id);
    if (found) {
      levels.push(level);
      perLevel[level] = { courses: found.courseCount, lessons: found.lessonCount };
    }
  }
  return levels.length === 0 ? { kind: 'hidden', why: hiddenReason(entry) } : { kind: 'visible', levels, perLevel };
}

/** The cover of the entry's first published course that has one, which the app shows on the card when the entry has no picture of its own; null when none (or not yet known). */
export function fallbackCoverId(entryId: string, data: VisibilityData): string | null {
  if (data.status !== 'ready') return null;
  for (const level of HOME_LEVELS) {
    const found = data.byLevel[level].get(entryId);
    if (found?.coverMediaId) return found.coverMediaId;
  }
  return null;
}

/** The short label of a visibility, always stating the levels when it is not all of them. */
export function visibilityLabel(visibility: Visibility): string {
  switch (visibility.kind) {
    case 'checking':
      return 'Checking visibility…';
    case 'unknown':
      return 'Visibility unknown';
    case 'disabled':
      return 'Hidden — Disabled';
    case 'hidden':
      return 'Hidden — No eligible published courses';
    case 'visible':
      return visibility.levels.length === HOME_LEVELS.length ? 'Visible at all 3 levels' : `Visible at ${visibility.levels.length} of ${HOME_LEVELS.length} levels`;
  }
}
