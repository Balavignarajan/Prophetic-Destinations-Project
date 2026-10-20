import { createHash } from 'node:crypto';
import {
  BusinessRuleError,
  type ContentStatus,
  LEARNING_LEVELS,
  type LearningLevel,
} from '../../../shared-kernel/index.js';

/**
 * Assessment content rules, publishing validation and scoring (pure; no database).
 *
 * WHAT IS DECIDED HERE AND WHAT IS NOT. The requirements say the assessment is optional, recommends one of three levels and never locks the learner;
 * they do NOT define the questions, a scoring formula or thresholds. So nothing about that is hardcoded as a product rule: each answer option carries
 * the POINTS it gives to each level, the assessment carries a scoring configuration that staff must set before publishing, and the recommendation is
 * the level with the most points. The one strategy implemented, LEVEL_POINTS, is PROVISIONAL and replaceable: the mobile contract (answers in, a level
 * and the totals out) does not depend on it, and further strategies can be added behind `ScoringConfig.strategy` without changing that contract.
 */
export const ASSESSMENT_LIMITS = {
  titleMax: 200,
  descriptionMax: 2000,
  questionsMax: 50,
  promptMax: 1000,
  optionsMin: 2,
  optionsMax: 6,
  optionTextMax: 300,
  pointsMax: 100,
  resultMessageMax: 500,
} as const;

