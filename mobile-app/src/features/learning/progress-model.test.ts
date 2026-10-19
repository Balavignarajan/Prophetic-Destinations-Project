// Run with: npm test  (Node's built-in test runner, no extra dependency)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_POSITIONS,
  type LessonRef,
  type ProgressState,
  completedLessons,
  continueTarget,
  lessonKey,
  parseProgress,
  shouldRestore,
  summarise,
  unfinishedLessons,
  withPosition,
} from './progress-model.ts';

const lesson = (id: string, level: LessonRef['level'] = 'BEGINNER'): LessonRef => ({ lessonId: id, level, courseId: 'c1', title: `Lesson ${id}` });
const empty = (): ProgressState => ({ lastOpened: null, completed: {}, positions: {} });
const withPos = (state: ProgressState, ref: LessonRef, offset: number, at: number): ProgressState => ({
  ...state,
  positions: withPosition(state.positions, ref, offset, at),
});
const complete = (state: ProgressState, ref: LessonRef, at = 1): ProgressState => ({
  ...state,
  completed: { ...state.completed, [lessonKey(ref.lessonId, ref.level)]: { title: ref.title, completedAt: at } },
});

describe('reading position', () => {
  it('stores whole, non-negative offsets for a lesson and level', () => {
    const p = withPosition({}, lesson('a'), 412.6, 10);
    assert.equal(p[lessonKey('a', 'BEGINNER')].offset, 413);
    assert.equal(withPosition({}, lesson('a'), -5, 1)[lessonKey('a', 'BEGINNER')].offset, 0);
    assert.equal(withPosition({}, lesson('a'), Number.NaN, 1)[lessonKey('a', 'BEGINNER')].offset, 0);
  });
  it('keeps one position per lesson and level', () => {
    let p = withPosition({}, lesson('a', 'BEGINNER'), 100, 1);
    p = withPosition(p, lesson('a', 'ADVANCED'), 300, 2);
    p = withPosition(p, lesson('a', 'BEGINNER'), 150, 3);
    assert.equal(Object.keys(p).length, 2);
    assert.equal(p[lessonKey('a', 'BEGINNER')].offset, 150);
    assert.equal(p[lessonKey('a', 'ADVANCED')].offset, 300);
  });
  it('drops the oldest positions beyond the cap', () => {
    let p = {};
    for (let i = 0; i < MAX_POSITIONS + 5; i += 1) p = withPosition(p, lesson(`l${i}`), 50, i);
    assert.equal(Object.keys(p).length, MAX_POSITIONS);
    assert.ok(!(lessonKey('l0', 'BEGINNER') in p) && lessonKey(`l${MAX_POSITIONS + 4}`, 'BEGINNER') in p);
  });
  it('restores only a meaningful offset', () => {
    assert.equal(shouldRestore(0), false);
    assert.equal(shouldRestore(10), false);
    assert.equal(shouldRestore(24), true);
    assert.equal(shouldRestore(undefined), false);
  });
});

describe('Continue Learning', () => {
  it('is empty when nothing was started', () => {
    assert.equal(continueTarget(empty()), null);
  });
  it('offers the most recently read unfinished lesson, with its position', () => {
    let s = withPos(empty(), lesson('a'), 200, 100);
    s = withPos(s, lesson('b'), 640, 200);
    const target = continueTarget(s);
    assert.equal(target?.lessonId, 'b');
    assert.equal(target?.offset, 640);
  });
  it('never offers a completed lesson (it is shown only when unfinished progress exists)', () => {
    let s = withPos(empty(), lesson('a'), 200, 100);
    s = { ...s, lastOpened: { ...lesson('a'), openedAt: 150 } };
    s = complete(s, lesson('a'));
    assert.equal(continueTarget(s), null);
    assert.deepEqual(unfinishedLessons(s), []);
  });
  it('falls back to the last opened lesson when no position was saved yet', () => {
    const s: ProgressState = { ...empty(), lastOpened: { ...lesson('x'), openedAt: 5 } };
    const t = continueTarget(s);
    assert.equal(t?.lessonId, 'x');
    assert.equal(t?.offset, 0);
  });
  it('skips a completed last-opened lesson and offers the next unfinished one', () => {
    let s = withPos(empty(), lesson('a'), 300, 100);
    s = { ...s, lastOpened: { ...lesson('b'), openedAt: 500 } };
    s = complete(s, lesson('b'));
    assert.equal(continueTarget(s)?.lessonId, 'a');
  });
  it('reopening a completed lesson at another level is judged per level', () => {
    let s = withPos(empty(), lesson('a', 'ADVANCED'), 300, 100);
    s = complete(s, lesson('a', 'BEGINNER'));
    assert.equal(continueTarget(s)?.level, 'ADVANCED');
  });
});

