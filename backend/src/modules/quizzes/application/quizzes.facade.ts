import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { QUESTION_TYPES, type QuestionScriptureEntry, type QuestionType, checkQuizContent } from '../domain/quiz-rules.js';
import { QuizRepository } from '../persistence/quiz.repository.js';

/** A quiz as a lesson needs it: plain data, never a persistence object. Includes answers; used only to freeze a lesson snapshot. */
export interface QuizForLesson {
  id: string;
  title: string;
  description: string | null;
  /** Changes with every edit of the quiz; a lesson block remembers the version it was added at. */
  version: number;
  questions: {
    id: string;
    type: QuestionType;
    prompt: string;
    explanation: string | null;
    correctOptionId: string;
    /** Levels the question is shown at; null = every level. */
    levels: string[] | null;
    /** Optional Scripture reference(s) of the question; null = none. */
    scripture: QuestionScriptureEntry[] | null;
    options: { id: string; text: string; feedback: string | null }[];
  }[];
  /**
   * Why the quiz cannot be put into a lesson as it stands (empty when it can): the existing completeness rules applied to what is
   * stored, plus any question type the learner app cannot show. Questions are never skipped: one problem blocks the whole quiz.
   */
  problems: string[];
}

/** What other modules (Lessons) may ask of Quizzes. */
@Injectable()
export class QuizzesFacade {
  constructor(private readonly quizzes: QuizRepository) {}

  /**
   * The quiz with its questions, whatever its own draft/published status (a lesson snapshot is its own frozen copy).
   *
   * With a `manager` (a lesson publication or approval check) the quiz row is share-locked until that transaction ends, so what is
   * validated is what is snapshotted and no edit can slip in between. Without one (advisory preview) the read is repeated until
   * the version is the same before and after the questions were read, so it is never a mix of two versions.
   */
  async findForLesson(id: string, manager?: EntityManager): Promise<QuizForLesson | null> {
    if (manager && (await this.quizzes.lockShared(id, manager)) === null) return null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const before = await this.quizzes.find(id, manager);
      if (!before) return null;
      const questions = await this.quizzes.questionsOf(id, manager);
      const after = manager ? before : await this.quizzes.find(id);
      if (after && after.version === before.version) return toQuizForLesson({ ...before, questions });
    }
    return null;
  }

  /** Share-locks the quiz row for the rest of the transaction and returns its current version; null if the quiz does not exist. */
  lockForReference(id: string, manager: EntityManager): Promise<number | null> {
    return this.quizzes.lockShared(id, manager);
  }

  /** How many lessons have a QUIZ block pointing at the quiz (working content only; published snapshots hold their own copy). */
  async countLessonReferences(id: string, manager?: EntityManager): Promise<number> {
    return this.quizzes.countLessonReferences(id, manager);
  }
}

function toQuizForLesson(quiz: {
  id: string;
  title: string;
  description: string | null;
  version: number;
  questions: {
    id: string;
    type: QuestionType;
    prompt: string;
    explanation: string | null;
    correctOptionId: string;
    levels: string[] | null;
    scripture?: QuestionScriptureEntry[] | null;
    options: { id: string; text: string; feedback?: string | null }[];
  }[];
}): QuizForLesson {
  const problems = checkQuizContent({
    title: quiz.title,
    description: quiz.description,
    questions: quiz.questions.map((question) => ({
      levels: question.levels,
      prompt: question.prompt,
      explanation: question.explanation,
      scripture: question.scripture,
      options: question.options.map((option) => ({ text: option.text, correct: option.id === question.correctOptionId, feedback: option.feedback })),
    })),
  });
  quiz.questions.forEach((question, index) => {
    if (!(QUESTION_TYPES as readonly string[]).includes(question.type)) {
      problems.push(`Question ${index + 1}: its question type (${question.type}) cannot be shown to learners yet`);
    }
  });
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    version: quiz.version,
    questions: quiz.questions.map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      explanation: question.explanation,
      correctOptionId: question.correctOptionId,
      levels: question.levels,
      scripture: question.scripture ?? null,
      options: question.options.map((option) => ({ id: option.id, text: option.text, feedback: option.feedback ?? null })),
    })),
    problems,
  };
}
