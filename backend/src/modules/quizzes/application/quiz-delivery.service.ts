import { Injectable } from '@nestjs/common';
import {
  BusinessRuleError,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import {
  type Answer,
  type PublicQuiz,
  type SubmissionResult,
  checkAnswers,
  questionsForLevel,
  scoreSubmission,
  toPublicQuiz,
} from '../domain/quiz-rules.js';
import { QuizRepository } from '../persistence/quiz.repository.js';

/**
 * The learner-facing side: read a PUBLISHED quiz, and check a set of answers against it. Both are stateless: nothing
 * about a submission is stored (there are no learner accounts, and storing attempts is not a confirmed requirement).
 * A quiz that is a draft, unpublished or unknown is the same 404, so a draft cannot be told from a missing quiz.
 */
@Injectable()
export class QuizDeliveryService {
  constructor(private readonly quizzes: QuizRepository) {}

  /** The quiz as a learner may see it: no correct answers, no explanations. */
  async read(id: string, level?: string): Promise<PublicQuiz> {
    return toPublicQuiz(await this.requirePublished(id), level);
  }

  /**
   * Scores the answers. The result is the first and only place the correct options and explanations appear.
   * Unanswered questions score 0; answers that do not fit the quiz are refused as a whole (nothing is partly scored).
   */
  async submit(
    id: string,
    answers: readonly Answer[],
    level?: string,
  ): Promise<SubmissionResult> {
    const quiz = await this.requirePublished(id);
    // With a level, only the questions enabled at it exist for this submission (an answer for any other question is refused as not belonging to the quiz).
    const questions = questionsForLevel(quiz.questions, level);
    const problems = checkAnswers(questions, answers);
    if (problems.length > 0) {
      throw new BusinessRuleError('The answers do not fit this quiz', problems);
    }
    return scoreSubmission(quiz.id, questions, answers);
  }

  private async requirePublished(id: string) {
    const quiz = await this.quizzes.findWithQuestions(id);
    if (!quiz || quiz.status !== 'PUBLISHED') {
      throw new NotFoundError('Quiz not found');
    }
    return quiz;
  }
}