/** Only single-choice for now; a column with a one-value CHECK so more types can be added by widening it. */
export const QUESTION_TYPES = ['SINGLE_CHOICE'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const SCORING_STRATEGIES = ['LEVEL_POINTS'] as const;
export const TIE_BREAKS = ['LOWER_LEVEL', 'HIGHER_LEVEL'] as const;
const SCORING_KEYS: string[] = ['strategy', 'tieBreak', 'requireAllQuestions', 'resultMessages'];

export type LevelPoints = Record<LearningLevel, number>;

/** How an assessment is scored. Staff set it; publishing is refused without a valid one. */
export interface ScoringConfig {
  strategy: (typeof SCORING_STRATEGIES)[number];
  /** Which level is recommended when several levels have the same highest total (including all zeros). */
  tieBreak: (typeof TIE_BREAKS)[number];
  /** true: every question must be answered; false: any non-empty subset may be. */
  requireAllQuestions: boolean;
  /** Optional plain-text message shown with the result at that level, written by staff. Nothing is generated. */
  resultMessages?: Partial<Record<LearningLevel, string>>;
}

export interface OptionInput {
  /** Present when the option already exists (keeps its id); omitted for a new one. */
  id?: string;
  text: string;
  /** Points this answer gives to each level: ALL THREE levels are required, each a whole number from 0 to 100. */
  scores: LevelPoints;
}

export interface QuestionInput {
  id?: string;
  type?: QuestionType;
  prompt: string;
  options: OptionInput[];
}

/** The complete content of an assessment as an author supplies it (a save replaces everything). */
export interface AssessmentInput {
  title: string;
  description?: string | null;
  /** null/absent = not configured yet (the assessment can be saved but not published). */
  scoringConfig?: unknown;
  questions: QuestionInput[];
}

export interface StoredOption {
  id: string;
  position: number;
  text: string;
  scores: LevelPoints;
}

export interface StoredQuestion {
  id: string;
  position: number;
  type: QuestionType;
  prompt: string;
  options: StoredOption[];
}

export interface Assessment {
  id: string;
  title: string;
  description: string | null;
  status: ContentStatus;
  /** Counts saved edits of the working copy; the optimistic-concurrency token. Workflow transitions do not move it. */
  version: number;
  scoringConfig: ScoringConfig | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssessmentWithQuestions extends Assessment {
  questions: StoredQuestion[];
}

export interface Problem {
  code: string;
  message: string;
  /** e.g. "questions[2].options[1].scores" */
  path?: string;
}

export interface ValidationReport {
  /** Blocking: publishing is refused while any exist. */
  problems: Problem[];
  /** Worth a look, never blocking (a decision for the project owner). */
  warnings: Problem[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const clean = (text: string) => text.replace(/\r\n?/g, '\n').trim();

export const zeroPoints = (): LevelPoints => ({ BEGINNER: 0, INTERMEDIATE: 0, ADVANCED: 0 });

// -------------------------------------------------------------------------------------------------------------------------------- save-time rules

/** Trims text and fills in defaults. Does not judge validity (see `checkAssessmentContent`). */
export function normalizeAssessment(input: AssessmentInput): AssessmentInput {
  const description = input.description === undefined || input.description === null ? null : clean(input.description);
  return {
    title: clean(input.title),
    description: description === '' ? null : description,
    scoringConfig: input.scoringConfig ?? null,
    questions: input.questions.map((q) => ({
      ...(q.id ? { id: q.id } : {}),
      type: q.type ?? 'SINGLE_CHOICE',
      prompt: clean(q.prompt),
      options: q.options.map((o) => ({ ...(o.id ? { id: o.id } : {}), text: clean(o.text), scores: o.scores })),
    })),
  };
}

/**
 * What must hold for a DRAFT to be saved at all: sizes, non-blank text, whole non-negative points. Drafts may be incomplete (no questions, a single
 * option, no scoring configuration): completeness is judged by `publishProblems`.
 */
export function checkAssessmentContent(content: AssessmentInput): Problem[] {
  const problems: Problem[] = [];
  const L = ASSESSMENT_LIMITS;
  if (content.title.length === 0) problems.push({ code: 'TITLE_REQUIRED', message: 'The title is required', path: 'title' });
  if (content.title.length > L.titleMax) problems.push({ code: 'TITLE_TOO_LONG', message: `The title can be at most ${L.titleMax} characters`, path: 'title' });
  if ((content.description ?? '').length > L.descriptionMax) problems.push({ code: 'DESCRIPTION_TOO_LONG', message: `The instructions can be at most ${L.descriptionMax} characters`, path: 'description' });
  if (content.questions.length > L.questionsMax) problems.push({ code: 'TOO_MANY_QUESTIONS', message: `An assessment can have at most ${L.questionsMax} questions`, path: 'questions' });

  const seenQuestionIds = new Set<string>();
  const seenOptionIds = new Set<string>();
  content.questions.forEach((q, qi) => {
    const qp = `questions[${qi}]`;
    if (q.id) {
      if (seenQuestionIds.has(q.id)) problems.push({ code: 'DUPLICATE_ID', message: 'A question id is used twice', path: qp });
      seenQuestionIds.add(q.id);
    }
    if (q.prompt.length === 0) problems.push({ code: 'PROMPT_REQUIRED', message: 'The question text is required', path: `${qp}.prompt` });
    if (q.prompt.length > L.promptMax) problems.push({ code: 'PROMPT_TOO_LONG', message: `The question text can be at most ${L.promptMax} characters`, path: `${qp}.prompt` });
    if (q.options.length > L.optionsMax) problems.push({ code: 'TOO_MANY_OPTIONS', message: `A question can have at most ${L.optionsMax} options`, path: `${qp}.options` });
    q.options.forEach((o, oi) => {
      const op = `${qp}.options[${oi}]`;
      if (o.id) {
        if (seenOptionIds.has(o.id)) problems.push({ code: 'DUPLICATE_ID', message: 'An option id is used twice', path: op });
        seenOptionIds.add(o.id);
      }
      if (o.text.length === 0) problems.push({ code: 'OPTION_TEXT_REQUIRED', message: 'The answer text is required', path: `${op}.text` });
      if (o.text.length > L.optionTextMax) problems.push({ code: 'OPTION_TEXT_TOO_LONG', message: `The answer text can be at most ${L.optionTextMax} characters`, path: `${op}.text` });
      if (!isObject(o.scores)) {
        problems.push({ code: 'SCORES_REQUIRED', message: 'Every answer needs its points for BEGINNER, INTERMEDIATE and ADVANCED', path: `${op}.scores` });
      } else {
        for (const level of Object.keys(o.scores)) {
          if (!(LEARNING_LEVELS as readonly string[]).includes(level)) problems.push({ code: 'UNKNOWN_LEVEL', message: `"${level}" is not a learning level`, path: `${op}.scores` });
        }
        for (const level of LEARNING_LEVELS) {
          const points = (o.scores as Record<string, unknown>)[level];
          if (points === undefined) problems.push({ code: 'SCORE_MISSING', message: `The points for ${level} are missing`, path: `${op}.scores.${level}` });
          else if (typeof points !== 'number' || !Number.isInteger(points) || points < 0 || points > L.pointsMax) problems.push({ code: 'POINTS_INVALID', message: `Points must be whole numbers from 0 to ${L.pointsMax}`, path: `${op}.scores.${level}` });
        }
      }
    });
  });

  // The scoring configuration may be absent while drafting, but if it is there it must be well formed.
  if (content.scoringConfig !== null && content.scoringConfig !== undefined) problems.push(...parseScoringConfig(content.scoringConfig).problems);
  return problems;
}

/** Validates a scoring configuration. `config` is null when there is nothing usable. */
export function parseScoringConfig(raw: unknown): { config: ScoringConfig | null; problems: Problem[] } {
  const problems: Problem[] = [];
  if (!isObject(raw)) return { config: null, problems: [{ code: 'SCORING_INVALID', message: 'The scoring configuration must be an object', path: 'scoringConfig' }] };
  // Unsupported settings are refused, never silently ignored: a setting that is not applied would look approved.
  for (const key of Object.keys(raw)) {
    if (!SCORING_KEYS.includes(key)) problems.push({ code: 'SCORING_KEY_UNSUPPORTED', message: `Unsupported scoring setting "${key}". Supported: ${SCORING_KEYS.join(', ')}`, path: `scoringConfig.${key}` });
  }
  if (!(SCORING_STRATEGIES as readonly unknown[]).includes(raw.strategy)) problems.push({ code: 'SCORING_STRATEGY_INVALID', message: `The scoring strategy must be one of: ${SCORING_STRATEGIES.join(', ')}`, path: 'scoringConfig.strategy' });
  if (!(TIE_BREAKS as readonly unknown[]).includes(raw.tieBreak)) problems.push({ code: 'SCORING_TIE_BREAK_INVALID', message: `tieBreak must be one of: ${TIE_BREAKS.join(', ')}`, path: 'scoringConfig.tieBreak' });
  if (typeof raw.requireAllQuestions !== 'boolean') problems.push({ code: 'SCORING_REQUIRE_ALL_INVALID', message: 'requireAllQuestions must be true or false', path: 'scoringConfig.requireAllQuestions' });
  let resultMessages: Partial<Record<LearningLevel, string>> | undefined;
  if (raw.resultMessages !== undefined && raw.resultMessages !== null) {
    if (!isObject(raw.resultMessages)) problems.push({ code: 'SCORING_MESSAGES_INVALID', message: 'resultMessages must be an object keyed by level', path: 'scoringConfig.resultMessages' });
    else {
      resultMessages = {};
      for (const [level, message] of Object.entries(raw.resultMessages)) {
        if (!(LEARNING_LEVELS as readonly string[]).includes(level)) problems.push({ code: 'UNKNOWN_LEVEL', message: `"${level}" is not a learning level`, path: 'scoringConfig.resultMessages' });
        else if (typeof message !== 'string' || clean(message).length > ASSESSMENT_LIMITS.resultMessageMax) problems.push({ code: 'SCORING_MESSAGE_INVALID', message: `A result message must be text of at most ${ASSESSMENT_LIMITS.resultMessageMax} characters`, path: `scoringConfig.resultMessages.${level}` });
        else if (clean(message) !== '') resultMessages[level as LearningLevel] = clean(message);
      }
    }
  }
  if (problems.length > 0) return { config: null, problems };
  return {
    config: {
      strategy: raw.strategy as ScoringConfig['strategy'],
      tieBreak: raw.tieBreak as ScoringConfig['tieBreak'],
      requireAllQuestions: raw.requireAllQuestions as boolean,
      ...(resultMessages && Object.keys(resultMessages).length > 0 ? { resultMessages } : {}),
    },
    problems: [],
  };
}

// -------------------------------------------------------------------------------------------------------------------------- publishing validation

/** Everything that must be true before an assessment can be published. Blocking problems and non-blocking warnings. */
export function validateForPublishing(assessment: AssessmentWithQuestions): ValidationReport {
  const problems: Problem[] = [];
  const warnings: Problem[] = [];
  const L = ASSESSMENT_LIMITS;

  if (assessment.scoringConfig === null) {
    problems.push({ code: 'SCORING_NOT_CONFIGURED', message: 'The scoring configuration is not set. Choose how the level is recommended before publishing.', path: 'scoringConfig' });
  } else {
    problems.push(...parseScoringConfig(assessment.scoringConfig).problems);
  }
  if (assessment.questions.length === 0) problems.push({ code: 'NO_QUESTIONS', message: 'Add at least one question', path: 'questions' });

  const reachable = new Set<LearningLevel>();
  assessment.questions.forEach((q, qi) => {
    const qp = `questions[${qi}]`;
    if (q.options.length < L.optionsMin) problems.push({ code: 'TOO_FEW_OPTIONS', message: `Question ${qi + 1} needs at least ${L.optionsMin} answer options`, path: `${qp}.options` });
    const texts = new Set<string>();
    for (const [oi, o] of q.options.entries()) {
      // Stored points must be complete (a row written outside the API could be incomplete): the snapshot freezes exactly these.
      for (const level of LEARNING_LEVELS) {
        const points = o.scores[level];
        if (!Number.isInteger(points) || points < 0 || points > L.pointsMax) problems.push({ code: 'POINTS_INVALID', message: `Question ${qi + 1}, answer ${oi + 1}: the points for ${level} must be a whole number from 0 to ${L.pointsMax}`, path: `${qp}.options[${oi}].scores.${level}` });
      }
      const key = o.text.toLocaleLowerCase();
      if (texts.has(key)) problems.push({ code: 'DUPLICATE_OPTION_TEXT', message: `Question ${qi + 1} has two answers with the same text`, path: `${qp}.options` });
      texts.add(key);
      for (const level of LEARNING_LEVELS) if (o.scores[level] > 0) reachable.add(level);
    }
    if (!q.options.some((o) => LEARNING_LEVELS.some((level) => o.scores[level] > 0))) {
      warnings.push({ code: 'QUESTION_HAS_NO_POINTS', message: `No answer to question ${qi + 1} gives points to any level, so it cannot influence the recommendation`, path: qp });
    } else if (q.options.length > 1 && q.options.every((o) => LEARNING_LEVELS.every((level) => o.scores[level] === q.options[0].scores[level]))) {
      warnings.push({ code: 'QUESTION_NOT_DISCRIMINATING', message: `Every answer to question ${qi + 1} gives the same points, so it cannot influence the recommendation`, path: qp });
    }
  });
  for (const level of LEARNING_LEVELS) {
    if (!reachable.has(level) && assessment.questions.length > 0) warnings.push({ code: 'LEVEL_UNREACHABLE', message: `No answer gives points to ${level}, so it can only be recommended through the tie-break`, path: 'questions' });
  }
  return { problems, warnings };
}

// -------------------------------------------------------------------------------------------------------------------------- published snapshot

/** What a publication stores, immutably. Submissions are validated and scored against THIS, never against the working copy. */
export interface PublishedSnapshot {
  schemaVersion: 1;
  assessmentId: string;
  /** The publication's own number for this assessment (1, 2, ...): what clients send back. */
  version: number;
  title: string;
  description: string | null;
  scoring: ScoringConfig;
  questions: {
    id: string;
    position: number;
    type: QuestionType;
    prompt: string;
    options: { id: string; position: number; text: string; scores: LevelPoints }[];
  }[];
}

export function buildSnapshot(assessment: AssessmentWithQuestions, version: number): PublishedSnapshot {
  if (assessment.scoringConfig === null) throw new BusinessRuleError('The scoring configuration is not set', { code: 'SCORING_NOT_CONFIGURED' });
  return {
    schemaVersion: 1,
    assessmentId: assessment.id,
    version,
    title: assessment.title,
    description: assessment.description,
    scoring: assessment.scoringConfig,
    questions: assessment.questions.map((q) => ({
      id: q.id,
      position: q.position,
      type: q.type,
      prompt: q.prompt,
      options: q.options.map((o) => ({ id: o.id, position: o.position, text: o.text, scores: { ...o.scores } })),
    })),
  };
}

export const snapshotHash = (snapshot: PublishedSnapshot): string => createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');

// -------------------------------------------------------------------------------------------------------------------------- learner view and scoring

/** What a learner's device gets: no points, no scoring secrets, no editorial data. */
export interface PublicAssessment {
  assessmentId: string;
  version: number;
  title: string;
  instructions: string | null;
  /** The only configuration a client needs to render the assessment. */
  requireAllQuestions: boolean;
  questions: { id: string; position: number; type: QuestionType; prompt: string; options: { id: string; position: number; text: string }[] }[];
}

export function toPublicAssessment(snapshot: PublishedSnapshot): PublicAssessment {
  return {
    assessmentId: snapshot.assessmentId,
    version: snapshot.version,
    title: snapshot.title,
    instructions: snapshot.description,
    requireAllQuestions: snapshot.scoring.requireAllQuestions,
    questions: snapshot.questions.map((q) => ({
      id: q.id,
      position: q.position,
      type: q.type,
      prompt: q.prompt,
      options: q.options.map((o) => ({ id: o.id, position: o.position, text: o.text })),
    })),
  };
}

export interface SubmittedAnswer {
  questionId: string;
  optionId: string;
}

export interface AssessmentResult {
  assessmentId: string;
  version: number;
  recommendedLevel: LearningLevel;
  /** Total points per level, from the stored configuration. */
  scores: LevelPoints;
  /** The levels that shared the highest total (more than one means the tie-break decided). */
  tiedLevels: LearningLevel[];
  answered: number;
  total: number;
  /** The staff-written message for the recommended level, if one was configured. */
  message: string | null;
}

/**
 * Scores one attempt against a published snapshot. Deterministic: the same answers always give the same result. Rejects (422) answers that do not belong
 * to the snapshot, a question answered twice, and (when the configuration says so) missing answers. The client never supplies points, a score or a level.
 *
 * LEVEL_POINTS: total each level's points over the chosen options; the recommendation is the level with the highest total. If several levels share the
 * highest total (all zero included), the configured tie-break picks the lowest or the highest of them.
 */
export function scoreAttempt(snapshot: PublishedSnapshot, answers: readonly SubmittedAnswer[]): AssessmentResult {
  const questions = new Map(snapshot.questions.map((q) => [q.id, q]));
  const chosen = new Map<string, PublishedSnapshot['questions'][number]['options'][number]>();
  const invalid: SubmittedAnswer[] = [];
  const duplicated = new Set<string>();

  for (const answer of answers) {
    const question = questions.get(answer.questionId);
    const option = question?.options.find((o) => o.id === answer.optionId);
    if (!question || !option) {
      invalid.push(answer);
      continue;
    }
    if (chosen.has(question.id)) duplicated.add(question.id);
    else chosen.set(question.id, option);
  }
  if (invalid.length > 0) throw new BusinessRuleError('Some answers do not belong to this assessment version', { code: 'INVALID_ANSWER', answers: invalid });
  if (duplicated.size > 0) throw new BusinessRuleError('A question can be answered only once', { code: 'DUPLICATE_ANSWER', questionIds: [...duplicated] });
  if (chosen.size === 0) throw new BusinessRuleError('Answer at least one question', { code: 'NO_ANSWERS' });
  if (snapshot.scoring.requireAllQuestions && chosen.size !== snapshot.questions.length) {
    throw new BusinessRuleError('Every question must be answered', { code: 'MISSING_ANSWERS', missing: snapshot.questions.filter((q) => !chosen.has(q.id)).map((q) => q.id) });
  }

  const scores = zeroPoints();
  for (const option of chosen.values()) for (const level of LEARNING_LEVELS) scores[level] += option.scores[level] ?? 0;

  const best = Math.max(...LEARNING_LEVELS.map((level) => scores[level]));
  const tiedLevels = LEARNING_LEVELS.filter((level) => scores[level] === best);
  const recommendedLevel = snapshot.scoring.tieBreak === 'HIGHER_LEVEL' ? tiedLevels[tiedLevels.length - 1] : tiedLevels[0];

  return {
    assessmentId: snapshot.assessmentId,
    version: snapshot.version,
    recommendedLevel,
    scores,
    tiedLevels,
    answered: chosen.size,
    total: snapshot.questions.length,
    message: snapshot.scoring.resultMessages?.[recommendedLevel] ?? null,
  };
}
