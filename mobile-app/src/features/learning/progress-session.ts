/**
 * The safety rules for the learner's saved progress, with no React and no storage of its own (storage is passed in), so they can be unit-tested
 * with plain Node (`npm test`). learning-provider.tsx is the React wrapper; store.ts is the real storage.
 *
 * What it guarantees:
 *  - Saved progress is only ever written over once it has been READ. "Nothing saved yet" (a new learner) starts from empty progress; a storage
 *    error or a damaged value does NOT. Those leave the stored value untouched, nothing is written, and the session says so (`unreadable` /
 *    `invalid`) until a retry reads it successfully (or the learner explicitly resets).
 *  - Changes asked for while the first read is still running are queued, in order, and applied on top of what was read. If the read fails they are
 *    dropped (never written against an unknown baseline) and anything waiting for "was it saved?" gets `false`.
 *  - Writes are one at a time and always carry the LATEST state, so an older state can never land after a newer one. A burst of changes becomes
 *    at most one more write.
 *  - A failed write is never reported as saved. The latest state stays in memory, `saveFailed` is raised, nothing is retried in a loop, and the
 *    next change (or `retrySave`) writes the latest state again.
 *  - Only `reset()` ever removes saved progress.
 *
 * What it does NOT change: which actions exist, what they record, and the progress model itself (progress-model.ts).
 */
import {
  type LessonRef,
  type PositionExtra,
  type ProgressState,
  type QuizResult,
  type TitledLesson,
  isSamePosition,
  lessonKey,
  withCurrentTitles,
  withPosition,
  withQuizResult,
} from './progress-model.ts';

export type SessionProgress = ProgressState & { version: 1; quizResults: Record<string, QuizResult> };

/**
 * - loading:    the first read has not finished. Changes are queued.
 * - ready:      the saved progress is known (read, or nothing was ever saved). Changes are applied and saved.
 * - unreadable: the storage could not be read. The stored value is unknown and untouched. Changes are not applied or saved.
 * - invalid:    something is stored but it is damaged or from an unknown format. It is left untouched. Changes are not applied or saved.
 */
export type SessionStatus = 'loading' | 'ready' | 'unreadable' | 'invalid';

export type SessionSnapshot = {
  status: SessionStatus;
  /** Empty (and meaningless) unless `status` is `ready`. */
  progress: SessionProgress;
  /** The latest state could not be stored. It is kept in memory and written again by the next change or by `retrySave`. */
  saveFailed: boolean;
  /** A retry of the first read is running (only while `unreadable` / `invalid`). */
  retrying: boolean;
};

export type SessionLoad = { status: 'ok'; progress: SessionProgress } | { status: 'unreadable' } | { status: 'invalid' };

export type SessionIo = {
  /** Reads the saved progress. `ok` with empty progress means nothing was ever saved. */
  load: () => Promise<SessionLoad>;
  /** Stores the progress; resolves to whether it was stored. */
  save: (progress: SessionProgress) => Promise<boolean>;
  /** Removes the saved progress; resolves to whether it is gone. */
  clear: () => Promise<boolean>;
};

export type ProgressSession = {
  getSnapshot: () => SessionSnapshot;
  subscribe: (listener: () => void) => () => void;
  /** Starts the first read. Safe to call more than once. */
  start: () => void;
  /** Reads again after a failure. Resolves to whether the progress is now known. Rapid calls share one read. */
  retryLoad: () => Promise<boolean>;
  /** Writes the latest state again after a failed write. Resolves to whether it is stored. */
  retrySave: () => Promise<boolean>;
  /**
   * Notes the lesson being read as the resume point and, when its title is the current one (`liveTitle`, the default), brings the title kept with its other records
   * up to date. A lesson shown from a saved copy passes `liveTitle: false`: that copy can be older than a title already refreshed from the live catalog, so it
   * must not write its title over a newer one.
   */
  recordOpened: (lesson: LessonRef, options?: { liveTitle?: boolean }) => void;
  /**
   * Brings the title kept with the records of these lessons up to date with the published catalog (see `withCurrentTitles`). Only titles change; completion
   * dates, positions and quiz scores are untouched, and nothing is written when the titles already match.
   */
  syncTitles: (lessons: readonly TitledLesson[]) => void;
  /**
   * Remembers where the learner is in an unfinished lesson: the scroll offset (always) and, when known, the content anchor and published version
   * (`extra`). A save that only repeats the kept position changes and writes nothing.
   */
  savePosition: (lesson: LessonRef, offset: number, extra?: PositionExtra) => void;
  /**
   * Marks a lesson complete (or takes the mark back). Resolves to whether the change is stored: false when it could not be stored, when the saved progress is
   * unavailable, or when progress was reset meanwhile. When nothing needed to change it resolves true only if the latest state really IS stored: a write that is still
   * running is waited for, and one that failed earlier is tried again, so "nothing to do" never claims more than is on the device. The change is applied in memory
   * at once either way.
   *
   * `completedAt` is for putting back a completion that was taken away but could not be stored (the stored progress still has it): the lesson keeps the time it was
   * originally completed instead of getting a new one.
   */
  setCompleted: (lesson: LessonRef, completed: boolean, completedAt?: number) => Promise<boolean>;
  /** Resolves to whether the result was stored on this device (false: it could not be stored, or progress was reset or unavailable meanwhile). */
  recordQuizResult: (result: QuizResult) => Promise<boolean>;
  /** The learner's explicit "erase my progress". Resolves to whether the saved progress is gone. */
  reset: () => Promise<boolean>;
};

