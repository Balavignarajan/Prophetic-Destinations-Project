import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  checkExpectedVersion,
} from '../../../shared-kernel/index.js';
import {
  type QuizInput,
  type QuizWithQuestions,
  checkQuizContent,
  normalizeQuiz,
  publishProblems,
} from '../domain/quiz-rules.js';
import { QuizRepository } from '../persistence/quiz.repository.js';

/**
 * Authoring of quizzes (staff only; the HTTP layer enforces the roles). Every write is ONE transaction that locks the
 * quiz row first, so concurrent edits queue up and a stale `version` is refused.
 *
 * A quiz is DRAFT or PUBLISHED. Only a DRAFT can be edited or deleted (the database also freezes the questions of a
 * published quiz); publishing needs at least one question. There is no review workflow for quizzes yet.
 */
@Injectable()
export class QuizService {
  constructor(
    private readonly quizzes: QuizRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  list(limit: number, offset: number) {
    return this.quizzes.list(limit, offset);
  }

  async get(id: string): Promise<QuizWithQuestions> {
    const quiz = await this.quizzes.findWithQuestions(id);
    if (!quiz) throw new NotFoundError('Quiz not found');
    return quiz;
  }

  async create(actorId: string, input: QuizInput): Promise<QuizWithQuestions> {
    const content = this.validated(input);
    const id = await this.transactions.run(async (manager) => {
      const created = await this.quizzes.insertQuiz(
        {
          title: content.title,
          description: content.description ?? null,
          createdBy: actorId,
        },
        manager,
      );
      await this.quizzes.replaceQuestions(created, content.questions, manager);
      return created;
    });
    return this.get(id);
  }

  /** Replaces the whole content of a DRAFT quiz. `expectedVersion`, if given, must be the version the editor saw. */
  async update(
    id: string,
    input: QuizInput,
    expectedVersion?: number,
  ): Promise<QuizWithQuestions> {
    const content = this.validated(input);
    await this.transactions.run(async (manager) => {
      const quiz = await this.quizzes.lock(id, manager);
      if (!quiz) throw new NotFoundError('Quiz not found');
      if (quiz.status === 'PUBLISHED') {
        throw new ConflictError(
          'A published quiz cannot be edited. Unpublish it first.',
        );
      }
      checkExpectedVersion(quiz.version, expectedVersion);
      await this.quizzes.replaceQuestions(id, content.questions, manager);
      await this.quizzes.touch(
        id,
        { title: content.title, description: content.description ?? null },
        manager,
      );
    });
    return this.get(id);
  }

  async publish(id: string): Promise<QuizWithQuestions> {
    await this.transactions.run(async (manager) => {
      const quiz = await this.quizzes.lock(id, manager);
      if (!quiz) throw new NotFoundError('Quiz not found');
      if (quiz.status === 'PUBLISHED') {
        throw new ConflictError('The quiz is already published');
      }
      const questions = await this.quizzes.questionsOf(id, manager);
      const problems = publishProblems(questions.length);
      if (problems.length > 0) {
        throw new BusinessRuleError(
          'The quiz is not ready to be published',
          problems,
        );
      }
      await this.quizzes.setStatus(id, 'PUBLISHED', manager);
    });
    return this.get(id);
  }

  async unpublish(id: string): Promise<QuizWithQuestions> {
    await this.transactions.run(async (manager) => {
      const quiz = await this.quizzes.lock(id, manager);
      if (!quiz) throw new NotFoundError('Quiz not found');
      if (quiz.status !== 'PUBLISHED') {
        throw new ConflictError('The quiz is not published');
      }
      await this.quizzes.setStatus(id, 'DRAFT', manager);
    });
    return this.get(id);
  }

  async delete(id: string): Promise<void> {
    await this.transactions.run(async (manager) => {
      const quiz = await this.quizzes.lock(id, manager);
      if (!quiz) throw new NotFoundError('Quiz not found');
      if (quiz.status === 'PUBLISHED') {
        throw new ConflictError(
          'A published quiz cannot be deleted. Unpublish it first.',
        );
      }
      await this.quizzes.delete(id, manager);
    });
  }

  private validated(input: QuizInput): QuizInput {
    const content = normalizeQuiz(input);
    const problems = checkQuizContent(content);
    if (problems.length > 0) {
      throw new BusinessRuleError('The quiz is not valid', problems);
    }
    return content;
  }
}
