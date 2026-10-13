/** The three learning levels the backend serves. Every learner request names exactly one (upper case). */
export const LEARNING_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type LearningLevel = (typeof LEARNING_LEVELS)[number];

export const DEFAULT_LEARNING_LEVEL: LearningLevel = 'BEGINNER';

export const LEVEL_LABELS: Record<LearningLevel, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
};

export function isLearningLevel(value: unknown): value is LearningLevel {
  return typeof value === 'string' && (LEARNING_LEVELS as readonly string[]).includes(value);
}

/** A route parameter may arrive as a string, a list, or nothing; this gives a valid level either way. */
export function levelFromParam(value: string | string[] | undefined): LearningLevel {
  const first = Array.isArray(value) ? value[0] : value;
  return isLearningLevel(first) ? first : DEFAULT_LEARNING_LEVEL;
}

export function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}
