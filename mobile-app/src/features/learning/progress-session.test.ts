// Run with: npm test  (Node's built-in test runner, no extra dependency)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { LessonRef, QuizResult } from './progress-model.ts';
import { type SessionIo, type SessionLoad, type SessionProgress, createProgressSession } from './progress-session.ts';

const empty: SessionProgress = { version: 1, lastOpened: null, completed: {}, positions: {}, quizResults: {} };

const lesson = (id: string, level: LessonRef['level'] = 'BEGINNER'): LessonRef => ({ lessonId: id, level, courseId: 'c1', title: `Lesson ${id}` });

const quiz = (lessonId: string): QuizResult => ({
  lessonId,
  level: 'BEGINNER',
  blockId: 'b1',
  quizId: 'q1',
  contentHash: 'h1',
  lessonTitle: `Lesson ${lessonId}`,
  score: 1,
  total: 2,
  completedAt: 5,
  answers: { x: 'y' },
});

/** Progress that was saved earlier: one lesson opened, one completed. */
const existing: SessionProgress = {
  version: 1,
  lastOpened: { ...lesson('old'), openedAt: 1 },
  completed: { 'done:BEGINNER': { title: 'Done', completedAt: 2 } },
  positions: {},
  quizResults: {},
};

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function gate() {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open: () => open() };
}

/**
 * A fake storage that behaves like store.ts: reads, writes and clears run one after another, in the order requested. `stored` is what the "disk"
 * holds; the flags make operations fail; a gate makes reads or writes wait until the test lets them continue.
 */
function makeWorld(stored: SessionProgress | null) {
  const world = {
    stored,
    loadFails: null as 'unreadable' | 'invalid' | null,
    saveFails: false,
    clearFails: false,
    loads: 0,
    saves: [] as SessionProgress[],
    clears: 0,
    loadGate: null as Promise<void> | null,
    saveGate: null as Promise<void> | null,
  };
  let queue: Promise<unknown> = Promise.resolve();
  const inOrder = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };
  const io: SessionIo = {
    load: () =>
      inOrder(async (): Promise<SessionLoad> => {
        world.loads += 1;
        if (world.loadGate) await world.loadGate;
        if (world.loadFails) return { status: world.loadFails };
        return { status: 'ok', progress: world.stored ?? empty };
      }),
    save: (progress) =>
      inOrder(async () => {
        world.saves.push(progress);
        if (world.saveGate) await world.saveGate;
        if (world.saveFails) return false;
        world.stored = progress;
        return true;
      }),
    clear: () =>
      inOrder(async () => {
        world.clears += 1;
        if (world.clearFails) return false;
        world.stored = null;
        return true;
      }),
  };
  return { io, world };
}

function storedOf(world: { stored: SessionProgress | null }): SessionProgress {
  assert.ok(world.stored, 'something should be stored');
  return world.stored;
}

describe('first read', () => {
  it('starts a new learner (nothing saved) from empty progress, and then saves normally', async () => {
    const { io, world } = makeWorld(null);
    const session = createProgressSession(io, empty);
    session.start();
    await settle();
    assert.equal(session.getSnapshot().status, 'ready');
    assert.equal(world.saves.length, 0, 'reading writes nothing');

    session.setCompleted(lesson('a'), true);
    await settle();
    assert.deepEqual(Object.keys(storedOf(world).completed), ['a:BEGINNER']);
    assert.equal(session.getSnapshot().saveFailed, false);
  });

  it('restores existing progress without writing anything', async () => {
    const { io, world } = makeWorld(existing);
    const session = createProgressSession(io, empty);
    session.start();
    await settle();
    const snapshot = session.getSnapshot();
    assert.equal(snapshot.status, 'ready');
    assert.equal(snapshot.progress.lastOpened?.lessonId, 'old');
    assert.deepEqual(Object.keys(snapshot.progress.completed), ['done:BEGINNER']);
    assert.equal(world.saves.length, 0);
  });

  it('reads only once however often it is started', async () => {
    const { io, world } = makeWorld(null);
    const session = createProgressSession(io, empty);
    session.start();
    session.start();
    await settle();
    assert.equal(world.loads, 1);
  });
});

