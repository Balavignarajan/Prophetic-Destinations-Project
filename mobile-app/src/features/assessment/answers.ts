import type { PublicAssessment, SubmittedAnswer } from './assessment-types';

/** The learner's choices while answering: question id -> option id. One entry per question, so a question can never be answered twice. */
export type AnswerMap = Readonly<Record<string, string>>;

export function selectAnswer(answers: AnswerMap, questionId: string, optionId: string): AnswerMap {
  return { ...answers, [questionId]: optionId };
}

/** The request body's answers, in question order, only for questions that are answered AND whose option really belongs to that question. */
export function toSubmittedAnswers(assessment: PublicAssessment, answers: AnswerMap): SubmittedAnswer[] {
  return assessment.questions.flatMap((question) => {
    const optionId = answers[question.id];
    return optionId !== undefined && question.options.some((o) => o.id === optionId) ? [{ questionId: question.id, optionId }] : [];
  });
}

/** Indexes (0-based) of the questions that have no answer. */
export function unansweredIndexes(assessment: PublicAssessment, answers: AnswerMap): number[] {
  return assessment.questions.flatMap((q, index) => (answers[q.id] === undefined ? [index] : []));
}

export const answeredCount = (assessment: PublicAssessment, answers: AnswerMap): number => assessment.questions.length - unansweredIndexes(assessment, answers).length;
