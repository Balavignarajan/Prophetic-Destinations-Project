/**
 * The rules for device-local reading progress, as pure functions (no React, no storage), so they can be unit-tested with plain
 * Node (`npm test`). The storage shape lives in store.ts and the React wrapper in learning-provider.tsx.
 *
 * What the specification defines (FINAL_FEATURE_COMPLIANCE_AUDIT.md: LESS-004, LESS-005, APP-011, PROG-001/002):
 *  - the app remembers the learner's position inside an unfinished lesson and "Continue Learning" returns near it;
 *  - "Continue Learning" is shown only when there is unfinished progress;
 *  - completed and remaining lessons are shown on the Progress screen; everything is device-local.
 * What it does NOT define, and this file therefore does not invent (decision C-14): a completion rule other than the learner's own
 * explicit mark, checkpoint granularity beyond "reasonable", and a formula for "overall progress". No percentage is computed here.
 */
export type ProgressLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export type LessonRef = { lessonId: string; level: ProgressLevel; courseId: string | null; title: string };
export type LessonPosition = LessonRef & { offset: number; savedAt: number };
export type LastOpened = LessonRef & { openedAt: number };
export type CompletedLesson = { title: string; completedAt: number };

/**
 * A completed quiz attempt, saved on this device (PROG-001, FLOW-06, QUIZ-001: "result persists"). PROVISIONAL RULES (the documents do not
 * define attempts, retention, scoring display or a pass mark, and none is invented here): only the LATEST submitted result of each quiz BLOCK
 * is kept (one entry per lesson + level + block), so history cannot grow without limit; every question counts in `total`, an unanswered
 * question simply scores 0 (as the on-screen scoring does); there is no pass mark and nothing is locked or unlocked by a result.
 * Identity: lesson, level, block id, quiz id and the lesson's published `contentHash`. A result is shown only for content with exactly that
 * identity, so a result for an older publication never appears as a result for changed content, and two blocks that use the same quiz keep
 * separate results.
 */
export type QuizResult = {
  lessonId: string;
  level: ProgressLevel;
  blockId: string;
  quizId: string;
  contentHash: string;
  lessonTitle: string;
  score: number;
  total: number;
  completedAt: number;
  /** questionId -> chosen optionId, kept so the finished attempt can be reviewed. Unanswered questions are absent. */
  answers: Record<string, string>;
};

export type QuizIdentity = { lessonId: string; level: ProgressLevel; blockId: string; quizId: string; contentHash: string };

/** The most quiz results kept; the oldest are dropped first so the stored value stays small. */
export const MAX_QUIZ_RESULTS = 300;

export const quizResultKey = (lessonId: string, level: ProgressLevel, blockId: string) => `${lessonKey(lessonId, level)}:${blockId}`;

/** Stores the result as the latest for its block (replacing the earlier one) and trims the oldest beyond the limit. */
export function withQuizResult(results: Record<string, QuizResult>, result: QuizResult): Record<string, QuizResult> {
  const next = { ...results, [quizResultKey(result.lessonId, result.level, result.blockId)]: result };
  const keys = Object.keys(next);
  if (keys.length <= MAX_QUIZ_RESULTS) return next;
  keys.sort((a, b) => next[a].completedAt - next[b].completedAt);
  for (const key of keys.slice(0, keys.length - MAX_QUIZ_RESULTS)) delete next[key];
  return next;
}

/** The saved result for exactly this content, or null (also when the saved one belongs to another quiz or publication). */
export function matchingQuizResult(results: Record<string, QuizResult>, identity: QuizIdentity): QuizResult | null {
  const found = results[quizResultKey(identity.lessonId, identity.level, identity.blockId)];
  return found && found.quizId === identity.quizId && found.contentHash === identity.contentHash ? found : null;
}

/** Saved results, most recent first (for the Progress screen). */
export function quizResultsList(results: Record<string, QuizResult>): QuizResult[] {
  return Object.values(results).sort((a, b) => b.completedAt - a.completedAt);
}

