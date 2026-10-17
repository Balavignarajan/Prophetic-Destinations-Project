import { DEFAULT_LEARNING_LEVEL, type LearningLevel, isLearningLevel } from './levels';
import { useLearningLevel } from './use-learning-level';

/**
 * The learning level for a course or lesson screen. Links from the app always carry `?level=`; for a link that does not (an old
 * deep link), the learner's saved level is used, not a silent default. `ready` is false only while that saved level is read.
 */
export function useRouteLevel(param: string | string[] | undefined): { level: LearningLevel; ready: boolean } {
  const saved = useLearningLevel();
  const first = Array.isArray(param) ? param[0] : param;
  if (isLearningLevel(first)) return { level: first, ready: true };
  return { level: saved.ready ? saved.level : DEFAULT_LEARNING_LEVEL, ready: saved.ready };
}
