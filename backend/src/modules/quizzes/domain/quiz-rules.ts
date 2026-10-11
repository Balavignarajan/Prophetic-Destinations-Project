/**
 * Quiz content rules and scoring (pure; no database).
 *
 * ASSUMPTIONS (not confirmed requirements; see docs/architecture.md, "Quizzes"): one question type, SINGLE_CHOICE, with
 * plain-text prompt and options; exactly one correct option per question; the correct answers are shown only in the
 * result of a submission; nothing about a submission is stored. The limits below are demo-friendly defaults.
 */
export const QUESTION_TYPES = ['SINGLE_CHOICE'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUIZ_LIMITS = {
  titleMax: 200,
  descriptionMax: 2000,
  questionsMax: 50,
  promptMax: 1000,
  explanationMax: 1000,
  optionsMin: 2,
  optionsMax: 6,
  optionTextMax: 300,
} as const;

/** What an author supplies for a question. Option order is the order shown to learners. */
export interface QuestionInput {
  prompt: string;
  explanation?: string | null;
  options: { text: string; correct: boolean }[];
}

export interface QuizInput {
  title: string;
  description?: string | null;
  questions: QuestionInput[];
}

/** A question with the ids it was stored under (the correct option is identified by id, never by position). */
export interface StoredQuestion {
  id: string;
  position: number;
  type: QuestionType;
  prompt: string;
  explanation: string | null;
  correctOptionId: string;
  options: { id: string; position: number; text: string }[];
}

export type QuizStatus = 'DRAFT' | 'PUBLISHED';

export interface Quiz {
  id: string;
  title: string;
  description: string | null;
  status: QuizStatus;
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}

export interface QuizWithQuestions extends Quiz {
  questions: StoredQuestion[];
}

const clean = (text: string) => text.trim().replace(/\s+/g, ' ');

/** Trims text fields and turns blank optional ones into null (so equal content is stored equally). */
export function normalizeQuiz(input: QuizInput): QuizInput {
  const optional = (value: string | null | undefined) => {
    const text = value?.trim() ?? '';
    return text === '' ? null : text;
  };
  return {
    title: clean(input.title),
    description: optional(input.description),
    questions: input.questions.map((question) => ({
      prompt: question.prompt.trim(),
      explanation: optional(question.explanation),
      options: question.options.map((option) => ({
        text: clean(option.text),
        correct: option.correct === true,
      })),
    })),
  };
}

/** Every reason the (normalized) content is unacceptable; empty when it is fine. */
export function checkQuizContent(quiz: QuizInput): string[] {
  const problems: string[] = [];
  const L = QUIZ_LIMITS;
  if (quiz.title === '') problems.push('The title must not be empty');
  if (quiz.title.length > L.titleMax) {
    problems.push(`The title must be at most ${L.titleMax} characters`);
  }
  if ((quiz.description?.length ?? 0) > L.descriptionMax) {
    problems.push(
      `The description must be at most ${L.descriptionMax} characters`,
    );
  }
  if (quiz.questions.length > L.questionsMax) {
    problems.push(`A quiz can have at most ${L.questionsMax} questions`);
  }
  quiz.questions.forEach((question, index) => {
    const at = `Question ${index + 1}`;
    if (question.prompt === '')
      problems.push(`${at}: the prompt must not be empty`);
    if (question.prompt.length > L.promptMax) {
      problems.push(
        `${at}: the prompt must be at most ${L.promptMax} characters`,
      );
    }
    if ((question.explanation?.length ?? 0) > L.explanationMax) {
      problems.push(
        `${at}: the explanation must be at most ${L.explanationMax} characters`,
      );
    }
    const options = question.options;
    if (options.length < L.optionsMin || options.length > L.optionsMax) {
      problems.push(
        `${at}: it needs between ${L.optionsMin} and ${L.optionsMax} options`,
      );
    }
    if (options.some((option) => option.text === '')) {
      problems.push(`${at}: an option text must not be empty`);
    }
    if (options.some((option) => option.text.length > L.optionTextMax)) {
      problems.push(
        `${at}: an option text must be at most ${L.optionTextMax} characters`,
      );
    }
    const correct = options.filter((option) => option.correct).length;
    if (correct !== 1) {
      problems.push(
        `${at}: exactly one option must be marked correct (found ${correct})`,
      );
    }
    const texts = options.map((option) => option.text.toLowerCase());
    if (new Set(texts).size !== texts.length) {
      problems.push(`${at}: two options have the same text`);
    }
  });
  return problems;
}

/** Why a quiz cannot be published yet; empty when it can. */
export function publishProblems(questionCount: number): string[] {
  return questionCount === 0
    ? ['A quiz needs at least one question to be published']
    : [];
}

// ---- what a learner sees, and what a submission returns ------------------------------------------------------

/** The learner-facing quiz. It has no field that could carry the answer or the explanation. */
export interface PublicQuiz {
  id: string;
  title: string;
  description: string | null;
  questions: {
    id: string;
    type: QuestionType;
    prompt: string;
    options: { id: string; text: string }[];
  }[];
}

export function toPublicQuiz(quiz: QuizWithQuestions): PublicQuiz {
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    questions: quiz.questions.map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      options: question.options.map((option) => ({
        id: option.id,
        text: option.text,
      })),
    })),
  };
}

export interface Answer {
  questionId: string;
  optionId: string;
}

export interface QuestionResult {
  questionId: string;
  /** The option the learner chose, or null if the question was not answered. */
  answeredOptionId: string | null;
  correct: boolean;
  correctOptionId: string;
  explanation: string | null;
}

export interface SubmissionResult {
  quizId: string;
  score: number;
  total: number;
  results: QuestionResult[];
}

/** Why a submission cannot be scored; empty when it can. Unanswered questions are allowed (they score 0). */
export function checkAnswers(
  questions: readonly StoredQuestion[],
  answers: readonly Answer[],
): string[] {
  const problems: string[] = [];
  const byId = new Map(questions.map((question) => [question.id, question]));
  const seen = new Set<string>();
  for (const answer of answers) {
    const question = byId.get(answer.questionId);
    if (!question) {
      problems.push('An answer is for a question that is not in this quiz');
    } else if (
      !question.options.some((option) => option.id === answer.optionId)
    ) {
      problems.push(
        'An answer chooses an option that does not belong to its question',
      );
    }
    if (seen.has(answer.questionId)) {
      problems.push('A question was answered more than once');
    }
    seen.add(answer.questionId);
  }
  return [...new Set(problems)];
}

/** Scores a checked submission: one point per correctly answered question, in the quiz's own order. */
export function scoreSubmission(
  quizId: string,
  questions: readonly StoredQuestion[],
  answers: readonly Answer[],
): SubmissionResult {
  const chosen = new Map(
    answers.map((answer) => [answer.questionId, answer.optionId]),
  );
  const results = questions.map((question): QuestionResult => {
    const answeredOptionId = chosen.get(question.id) ?? null;
    return {
      questionId: question.id,
      answeredOptionId,
      correct: answeredOptionId === question.correctOptionId,
      correctOptionId: question.correctOptionId,
      explanation: question.explanation,
    };
  });
  return {
    quizId,
    score: results.filter((result) => result.correct).length,
    total: questions.length,
    results,
  };
}