export type ProgressState = {
  lastOpened: LastOpened | null;
  /** Keyed by `lessonKey`. */
  completed: Record<string, CompletedLesson>;
  /** Keyed by `lessonKey`: where the learner was in a lesson (vertical scroll offset, in px). */
  positions: Record<string, LessonPosition>;
};

/** The most positions kept; the oldest are dropped first so the stored value stays small. */
export const MAX_POSITIONS = 200;

export const lessonKey = (lessonId: string, level: ProgressLevel) => `${lessonId}:${level}`;

/** Records where the learner is in a lesson. Offsets are whole, non-negative pixels; anything else is stored as 0. */
export function withPosition(positions: Record<string, LessonPosition>, lesson: LessonRef, offset: number, now: number): Record<string, LessonPosition> {
  const safe = Number.isFinite(offset) && offset > 0 ? Math.round(offset) : 0;
  const next: Record<string, LessonPosition> = { ...positions, [lessonKey(lesson.lessonId, lesson.level)]: { ...lesson, offset: safe, savedAt: now } };
  const keys = Object.keys(next);
  if (keys.length <= MAX_POSITIONS) return next;
  keys.sort((a, b) => next[a].savedAt - next[b].savedAt);
  for (const key of keys.slice(0, keys.length - MAX_POSITIONS)) delete next[key];
  return next;
}

export type ResumeEntry = LessonRef & { offset: number; at: number };

/**
 * Lessons the learner has started but not completed, most recent first. A lesson counts as started once it has a saved position
 * or is the last one opened. Completed lessons never appear.
 */
export function unfinishedLessons(progress: ProgressState): ResumeEntry[] {
  const out = new Map<string, ResumeEntry>();
  for (const [key, position] of Object.entries(progress.positions)) {
    if (key in progress.completed) continue;
    out.set(key, { lessonId: position.lessonId, level: position.level, courseId: position.courseId, title: position.title, offset: position.offset, at: position.savedAt });
  }
  const last = progress.lastOpened;
  if (last) {
    const key = lessonKey(last.lessonId, last.level);
    if (!(key in progress.completed)) {
      const existing = out.get(key);
      if (existing) existing.at = Math.max(existing.at, last.openedAt);
      else out.set(key, { lessonId: last.lessonId, level: last.level, courseId: last.courseId, title: last.title, offset: 0, at: last.openedAt });
    }
  }
  return [...out.values()].sort((a, b) => b.at - a.at);
}

/** What "Continue Learning" opens: the most recent unfinished lesson, or null when there is nothing to resume. */
export function continueTarget(progress: ProgressState): ResumeEntry | null {
  return unfinishedLessons(progress)[0] ?? null;
}

export type CompletedEntry = LessonRef & { completedAt: number };

/** Completed lessons, most recent first. */
export function completedLessons(progress: ProgressState): CompletedEntry[] {
  return Object.entries(progress.completed)
    .map(([key, value]) => {
      const split = key.lastIndexOf(':');
      return { lessonId: key.slice(0, split), level: key.slice(split + 1) as ProgressLevel, courseId: null, title: value.title, completedAt: value.completedAt };
    })
    .sort((a, b) => b.completedAt - a.completedAt);
}

export type ProgressSummary = {
  completed: number;
  inProgress: number;
  completedAtLevel: number;
  /** Published lessons at the level minus the ones completed there (never below 0), or null when the total is unknown (offline, no saved copy). */
  remainingAtLevel: number | null;
};

/** The counts the Progress screen shows. `totalAtLevel` is the published lesson count for the chosen level, if known. */
export function summarise(progress: ProgressState, level: ProgressLevel, totalAtLevel: number | null): ProgressSummary {
  const done = completedLessons(progress);
  const completedAtLevel = done.filter((lesson) => lesson.level === level).length;
  return {
    completed: done.length,
    inProgress: unfinishedLessons(progress).length,
    completedAtLevel,
    remainingAtLevel: totalAtLevel === null ? null : Math.max(0, totalAtLevel - completedAtLevel),
  };
}

/** True when the saved offset is worth restoring (more than a screen-top blip). */
export const shouldRestore = (offset: number | undefined): offset is number => typeof offset === 'number' && offset >= 24;