type Action = (current: SessionProgress) => SessionProgress;
type Queued = { run: Action; settle: ((stored: boolean) => void) | null };

export function createProgressSession(io: SessionIo, empty: SessionProgress): ProgressSession {
  let status: SessionStatus = 'loading';
  let progress: SessionProgress = empty;
  let saveFailed = false;
  let retrying = false;
  let snapshot: SessionSnapshot = { status, progress, saveFailed, retrying };
  const listeners = new Set<() => void>();

  let queued: Queued[] = []; // changes asked for while the first read runs, oldest first
  let started = false;
  let loading: Promise<void> | null = null; // the one read in flight
  let attempt = 0; // identifies the read whose result may still be applied
  let generation = 0; // counts resets
  let unsaved = false; // the latest state is not known to be stored
  let writing: Promise<boolean> | null = null; // the one write loop in flight

  const publish = () => {
    snapshot = { status, progress, saveFailed, retrying };
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // a faulty listener must never stop progress from being saved
      }
    }
  };

  // The three storage calls are wrapped so that they never throw and never finish before the caller has continued.
  const callLoad = (): Promise<SessionLoad> => {
    try {
      return Promise.resolve(io.load()).catch((): SessionLoad => ({ status: 'unreadable' }));
    } catch {
      return Promise.resolve<SessionLoad>({ status: 'unreadable' });
    }
  };
  const callSave = (state: SessionProgress): Promise<boolean> => {
    try {
      return Promise.resolve(io.save(state)).then((stored) => stored === true, () => false);
    } catch {
      return Promise.resolve(false);
    }
  };
  const callClear = (): Promise<boolean> => {
    try {
      return Promise.resolve(io.clear()).then((erased) => erased === true, () => false);
    } catch {
      return Promise.resolve(false);
    }
  };

  /** One change, applied to `current`. A change that throws is skipped rather than breaking the others. */
  const runAction = (run: Action, current: SessionProgress): SessionProgress => {
    try {
      return run(current);
    } catch {
      return current;
    }
  };

  /**
   * Writes the latest state, and again for as long as a newer one has appeared meanwhile. One loop at a time, so writes happen in order and the last
   * one always carries the latest state. A failed write stops the loop (no retry storm): `saveFailed` is raised and the next change tries again.
   */
  const flush = (): Promise<boolean> => {
    if (writing) return writing;
    if (!unsaved) return Promise.resolve(!saveFailed);
    const run = (async (): Promise<boolean> => {
      try {
        while (unsaved) {
          const attemptedState = progress;
          const attemptedGeneration = generation;
          const stored = await callSave(attemptedState);
          if (!stored) {
            if (attemptedGeneration === generation && !saveFailed) {
              saveFailed = true;
              publish();
            }
            return false;
          }
          // Stored. It is the latest only if nothing changed (and nothing was reset) while it was being written.
          if (attemptedGeneration === generation && attemptedState === progress) unsaved = false;
        }
        if (saveFailed) {
          saveFailed = false;
          publish();
        }
        return true;
      } finally {
        writing = null; // cleared in the same step in which the loop decided to stop: a change can never be left without a writer
      }
    })();
    writing = run; // callSave always yields before the loop can finish, so this runs first
    return run;
  };

  /** Applies a change to the known progress. Returns whether anything changed. */
  const apply = (run: Action): boolean => {
    const next = runAction(run, progress);
    if (next === progress) return false;
    progress = next;
    unsaved = true;
    publish();
    return true;
  };

  /**
   * Routes a change by status. Resolves to whether it ended up stored. `confirmNoop`: a change that finds nothing to change still answers only once the latest state
   * is stored (used by completion, whose callers tell the learner whether it was saved).
   */
  const submit = (run: Action, confirmNoop = false): Promise<boolean> => {
    if (status === 'ready') {
      const startedIn = generation;
      if (!apply(run)) return confirmNoop && unsaved ? flush().then((stored) => stored && startedIn === generation) : Promise.resolve(true);
      return flush().then((stored) => stored && startedIn === generation);
    }
    if (status === 'loading') return new Promise<boolean>((resolve) => queued.push({ run, settle: resolve }));
    return Promise.resolve(false); // unreadable / invalid: the baseline is unknown, so nothing is applied or written
  };

  const runLoad = async (): Promise<void> => {
    const mine = (attempt += 1);
    const result = await callLoad();
    if (mine !== attempt) {
      // A reset took over while this read was running: its result is stale.
      if (retrying) {
        retrying = false;
        publish();
      }
      return;
    }
    retrying = false;
    const waiting = queued;
    queued = [];
    if (result.status !== 'ok') {
      status = result.status;
      publish();
      for (const item of waiting) if (item.settle) item.settle(false);
      return;
    }
    progress = result.progress;
    status = 'ready';
    for (const item of waiting) {
      const next = runAction(item.run, progress);
      if (next !== progress) {
        progress = next;
        unsaved = true;
      }
    }
    publish();
    const outcome = unsaved ? flush() : Promise.resolve(true);
    for (const item of waiting) {
      const settle = item.settle;
      if (settle) void outcome.then(settle);
    }
  };

  const load = (): Promise<void> => {
    if (loading) return loading;
    if (status === 'ready') return Promise.resolve(); // already known (e.g. reset first): reading again could only replace newer state with older
    const run = (async () => {
      try {
        await runLoad();
      } catch {
        // runLoad does not throw; this only keeps the single-flight marker honest if it ever does
      } finally {
        loading = null;
      }
    })();
    loading = run;
    return run;
  };

  const start = () => {
    if (started) return;
    started = true;
    void load();
  };

  const retryLoad = (): Promise<boolean> => {
    if (status === 'ready') return Promise.resolve(true);
    started = true;
    if (!loading && status !== 'loading') {
      retrying = true;
      publish();
    }
    return load().then(() => status === 'ready');
  };

  const reset = async (): Promise<boolean> => {
    const mine = (generation += 1);
    attempt += 1; // a read that is still running can no longer apply its result
    const dropped = queued;
    queued = [];
    for (const item of dropped) if (item.settle) item.settle(false);

    if (status === 'unreadable' || status === 'invalid') {
      // The stored value is unknown: it is only removed if the learner confirmed this, and the app only moves on once it really is gone.
      const erased = await callClear();
      if (erased && mine === generation) {
        status = 'ready';
        progress = empty;
        retrying = false;
        saveFailed = false;
        unsaved = false;
        publish();
      }
      return erased;
    }

    // Progress is known (or still being read): memory is emptied at once, as before, and the stored copy follows.
    status = 'ready';
    progress = empty;
    retrying = false;
    saveFailed = false;
    unsaved = false;
    publish();
    const erased = await callClear();
    if (!erased && mine === generation) {
      // The old progress is still stored. Say so, and keep "write the empty state" pending so a later retry completes the erase.
      unsaved = true;
      saveFailed = true;
      publish();
    }
    return erased;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start,
    retryLoad,
    retrySave: () => flush(),

    recordOpened: (lesson, options) => {
      const now = Date.now();
      const liveTitle = options?.liveTitle !== false;
      void submit((current) => {
        const last = current.lastOpened;
        const repeats =
          last !== null && last.lessonId === lesson.lessonId && last.level === lesson.level && last.courseId === lesson.courseId && (!liveTitle || last.title === lesson.title);
        const opened = repeats ? current : { ...current, lastOpened: { ...lesson, openedAt: now } };
        // Opening a lesson also brings the title kept with its other records (completion, position, quiz results) up to date, without touching anything else of them.
        return liveTitle ? withCurrentTitles(opened, [lesson]) : opened;
      });
    },

    syncTitles: (lessons) => {
      void submit((current) => withCurrentTitles(current, lessons));
    },

    savePosition: (lesson, offset, extra) => {
      const now = Date.now();
      void submit((current) => {
        const key = lessonKey(lesson.lessonId, lesson.level);
        if (key in current.completed) return current; // a completed lesson opens at the top: its position is not kept
        const saved = current.positions[key];
        if (saved && isSamePosition(saved, lesson, offset, extra)) return current;
        return { ...current, positions: withPosition(current.positions, lesson, offset, now, extra) };
      });
    },

    setCompleted: (lesson, completed, completedAt) => {
      const now = completedAt !== undefined && Number.isFinite(completedAt) ? completedAt : Date.now();
      return submit((current) => {
        const key = lessonKey(lesson.lessonId, lesson.level);
        const done = key in current.completed;
        if (completed === done) return current;
        const next = { ...current.completed };
        if (completed) next[key] = { title: lesson.title, completedAt: now };
        else delete next[key];
        return { ...current, completed: next };
      }, true);
    },

    recordQuizResult: (result) => submit((current) => ({ ...current, quizResults: withQuizResult(current.quizResults, result) })),

    reset,
  };
}
