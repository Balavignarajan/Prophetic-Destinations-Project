import { LEARNING_LEVELS, isLearningLevel } from './learning-level.js';

describe('learning levels', () => {
  it('are exactly beginner, intermediate and advanced', () => {
    expect(LEARNING_LEVELS).toEqual(['beginner', 'intermediate', 'advanced']);
  });

  it('rejects anything else', () => {
    expect(isLearningLevel('advanced')).toBe(true);
    expect(isLearningLevel('expert')).toBe(false);
    expect(isLearningLevel(undefined)).toBe(false);
  });
});
