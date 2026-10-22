import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blockContentAtLevel, hasStoredLevelContent } from './block-level-state.ts';
import type { LessonBlock } from './types.ts';

test('level content is displayed and protected without changing the shared value', () => {
  const shared = { title: 'Shared' };
  const custom = { title: 'Advanced' };
  const block: LessonBlock = {
    id: 'block', lessonId: 'lesson', type: 'SECTION_INTRO', position: 1,
    sharedContent: shared, levels: [{ level: 'BEGINNER', content: null }, { level: 'ADVANCED', content: custom }],
    version: 1, createdAt: '', updatedAt: '',
  };
  assert.deepEqual(blockContentAtLevel(block, 'ADVANCED'), custom);
  assert.deepEqual(blockContentAtLevel(block, 'BEGINNER'), shared);
  assert.deepEqual(blockContentAtLevel(block, 'INTERMEDIATE'), shared);
  assert.equal(hasStoredLevelContent(block, 'ADVANCED'), true);
  assert.equal(hasStoredLevelContent(block, 'BEGINNER'), false);
  assert.equal(hasStoredLevelContent(block, 'INTERMEDIATE'), false);
  assert.deepEqual(block.sharedContent, shared);
});