// ------------------------------------------------------------------------------------------------ reading what was saved

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isLevel = (value: unknown): value is ProgressLevel => value === 'BEGINNER' || value === 'INTERMEDIATE' || value === 'ADVANCED';

/**
 * Reads the saved value (key `pd.learning.progress.v1`). Tolerant on purpose: a value saved before reading positions existed has
 * no `positions` and loads with none, and any entry that does not look right is dropped rather than failing the whole value, so a
 * damaged value can never lose the rest of the learner's progress. Returns null only when it is not a version-1 record at all.
 */
export function parseProgress(raw: unknown): (ProgressState & { version: 1; quizResults: Record<string, QuizResult> }) | null {
  if (!isRecord(raw) || raw.version !== 1) return null;
  let lastOpened: LastOpened | null = null;
  const lo = raw.lastOpened;
  if (isRecord(lo) && typeof lo.lessonId === 'string' && isLevel(lo.level) && typeof lo.title === 'string' && typeof lo.openedAt === 'number') {
    lastOpened = { lessonId: lo.lessonId, level: lo.level, courseId: typeof lo.courseId === 'string' ? lo.courseId : null, title: lo.title, openedAt: lo.openedAt };
  }
  const completed: Record<string, CompletedLesson> = {};
  if (isRecord(raw.completed)) {
    for (const [key, value] of Object.entries(raw.completed)) {
      if (isRecord(value) && typeof value.title === 'string' && typeof value.completedAt === 'number') {
        completed[key] = { title: value.title, completedAt: value.completedAt };
      }
    }
  }
  const positions: Record<string, LessonPosition> = {};
  if (isRecord(raw.positions)) {
    for (const value of Object.values(raw.positions)) {
      if (
        isRecord(value) &&
        typeof value.lessonId === 'string' &&
        isLevel(value.level) &&
        typeof value.title === 'string' &&
        typeof value.offset === 'number' &&
        Number.isFinite(value.offset) &&
        value.offset >= 0 &&
        typeof value.savedAt === 'number'
      ) {
        positions[lessonKey(value.lessonId, value.level)] = {
          lessonId: value.lessonId,
          level: value.level,
          courseId: typeof value.courseId === 'string' ? value.courseId : null,
          title: value.title,
          offset: value.offset,
          savedAt: value.savedAt,
        };
      }
    }
  }
  return { version: 1, lastOpened, completed, positions, quizResults: parseQuizResults(raw.quizResults) };
}

/** Reads saved quiz results. An entry that does not look right (or an older file with none) is dropped; nothing else is affected. */
function parseQuizResults(raw: unknown): Record<string, QuizResult> {
  const out: Record<string, QuizResult> = {};
  if (!isRecord(raw)) return out;
  for (const value of Object.values(raw)) {
    if (
      !isRecord(value) ||
      typeof value.lessonId !== 'string' ||
      !isLevel(value.level) ||
      typeof value.blockId !== 'string' ||
      typeof value.quizId !== 'string' ||
      typeof value.contentHash !== 'string' ||
      typeof value.score !== 'number' ||
      typeof value.total !== 'number' ||
      !Number.isInteger(value.score) ||
      !Number.isInteger(value.total) ||
      value.total < 1 ||
      value.score < 0 ||
      value.score > value.total ||
      typeof value.completedAt !== 'number' ||
      !isRecord(value.answers)
    ) {
      continue;
    }
    const answers: Record<string, string> = {};
    for (const [questionId, optionId] of Object.entries(value.answers).slice(0, 60)) {
      if (typeof optionId === 'string') answers[questionId] = optionId;
    }
    out[quizResultKey(value.lessonId, value.level, value.blockId)] = {
      lessonId: value.lessonId,
      level: value.level,
      blockId: value.blockId,
      quizId: value.quizId,
      contentHash: value.contentHash,
      lessonTitle: typeof value.lessonTitle === 'string' ? value.lessonTitle : '',
      score: value.score,
      total: value.total,
      completedAt: value.completedAt,
      answers,
    };
  }
  return out;
}