describe('progress summary', () => {
  it('counts completed (all levels and this level), in progress, and remaining', () => {
    let s = empty();
    s = complete(s, lesson('a', 'BEGINNER'), 1);
    s = complete(s, lesson('b', 'BEGINNER'), 2);
    s = complete(s, lesson('c', 'ADVANCED'), 3);
    s = withPos(s, lesson('d'), 100, 4);
    const sum = summarise(s, 'BEGINNER', 10);
    assert.deepEqual(sum, { completed: 3, inProgress: 1, completedAtLevel: 2, remainingAtLevel: 8 });
  });
  it('never reports negative remaining and says unknown when the total is unknown', () => {
    const s = complete(complete(empty(), lesson('a')), lesson('b'));
    assert.equal(summarise(s, 'BEGINNER', 1).remainingAtLevel, 0);
    assert.equal(summarise(s, 'BEGINNER', null).remainingAtLevel, null);
  });
  it('lists completed lessons most recent first', () => {
    let s = complete(empty(), lesson('old'), 1);
    s = complete(s, lesson('new'), 9);
    assert.deepEqual(completedLessons(s).map((l) => l.lessonId), ['new', 'old']);
  });
  it('computes no overall percentage (the formula is an open product decision)', () => {
    assert.equal('percent' in summarise(empty(), 'BEGINNER', 5), false);
  });
});

describe('reading what was saved (backward compatible)', () => {
  const v1Old = {
    version: 1,
    lastOpened: { lessonId: 'a', level: 'BEGINNER', courseId: 'c', title: 'A', openedAt: 5 },
    completed: { 'a:BEGINNER': { title: 'A', completedAt: 6 } },
  };
  it('a value saved before positions existed still loads, with no positions and nothing lost', () => {
    const p = parseProgress(v1Old);
    assert.ok(p);
    assert.deepEqual(p.positions, {});
    assert.equal(p.lastOpened?.lessonId, 'a');
    assert.deepEqual(Object.keys(p.completed), ['a:BEGINNER']);
  });
  it('round-trips positions', () => {
    const s = withPos(empty(), lesson('z', 'INTERMEDIATE'), 777, 42);
    const back = parseProgress(JSON.parse(JSON.stringify({ version: 1, ...s })));
    assert.deepEqual(back?.positions, s.positions);
  });
  it('drops a damaged entry without losing the rest', () => {
    const p = parseProgress({
      ...v1Old,
      positions: { good: { lessonId: 'g', level: 'BEGINNER', courseId: null, title: 'G', offset: 90, savedAt: 1 }, bad: { lessonId: 5 }, neg: { lessonId: 'n', level: 'BEGINNER', title: 'N', offset: -3, savedAt: 1 } },
    });
    assert.deepEqual(Object.keys(p?.positions ?? {}), ['g:BEGINNER']);
    assert.equal(Object.keys(p?.completed ?? {}).length, 1);
  });
  it('rejects anything that is not a version-1 record', () => {
    assert.equal(parseProgress(null), null);
    assert.equal(parseProgress({ version: 2 }), null);
    assert.equal(parseProgress('x'), null);
  });
});
