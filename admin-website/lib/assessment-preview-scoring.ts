import { type EditorState, LEVELS, LEVEL_LABEL, LIMITS, type Level, type LevelPoints, type TieBreak, checkEditor } from './assessments';
import { type FixTarget, isValidPoints, pointsFieldId, questionIssues, targetForPath } from './assessment-builder';

/**
 * The pure core of the Assessment Preview (no React, no requests, nothing stored): whether the working copy is complete enough to preview, the learner's view of it, and the SIMULATED scoring of a
 * preview attempt. Nothing here is a new rule.
 *
 * READINESS reuses the editor's own checks: `checkEditor` (everything a save refuses), `questionIssues` (the two publishing checks `checkEditor` does not make: fewer than two answers and two answers
 * with the same text) and the same `isValidPoints` test the points fields use, plus "scoring is switched on". So the preview waits for exactly what the assessment needs before it can be saved and published.
 * It never fills a gap in: an incomplete working copy is described, not previewed.
 *
 * SCORING (`scorePreview`) is a line-for-line copy of `scoreAttempt` in backend/src/modules/assessments/domain/assessment-rules.ts, the one place that scores an attempt for learners (the mobile app
 * never scores; it shows what that function returns). The same rules, in the same order: an answer that does not belong, or a question answered twice, is refused; no answer at all is refused
 * (NO_ANSWERS); when every question must be answered, a missing one is refused (MISSING_ANSWERS); otherwise each level's total is the sum of the chosen answers' points for that level (a skipped question
 * adds nothing), the recommendation is the level with the highest total, and when several levels share it the tie-break picks the first (LOWER_LEVEL) or the last (HIGHER_LEVEL) of them in the order
 * Beginner, Intermediate, Advanced. All three at 0 is a three-way tie. There are no percentages, pass marks, averages or weights. The message is the one written for the recommended level, if any.
 * If the backend's rule changes, this file is the one place to change with it.
 */

export interface PreviewIssue {
  /** Stable, for React keys. */
  key: string;
  message: string;
  /** Where the author fixes it: the tab, the question to open and the field to focus. */
  target: FixTarget;
}

export interface PreviewOption {
  id: string;
  text: string;
  points: LevelPoints;
}

export interface PreviewQuestion {
  id: string;
  prompt: string;
  options: PreviewOption[];
}

/** What the learner's app is given for an assessment (title, instructions, whether every question is needed, the questions) plus what the backend keeps to itself (points, tie-break, result messages). */
export interface PreviewAssessment {
  title: string;
  instructions: string | null;
  requireAll: boolean;
  tieBreak: TieBreak;
  /** Only the levels that have a message (an empty one is not sent). */
  messages: Partial<Record<Level, string>>;
  questions: PreviewQuestion[];
}

export type PreviewPlan = { ok: true; assessment: PreviewAssessment } | { ok: false; issues: PreviewIssue[] };

export interface PreviewAnswer {
  questionId: string;
  optionId: string;
}

const TAB_RANK = { overview: 0, questions: 1, scoring: 2 } as const;

/** What stops the working copy from being previewed (and, apart from workflow, from being published), in the order an author would fix it: Overview, then Questions, then Scoring. Empty = ready. */
export function previewIssues(state: EditorState): PreviewIssue[] {
  const out: PreviewIssue[] = [];
  const seen = new Set<string>();
  const add = (key: string, message: string, target: FixTarget | null) => {
    if (!target || seen.has(key)) return;
    seen.add(key);
    out.push({ key, message, target });
  };

  for (const problem of checkEditor(state)) {
    // Points are reported once per answer below, with the same test the points fields use.
    if (problem.code === 'SCORE_MISSING' || problem.code === 'POINTS_INVALID') continue;
    add(`${problem.code}:${problem.path ?? ''}`, problem.message, targetForPath(problem.path));
  }
  if (!state.scoring.enabled) {
    add('SCORING_NOT_CONFIGURED', 'Scoring is not configured. Switch it on in the Scoring tab so the preview can recommend a level.', { tab: 'scoring', fieldId: 'as-scoring-enabled' });
  }
  if (state.questions.length === 0) add('NO_QUESTIONS', 'Add at least one question.', { tab: 'questions', fieldId: 'as-questions' });

  state.questions.forEach((q, qi) => {
    for (const issue of questionIssues(q, qi)) {
      // The other question checks (text, answer text, lengths) are already reported by `checkEditor`; these two are the publishing checks it does not make.
      if (issue.code === 'few-answers' || issue.code === 'duplicate') {
        add(`${issue.code}:${qi}`, `Question ${qi + 1}: ${issue.message}`, { tab: 'questions', questionIndex: qi, fieldId: issue.fieldId });
      }
    }
    q.options.forEach((o, oi) => {
      const bad = LEVELS.filter((level) => !isValidPoints(o.scores[level]));
      if (bad.length > 0) {
        add(`points:${qi}:${oi}`, `Question ${qi + 1}, answer ${oi + 1}: the points for ${bad.map((level) => LEVEL_LABEL[level]).join(', ')} must be a whole number from 0 to ${LIMITS.pointsMax}`, {
          tab: 'questions',
          questionIndex: qi,
          fieldId: pointsFieldId(qi, oi, bad[0]),
        });
      }
    });
  });

  return out
    .map((issue, order) => ({ issue, order }))
    .sort((a, b) => TAB_RANK[a.issue.target.tab] - TAB_RANK[b.issue.target.tab] || (a.issue.target.questionIndex ?? -1) - (b.issue.target.questionIndex ?? -1) || a.order - b.order)
    .map((entry) => entry.issue);
}