describe('a storage read error', () => {
  it('never writes over the saved value, drops changes, and restores everything on a successful retry', async () => {
    const { io, world } = makeWorld(existing);
    world.loadFails = 'unreadable';
    const session = createProgressSession(io, empty);
    session.start();
    await settle();
    assert.equal(session.getSnapshot().status, 'unreadable');

    session.recordOpened(lesson('a'));
    session.savePosition(lesson('a'), 400);
    session.setCompleted(lesson('a'), true);
    assert.equal(await session.recordQuizResult(quiz('a')), false);
    await settle();
    assert.equal(world.saves.length, 0, 'nothing is written against an unknown baseline');
    assert.equal(world.clears, 0);
    assert.equal(world.stored, existing, 'the saved value is untouched');
    assert.equal(session.getSnapshot().progress, empty, 'changes were not applied to an unknown baseline');

    world.loadFails = null;
    assert.equal(await session.retryLoad(), true);
    const snapshot = session.getSnapshot();
    assert.equal(snapshot.status, 'ready');
    assert.equal(snapshot.progress.lastOpened?.lessonId, 'old', 'the dropped changes were not replayed');
    assert.deepEqual(Object.keys(snapshot.progress.completed), ['done:BEGINNER']);
    assert.equal(world.saves.length, 0);

    session.savePosition(lesson('a'), 300);
    await settle();
    const stored = storedOf(world);
    assert.deepEqual(Object.keys(stored.completed), ['done:BEGINNER'], 'earlier progress is kept');
    assert.equal(stored.positions['a:BEGINNER']?.offset, 300);
  });

  it('shares one read between rapid retries', async () => {
    const { io, world } = makeWorld(existing);
    world.loadFails = 'unreadable';
    const session = createProgressSession(io, empty);
    session.start();
    await settle();

    world.loadFails = null;
    const held = gate();
    world.loadGate = held.promise;
    const first = session.retryLoad();
    const second = session.retryLoad();
    assert.equal(session.getSnapshot().retrying, true);
    held.open();
    assert.deepEqual(await Promise.all([first, second]), [true, true]);
    assert.equal(world.loads, 2, 'the first read plus one retry');
    assert.equal(session.getSnapshot().retrying, false);
  });
});

describe('damaged stored data', () => {
  it('is not replaced by empty progress and not deleted, until the learner explicitly resets', async () => {
    const { io, world } = makeWorld(existing);
    world.loadFails = 'invalid';
    const session = createProgressSession(io, empty);
    session.start();
    await settle();
    assert.equal(session.getSnapshot().status, 'invalid');
    session.setCompleted(lesson('a'), true);
    await settle();
    assert.equal(world.saves.length, 0);
    assert.equal(world.clears, 0, 'nothing is deleted automatically');
    assert.equal(world.stored, existing);

    assert.equal(await session.retryLoad(), false, 'still damaged');
    assert.equal(session.getSnapshot().status, 'invalid');
    assert.equal(session.getSnapshot().retrying, false);

    assert.equal(await session.reset(), true);
    assert.equal(world.clears, 1);
    assert.equal(world.stored, null);
    assert.equal(session.getSnapshot().status, 'ready');
    assert.equal(session.getSnapshot().progress, empty);
  });

  it('stays unavailable when the explicit reset itself fails', async () => {
    const { io, world } = makeWorld(existing);
    world.loadFails = 'invalid';
    world.clearFails = true;
    const session = createProgressSession(io, empty);
    session.start();
    await settle();
    assert.equal(await session.reset(), false);
    assert.equal(session.getSnapshot().status, 'invalid');
    assert.equal(world.stored, existing);
  });
});

describe('changes while the first read is running', () => {
  it('are queued in order and applied on top of what was read, in a single write', async () => {
    const { io, world } = makeWorld(existing);
    const held = gate();
    world.loadGate = held.promise;
    const session = createProgressSession(io, empty);
    session.start();

    session.recordOpened(lesson('a'));
    session.setCompleted(lesson('a'), true);
    session.setCompleted(lesson('a'), false);
    assert.equal(session.getSnapshot().status, 'loading');
    assert.equal(world.saves.length, 0, 'nothing is written before the read finishes');

    held.open();
    await settle();
    const snapshot = session.getSnapshot();
    assert.equal(snapshot.status, 'ready');
    assert.equal(snapshot.progress.lastOpened?.lessonId, 'a');
    assert.deepEqual(Object.keys(snapshot.progress.completed), ['done:BEGINNER'], 'complete then undo ends not completed, and the earlier completion is kept');
    assert.equal(world.saves.length, 1);
    const stored = storedOf(world);
    assert.equal(stored.lastOpened?.lessonId, 'a');
    assert.deepEqual(Object.keys(stored.completed), ['done:BEGINNER']);
  });

  it('are dropped, never written, when the read fails; a waiting quiz result resolves as not saved', async () => {
    const { io, world } = makeWorld(existing);
    const held = gate();
    world.loadGate = held.promise;
    world.loadFails = 'unreadable';
    const session = createProgressSession(io, empty);
    session.start();

    const waiting = session.recordQuizResult(quiz('a'));
    session.recordOpened(lesson('a'));
    held.open();
    assert.equal(await waiting, false);
    await settle();
    assert.equal(session.getSnapshot().status, 'unreadable');
    assert.equal(world.saves.length, 0);

    world.loadFails = null;
    assert.equal(await session.retryLoad(), true);
    const snapshot = session.getSnapshot();
    assert.equal(snapshot.progress.lastOpened?.lessonId, 'old');
    assert.deepEqual(snapshot.progress.quizResults, {});
    assert.equal(world.saves.length, 0);
  });
});

