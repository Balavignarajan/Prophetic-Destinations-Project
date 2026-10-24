import { LEARNING_LEVELS, LEVEL_LABELS, type LearningLevel } from '@/learning/levels';

/**
 * Which learning levels have lessons saved on this device (LESS-002). Pure: it only counts what the cache index already lists, so it needs no scan of the saved
 * lessons and no request. Offline copies are kept per lesson AND level, so the count of one level says nothing about another.
 */
export type SavedByLevel = Record<LearningLevel, number>;

type IndexEntry = { kind: string; level: LearningLevel };

/** How many lessons are saved at each level (course lists, previous/next lists and related lists are not lessons and are not counted). */
export function savedLessonsByLevel(entries: readonly IndexEntry[]): SavedByLevel {
  const counts: SavedByLevel = { BEGINNER: 0, INTERMEDIATE: 0, ADVANCED: 0 };
  for (const entry of entries) if (entry.kind === 'lesson' && entry.level in counts) counts[entry.level] += 1;
  return counts;
}

const lessons = (count: number) => (count === 1 ? '1 lesson' : `${count} lessons`);

/**
 * "Saved for offline reading: Beginner 3 lessons · Intermediate none · Advanced 1 lesson", or null when nothing is saved at any level (a learner who has saved
 * nothing is not shown a list of "none"). It states what is on the device, not what is available: it never claims a level is complete or up to date.
 */
export function savedLevelsLine(counts: SavedByLevel): string | null {
  if (LEARNING_LEVELS.every((level) => counts[level] === 0)) return null;
  return `Saved for offline reading: ${LEARNING_LEVELS.map((level) => `${LEVEL_LABELS[level]} ${counts[level] === 0 ? 'none' : lessons(counts[level])}`).join(' · ')}`;
}
