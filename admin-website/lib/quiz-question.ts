import type { QuizQuestion } from './types';

/**
 * The two OPTIONAL parts of a quiz question (backend/src/modules/quizzes/domain/quiz-rules.ts): its Scripture reference(s) and each answer option's feedback.
 * Both are left out of what is sent when empty, so a quiz that uses neither is saved exactly as before.
 */
export const QUESTION_SCRIPTURE_MAX = 3;
export const OPTION_FEEDBACK_MAX = 500;

/**
 * One question as the quiz API takes it, for creating, editing and duplicating alike (the three places must send the same thing). The Scripture is sent as
 * references only: the text is never stored with the quiz, it is read from the installed Scripture text when a lesson that uses the quiz is published.
 */
export function questionPayload(q: QuizQuestion) {
  return {
    levels: q.levels ?? null,
    prompt: q.prompt.trim(),
    explanation: q.explanation?.trim() || null,
    scripture: q.scripture && q.scripture.length > 0 ? q.scripture.map((entry) => ({ reference: entry.reference })) : null,
    options: q.options.map((o) => ({
      text: o.text.trim(),
      correct: o.correct,
      feedback: o.feedback?.trim() || null,
    })),
  };
}