describe('writing', () => {
  it('reports a failed write as not saved, keeps the latest state, and saves it on retry', async () => {
    const { io, world } = makeWorld(null);
    const session = createProgressSession(io, empty);
    session.start();
    await settle();

    assert.equal(await session.recordQuizResult(quiz('a')), true);
    assert.deepEqual(Object.keys(storedOf(world).quizResults), ['a:BEGINNER:b1']);

    world.saveFails = true;
    assert.equal(await session.recordQuizResult(quiz('b')), false);
    const failed = session.getSnapshot();
    assert.equal(failed.saveFailed, true);
    assert.ok(failed.progress.quizResults['b:BEGINNER:b1'], 'the latest state stays in memory');
    assert.deepEqual(Object.keys(storedOf(world).quizResults), ['a:BEGINNER:b1'], 'the stored copy is unchanged');

    world.saveFails = false;
    assert.equal(await session.retrySave(), true);
    assert.equal(session.getSnapshot().saveFailed, false);
    assert.deepEqual(Object.keys(storedOf(world).quizResults).sort(), ['a:BEGINNER:b1', 'b:BEGINNER:b1']);
  });

  it('does not retry a failed write in a loop: one attempt per change', async () => {
    const { io, world } = makeWorld(null);
    world.saveFails = true;
    const session = createProgressSession(io, empty);
    session.start();
    await settle();

    session.savePosition(lesson('a'), 500);
    await settle();
    assert.equal(world.saves.length, 1);
    assert.equal(session.getSnapshot().saveFailed, true);

    session.savePosition(lesson('a'), 600);
    await settle();
    assert.equal(world.saves.length, 2);
  });

  it('never lets an older state land after a newer one', async () => {
    const { io, world } = makeWorld(null);
    const session = createProgressSession(io, empty);
    session.start();
    await settle();

    const held = gate();
    world.saveGate = held.promise;
    session.setCompleted(lesson('a'), true);
    session.setCompleted(lesson('b'), true);
    session.setCompleted(lesson('c'), true);
    held.open();
    await settle();

    assert.equal(world.saves.length, 2, 'the burst became one more write, not three');
    assert.deepEqual(Object.keys(world.saves[0].completed), ['a:BEGINNER']);
    assert.deepEqual(Object.keys(world.saves[1].completed).sort(), ['a:BEGINNER', 'b:BEGINNER', 'c:BEGINNER']);
    assert.deepEqual(Object.keys(storedOf(world).completed).sort(), ['a:BEGINNER', 'b:BEGINNER', 'c:BEGINNER']);
  });
});

describe('reset', () => {
  it('erases saved progress, and a result recorded before it is not reported as saved', async () => {
    const { io, world } = makeWorld(null);
    const session = createProgressSession(io, empty);
    session.start();
    await settle();

    const held = gate();
    world.saveGate = held.promise;
    const recorded = session.recordQuizResult(quiz('a'));
    const erased = session.reset();
    held.open();

    assert.equal(await recorded, false);
    assert.equal(await erased, true);
    assert.equal(world.stored, null, 'the erase is the last thing that happened to storage');
    assert.equal(session.getSnapshot().progress, empty);
  });

  it('says so when the saved copy could not be erased, and finishes the erase on retry', async () => {
    const { io, world } = makeWorld(existing);
    const session = createProgressSession(io, empty);
    session.start();
    await settle();

    world.clearFails = true;
    assert.equal(await session.reset(), false);
    assert.equal(session.getSnapshot().saveFailed, true);
    assert.equal(session.getSnapshot().progress, empty);
    assert.equal(world.stored, existing, 'the old copy is still there');

    world.clearFails = false;
    assert.equal(await session.retrySave(), true);
    assert.deepEqual(world.stored, empty);
    assert.equal(session.getSnapshot().saveFailed, false);
  });
});
