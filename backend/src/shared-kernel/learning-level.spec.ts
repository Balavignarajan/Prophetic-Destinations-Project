import { LEARNING_LEVELS, isLearningLevel } from './learning-level.js';

describe('learning levels', () => {
  it('are exactly BEGINNER, INTERMEDIATE and ADVANCED, in that order', () => {
    expect(LEARNING_LEVELS).toEqual(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
  });

  it('rejects anything else', () => {
    expect(isLearningLevel('ADVANCED')).toBe(true);
    expect(isLearningLevel('advanced')).toBe(false);
    expect(isLearningLevel('EXPERT')).toBe(false);
    expect(isLearningLevel(undefined)).toBe(false);
  });
});
