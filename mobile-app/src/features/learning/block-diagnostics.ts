/**
 * Developer diagnostics for lesson blocks the reader could not show as published (LESS-001, NFR-003). Pure: no React, no storage, no network.
 *
 * The app has no logging layer and no telemetry, so this is the one place a block problem is written down, and only in development builds (`__DEV__`): a production build
 * writes nothing and sends nothing. A problem is written ONCE per lesson, publication and block for as long as the app runs (reopening the lesson, a re-render or a
 * refreshed copy of the same publication do not repeat it), and no more than MAX_REPORTS distinct problems are written in total, so a badly broken lesson cannot flood the log.
 *
 * What is written: the kind of problem, the block's type, the lesson id, the block id and the publication version, and for a block that threw while drawing, the NAME of the error.
 * Never written: the block's content (Scripture text, quiz questions and answers, notes), the error message (it can quote content), tokens or anything about the learner.
 */

/**
 * unsupported-type: this app version has no renderer for the block's type (the block is left out, the rest of the lesson shows).
 * missing-content: the block has no content object to draw (it is left out in place).
 * render-failed: the block's renderer threw on what it was given (that one block is replaced by a notice).
 * Images and media that cannot be loaded, and requests that fail, are not block problems: those parts show their own unavailable and retry states.
 */
export type BlockProblemKind = 'unsupported-type' | 'missing-content' | 'render-failed';

export interface BlockProblem {
  kind: BlockProblemKind;
  lessonId: string;
  blockId: string;
  type: string;
  publicationVersion: number;
  /** For `render-failed`: the error's name only. */
  errorName?: string;
}

const MAX_REPORTS = 100;
const reported = new Set<string>();

const WHAT: Record<BlockProblemKind, string> = {
  'unsupported-type': 'has a type this version of the app cannot show; the block was left out',
  'missing-content': 'has no content to show; the block was left out',
  'render-failed': 'could not be drawn from its content; the block was replaced by a notice',
};

/** An identifier made safe to print: a published id or type is short and plain, anything else is cut short and its odd characters replaced. */
const plain = (value: unknown): string => (typeof value === 'string' ? value.replace(/[^A-Za-z0-9_.:-]/g, '?').slice(0, 64) : '?');

/** Writes a block problem to the development console, once (see the top of this file). Returns whether it was written; production builds always return false. */
export function reportBlockProblem(problem: BlockProblem): boolean {
  if (!__DEV__) return false;
  const key = `${problem.kind}|${plain(problem.lessonId)}|${problem.publicationVersion}|${plain(problem.blockId)}`;
  if (reported.has(key) || reported.size >= MAX_REPORTS) return false;
  reported.add(key);
  const detail = problem.errorName ? ` (${plain(problem.errorName)})` : '';
  console.warn(
    `[lesson] Block "${plain(problem.type)}" ${WHAT[problem.kind]}${detail}. lesson=${plain(problem.lessonId)} block=${plain(problem.blockId)} publication=v${String(problem.publicationVersion)}`,
  );
  return true;
}
