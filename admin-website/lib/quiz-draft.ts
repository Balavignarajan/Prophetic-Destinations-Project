import { newLocalId } from './quiz-order';
import { questionPayload } from './quiz-question';
import type { AdminQuiz, LearningLevel, QuizOption, QuizQuestion } from './types';

/**
 * The working copy of a quiz in the Quiz Builder, and everything pure about it: starting copies, duplicating a question, what is missing from a question, whether the copy differs from what was
 * loaded, what is sent to the server and what the phone preview is given. No React, no requests. Nothing here changes a saved quiz: the builder holds this copy until Save.
 *
 * The shape is the one the quiz API already uses (`QuizQuestion` and `QuizOption` of lib/types.ts). The ids of a loaded question and option are the server's, used only as React keys: a save
 * sends no ids (the server replaces the whole content of the draft and gives every question and option its own id), so a question or option that exists only in the builder needs only an id of
 * its own, made here with `newLocalId`.
 */

/** The server's limits for a quiz (backend quizzes/domain/quiz-rules.ts QUIZ_LIMITS). The builder quotes them; the server still checks every one. */
export const QUIZ_LIMITS = {
  title: 200,
  description: 2000,
  questions: 50,
  prompt: 1000,
  explanation: 1000,
  optionsMin: 2,
  optionsMax: 6,
  optionText: 300,
  optionFeedback: 500,
  scripture: 3,
} as const;

export const LEVELS: readonly LearningLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
export const LEVEL_NAMES: Record<LearningLevel, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

/** The levels a question is shown at: null or absent means every level (the default of a question that was never given a setting). */
export const questionLevels = (levels: string[] | null | undefined): string[] => (levels === null || levels === undefined ? [...LEVELS] : levels);
export const visibleAt = (levels: string[] | null | undefined, level: string): boolean => questionLevels(levels).includes(level);

export interface QuizDraft {
  title: string;
  description: string;
  questions: QuizQuestion[];
}

export const blankOption = (correct = false): QuizOption => ({ id: newLocalId('o'), text: '', correct });

export const blankQuestion = (): QuizQuestion => ({
  id: newLocalId('q'),
  type: 'SINGLE_CHOICE',
  prompt: '',
  explanation: '',
  options: [blankOption(true), blankOption(false)],
});

/** A new quiz starts with one blank question, as the old form did. */
export const newDraft = (): QuizDraft => ({ title: '', description: '', questions: [blankQuestion()] });

/** A deep copy of a saved quiz to edit; the saved quiz itself is never touched. */
export function draftFromQuiz(quiz: AdminQuiz): QuizDraft {
  return {
    title: quiz.title,
    description: quiz.description ?? '',
    questions: quiz.questions.map((q) => ({
      ...q,
      levels: q.levels ? [...q.levels] : q.levels,
      scripture: q.scripture ? q.scripture.map((entry) => ({ reference: { ...entry.reference } })) : q.scripture,
      options: q.options.map((o) => ({ ...o })),
    })),
  };
}

/**
 * A copy of a question for "Duplicate question": the same text, explanation, answers, correct answer, feedback, Scripture and levels, with an id of its own for the question and for every
 * answer, so it is a new question in the builder and nothing of the original's identity (a saved question's server id) is shared.
 */
export function copyQuestion(q: QuizQuestion): QuizQuestion {
  return {
    id: newLocalId('q'),
    type: q.type,
    prompt: q.prompt,
    explanation: q.explanation,
    levels: q.levels ? [...q.levels] : q.levels,
    scripture: q.scripture ? q.scripture.map((entry) => ({ reference: { ...entry.reference } })) : q.scripture,
    options: q.options.map((o) => ({ id: newLocalId('o'), text: o.text, correct: o.correct, feedback: o.feedback })),
  };
}

/** True when the question holds anything an author typed or chose (so removing it asks first). */
export const hasContent = (q: QuizQuestion): boolean =>
  q.prompt.trim() !== '' || (q.explanation ?? '').trim() !== '' || (q.scripture?.length ?? 0) > 0 || q.options.some((o) => o.text.trim() !== '' || (o.feedback ?? '').trim() !== '');

export interface QuestionIssue {
  code: 'prompt' | 'option-text' | 'correct' | 'levels' | 'duplicates' | 'option-count' | 'too-long';
  /** The few words shown beside the question in the list. */
  short: string;
  /** The sentence that finishes "Question 3: ..." in a message. */
  message: string;
}

/** Whitespace of any kind runs together into single spaces and case is ignored, as the server compares answers. */
const collapse = (text: string) =>
  Array.from(text)
    .map((char) => (char.trim() === '' ? ' ' : char))
    .join('')
    .split(' ')
    .filter((word) => word !== '')
    .join(' ')
    .toLowerCase();

/**
 * What stops a question from being saved, taken from the server's own rules (checkQuizContent): text in the question and in every answer, between 2 and 6 answers, exactly one correct answer,
 * no two answers with the same text, at least one level, and the length limits. It is guidance for the author; the server remains the judge, and nothing here is a publication rule.
 */
