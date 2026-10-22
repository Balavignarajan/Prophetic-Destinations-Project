import type { LearningLevel, LessonBlock } from './types.ts';

/** Resolve what the editor should show at a level; hidden blocks still show their shared content. */
export function blockContentAtLevel(block: LessonBlock, level: LearningLevel) {
  return block.levels.find((entry) => entry.level === level)?.content ?? block.sharedContent;
}

/** A visibility change would remove or replace a stored level-specific value. */
export function hasStoredLevelContent(block: LessonBlock, level: LearningLevel): boolean {
  return block.levels.some((entry) => entry.level === level && entry.content !== null);
}