/** The working copy as the learner's app would be given it, or what is still missing. Ids are the editor's stable keys (a new question has no server id yet). Reads the state; never changes it. */
export function buildPreview(state: EditorState): PreviewPlan {
  const issues = previewIssues(state);
  if (issues.length > 0) return { ok: false, issues };
  const tieBreak = state.scoring.tieBreak;
  if (tieBreak === '' || state.scoring.requireAll === '') {
    return { ok: false, issues: [{ key: 'SCORING_INCOMPLETE', message: 'Scoring is not complete. Choose the tie-break and whether every question must be answered.', target: { tab: 'scoring', fieldId: 'as-tiebreak' } }] };
  }
  const messages: Partial<Record<Level, string>> = {};
  for (const level of LEVELS) {
    const text = state.scoring.messages[level].trim();
    if (text !== '') messages[level] = text;
  }
  const instructions = state.description.trim();
  return {
    ok: true,
    assessment: {
      title: state.title.trim(),
      instructions: instructions === '' ? null : instructions,
      requireAll: state.scoring.requireAll === 'yes',
      tieBreak,
      messages,
      questions: state.questions.map((q) => ({
        id: q.key,
        prompt: q.prompt.trim(),
        options: q.options.map((o) => ({
          id: o.key,
          text: o.text.trim(),
          points: { BEGINNER: Number(o.scores.BEGINNER.trim()), INTERMEDIATE: Number(o.scores.INTERMEDIATE.trim()), ADVANCED: Number(o.scores.ADVANCED.trim()) },
        })),
      })),
    },
  };
}

// ------------------------------------------------------------------------------------------------------------------------------------ the learner's answers

/** The preview learner's choices: question id -> option id (one per question; choosing again replaces it, as in the app). */
export type PreviewAnswers = Readonly<Record<string, string>>;

export const selectPreviewAnswer = (answers: PreviewAnswers, questionId: string, optionId: string): PreviewAnswers => ({ ...answers, [questionId]: optionId });

/** Indexes (0-based) of the questions that have no answer. */
export const unansweredIndexes = (assessment: PreviewAssessment, answers: PreviewAnswers): number[] => assessment.questions.flatMap((q, index) => (answers[q.id] === undefined ? [index] : []));

export const answeredCount = (assessment: PreviewAssessment, answers: PreviewAnswers): number => assessment.questions.length - unansweredIndexes(assessment, answers).length;

/** The answers that would be submitted, in question order, only for questions that are answered AND whose option belongs to that question. */
export function toPreviewAnswers(assessment: PreviewAssessment, answers: PreviewAnswers): PreviewAnswer[] {
  return assessment.questions.flatMap((question) => {
    const optionId = answers[question.id];
    return optionId !== undefined && question.options.some((o) => o.id === optionId) ? [{ questionId: question.id, optionId }] : [];
  });
}

/**
 * What the app does when the learner presses "See my result", before anything is sent (mobile-app/src/screens/assessment-screen.tsx): when every question is required and one is open, say so with
 * the first open question and go to it; when nothing at all is answered, say so and stay; otherwise submit.
 */
export type SubmitCheck = { kind: 'submit' } | { kind: 'open-question'; message: string; goTo: number } | { kind: 'no-answers'; message: string };

export function checkBeforeSubmit(assessment: PreviewAssessment, answers: PreviewAnswers): SubmitCheck {
  const missing = unansweredIndexes(assessment, answers);
  if (assessment.requireAll && missing.length > 0) {
    return {
      kind: 'open-question',
      message: `Please answer every question before you finish. ${missing.length === 1 ? 'One question is' : `${missing.length} questions are`} still open; the first is question ${missing[0] + 1}.`,
      goTo: missing[0],
    };
  }
  if (answeredCount(assessment, answers) === 0) return { kind: 'no-answers', message: 'Answer at least one question to get a recommendation.' };
  return { kind: 'submit' };
}

// ------------------------------------------------------------------------------------------------------------------------------------ scoring