export function questionIssues(q: QuizQuestion): QuestionIssue[] {
  const issues: QuestionIssue[] = [];
  const L = QUIZ_LIMITS;
  if (q.prompt.trim() === '') issues.push({ code: 'prompt', short: 'Missing question text', message: 'the question text is empty' });
  if (q.options.length < L.optionsMin || q.options.length > L.optionsMax) issues.push({ code: 'option-count', short: `Needs ${L.optionsMin} to ${L.optionsMax} answers`, message: `it needs between ${L.optionsMin} and ${L.optionsMax} answers` });
  if (q.options.some((o) => o.text.trim() === '')) issues.push({ code: 'option-text', short: 'Missing answer text', message: 'an answer has no text' });
  if (q.options.filter((o) => o.correct).length !== 1) issues.push({ code: 'correct', short: 'Select correct answer', message: 'select the one correct answer' });
  const texts = q.options.map((o) => collapse(o.text)).filter((t) => t !== '');
  if (new Set(texts).size !== texts.length) issues.push({ code: 'duplicates', short: 'Duplicate answers', message: 'two answers have the same text' });
  if (Array.isArray(q.levels) && q.levels.length === 0) issues.push({ code: 'levels', short: 'Not visible at any level', message: 'choose at least one level' });
  if (q.prompt.trim().length > L.prompt || (q.explanation ?? '').trim().length > L.explanation || q.options.some((o) => collapse(o.text).length > L.optionText || (o.feedback ?? '').trim().length > L.optionFeedback)) {
    issues.push({ code: 'too-long', short: 'Text too long', message: 'some text is longer than allowed' });
  }
  return issues;
}

/** The first thing wrong with the whole quiz, in the words of the existing checks, or null when it can be sent. */
export function draftProblem(draft: QuizDraft): string | null {
  if (draft.title.trim() === '') return 'Give the quiz a title.';
  if (draft.title.trim().length > QUIZ_LIMITS.title) return `The title can be at most ${QUIZ_LIMITS.title} characters.`;
  if (draft.description.trim().length > QUIZ_LIMITS.description) return `The description can be at most ${QUIZ_LIMITS.description} characters.`;
  if (draft.questions.length > QUIZ_LIMITS.questions) return `A quiz can have at most ${QUIZ_LIMITS.questions} questions.`;
  for (let index = 0; index < draft.questions.length; index += 1) {
    const issue = questionIssues(draft.questions[index])[0];
    if (issue) return `Question ${index + 1}: ${issue.message}.`;
  }
  return null;
}

/**
 * A string that is the same for two copies exactly when an author would call them the same quiz. The ids are left out (a duplicated or moved question has new ones), the order of questions and of
 * answers counts, and an empty explanation, empty feedback and no Scripture or levels are the same thing however they were stored.
 */
export function fingerprint(draft: QuizDraft): string {
  return JSON.stringify({
    t: draft.title,
    d: draft.description,
    q: draft.questions.map((q) => ({
      p: q.prompt,
      e: q.explanation ?? '',
      l: q.levels ?? null,
      s: (q.scripture ?? []).map((entry) => entry.reference),
      o: q.options.map((o) => [o.text, o.correct, o.feedback ?? '']),
    })),
  });
}

/** What the quiz API takes for creating (POST) and for replacing the content of a draft (PUT, with the version added by the caller): the same payload the old forms sent. */
export function draftPayload(draft: QuizDraft) {
  return { title: draft.title.trim(), description: draft.description.trim() || null, questions: draft.questions.map(questionPayload) };
}

export interface PreviewPlan {
  /** Questions the chosen level would be given, as numbers in the working copy (1-based). */
  shown: number[];
  /** What is incomplete among them; the preview is not drawn while there is anything here. */
  problems: string[];
  /** The content for the phone's quiz, or null when there is nothing to show yet. */
  content: Record<string, unknown> | null;
}

/**
 * What the phone preview shows for one level, from the WORKING COPY (including changes not saved yet): the questions enabled at that level, in the working copy's order, in the shape the learner
 * app's quiz block takes. Nothing is invented: an incomplete question is reported by number and what is missing, and the quiz is not played until it is complete; no answer is guessed and no
 * question is filled in. A level with no questions says so.
 */
export function previewPlan(draft: QuizDraft, level: LearningLevel): PreviewPlan {
  const visible = draft.questions.map((q, index) => ({ q, number: index + 1 })).filter(({ q }) => visibleAt(q.levels, level));
  const problems = visible.flatMap(({ q, number }) => questionIssues(q).map((issue) => `Question ${number}: ${issue.message}.`));
  if (visible.length === 0 || problems.length > 0) return { shown: visible.map((v) => v.number), problems, content: null };
  return {
    shown: visible.map((v) => v.number),
    problems,
    content: {
      quiz: {
        title: draft.title.trim(),
        description: draft.description.trim(),
        questions: visible.map(({ q }) => ({
          id: q.id,
          type: 'SINGLE_CHOICE',
          prompt: q.prompt.trim(),
          explanation: q.explanation?.trim() || null,
          correctOptionId: q.options.find((o) => o.correct)?.id ?? '',
          scripture: q.scripture && q.scripture.length > 0 ? q.scripture : [],
          options: q.options.map((o) => ({ id: o.id, text: o.text.trim(), feedback: o.feedback?.trim() || null })),
        })),
      },
    },
  };
}
