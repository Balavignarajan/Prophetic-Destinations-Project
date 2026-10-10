/**
 * The three learning levels. Fixed by the client; not configurable data.
 * Stored and exposed in this exact (upper-case) form everywhere, like Role and ContentStatus.
 */
export const LEARNING_LEVELS = [
  'BEGINNER',
  'INTERMEDIATE',
  'ADVANCED',
] as const;

export type LearningLevel = (typeof LEARNING_LEVELS)[number];

export function isLearningLevel(value: unknown): value is LearningLevel {
  return LEARNING_LEVELS.includes(value as LearningLevel);
}
