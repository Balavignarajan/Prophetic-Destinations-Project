/** The three learning levels. Fixed by the client; not configurable data. */
export const LEARNING_LEVELS = [
  'beginner',
  'intermediate',
  'advanced',
] as const;

export type LearningLevel = (typeof LEARNING_LEVELS)[number];

export function isLearningLevel(value: unknown): value is LearningLevel {
  return LEARNING_LEVELS.includes(value as LearningLevel);
}