/** One row of the Admin's breakdown: what the preview learner chose for one question and the points that choice adds to each level. A skipped question adds nothing. */
export interface BreakdownRow {
  questionNumber: number;
  prompt: string;
  answered: boolean;
  answerText: string | null;
  points: LevelPoints;
}

export interface PreviewResult {
  recommendedLevel: Level;
  /** Total points per level. */
  scores: LevelPoints;
  /** The levels that shared the highest total, in order (more than one means the tie-break decided). */
  tiedLevels: Level[];
  answered: number;
  total: number;
  /** The message written for the recommended level, or null when there is none. */
  message: string | null;
  /** The highest total. */
  best: number;
  tieBreak: TieBreak;
  rows: BreakdownRow[];
}

export type ScoreOutcome = { ok: true; result: PreviewResult } | { ok: false; code: 'INVALID_ANSWER' | 'DUPLICATE_ANSWER' | 'NO_ANSWERS' | 'MISSING_ANSWERS'; missing: number[] };

const zeroPoints = (): LevelPoints => ({ BEGINNER: 0, INTERMEDIATE: 0, ADVANCED: 0 });

/** Scores one preview attempt exactly as the backend scores a real one (see the note at the top of this file). Deterministic; changes nothing. */
export function scorePreview(assessment: PreviewAssessment, answers: readonly PreviewAnswer[]): ScoreOutcome {
  const questions = new Map(assessment.questions.map((q) => [q.id, q]));
  const chosen = new Map<string, PreviewOption>();
  let invalid = 0;
  const duplicated = new Set<string>();

  for (const answer of answers) {
    const question = questions.get(answer.questionId);
    const option = question?.options.find((o) => o.id === answer.optionId);
    if (!question || !option) {
      invalid += 1;
      continue;
    }
    if (chosen.has(question.id)) duplicated.add(question.id);
    else chosen.set(question.id, option);
  }
  if (invalid > 0) return { ok: false, code: 'INVALID_ANSWER', missing: [] };
  if (duplicated.size > 0) return { ok: false, code: 'DUPLICATE_ANSWER', missing: [] };
  if (chosen.size === 0) return { ok: false, code: 'NO_ANSWERS', missing: [] };
  if (assessment.requireAll && chosen.size !== assessment.questions.length) {
    return { ok: false, code: 'MISSING_ANSWERS', missing: assessment.questions.flatMap((q, index) => (chosen.has(q.id) ? [] : [index])) };
  }

  const scores = zeroPoints();
  for (const option of chosen.values()) for (const level of LEVELS) scores[level] += option.points[level] ?? 0;

  const best = Math.max(...LEVELS.map((level) => scores[level]));
  const tiedLevels = LEVELS.filter((level) => scores[level] === best);
  const recommendedLevel = assessment.tieBreak === 'HIGHER_LEVEL' ? tiedLevels[tiedLevels.length - 1] : tiedLevels[0];

  return {
    ok: true,
    result: {
      recommendedLevel,
      scores,
      tiedLevels,
      answered: chosen.size,
      total: assessment.questions.length,
      message: assessment.messages[recommendedLevel] ?? null,
      best,
      tieBreak: assessment.tieBreak,
      rows: assessment.questions.map((q, index) => {
        const option = chosen.get(q.id);
        return { questionNumber: index + 1, prompt: q.prompt, answered: option !== undefined, answerText: option ? option.text : null, points: option ? { ...option.points } : zeroPoints() };
      }),
    },
  };
}

// ------------------------------------------------------------------------------------------------------------------------------------ words

/** "Beginner and Intermediate", as the app's result screen joins levels. */
export const joinLevels = (levels: readonly Level[]): string => levels.map((level) => LEVEL_LABEL[level]).join(' and ');

/** "Beginner, Intermediate and Advanced" for the Admin's own explanations. */
export function listLevels(levels: readonly Level[]): string {
  const names = levels.map((level) => LEVEL_LABEL[level]);
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export const TIE_BREAK_WORDS: Record<TieBreak, string> = { LOWER_LEVEL: 'recommend the lower level', HIGHER_LEVEL: 'recommend the higher level' };

/** How the recommendation came about, in a sentence or two, for the scoring breakdown. Uses only what the result holds. */
export function explainResult(result: PreviewResult): string {
  const name = LEVEL_LABEL[result.recommendedLevel];
  if (result.tiedLevels.length <= 1) return `${name} has the most points (${result.best}), so it is recommended. There was no tie.`;
  const all = result.tiedLevels.length === LEVELS.length;
  const tie = all && result.best === 0 ? 'No chosen answer gave any points, so all three levels are tied on 0.' : `${listLevels(result.tiedLevels)} are tied on ${result.best} points.`;
  const rule = result.tieBreak === 'HIGHER_LEVEL' ? 'the higher level' : 'the lower level';
  return `${tie} The tie-break for this assessment is to ${TIE_BREAK_WORDS[result.tieBreak]}, so ${name}, ${rule} of those tied, is recommended.`;
}
