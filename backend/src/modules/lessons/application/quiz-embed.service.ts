import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { LearningLevel } from '../../../shared-kernel/index.js';
import { QuizzesFacade } from '../../quizzes/application/quizzes.facade.js';
import { quizIdOf, quizVersionOf } from '../domain/blocks/quiz.js';
import type { ContentProblem } from '../domain/blocks/rich-text.js';
import type { ResolvedBlock } from '../domain/level-resolution.js';

export interface EmbedProblem {
  blockId: string;
  problems: ContentProblem[];
}

/**
 * Replaces the reference in each resolved QUIZ block by the quiz itself, as it is right now:
 *
 *   { quizId, quizVersion, quiz: { title, description, questions: [{ id, type, prompt, explanation, correctOptionId,
 *                                                                    options: [{ id, text }] }] } }
 *
 * This is what a lesson snapshot freezes. The correct option and the explanation ARE part of it, on purpose: the learner app
 * checks answers on the device so a quiz works offline. That content is delivered by the public lesson endpoint, so it cannot be
 * kept secret from someone who looks at the response.
 *
 * LEVELS: the freezing is done per level (`level` is the level being resolved). Only the questions enabled at that level are put into the frozen quiz, on the
 * server, so a Beginner snapshot does not contain an Advanced-only question or its answer at all. A question without a level setting (every question created
 * before levels existed) is enabled at every level. The whole quiz is still validated first (one malformed question anywhere blocks the block; nothing is
 * silently dropped by filtering), and a quiz block that is visible at a level where NO question is enabled is reported as a problem for that level instead
 * of being published as an empty quiz.
 *
 * Consistency: with a `manager` the quiz row is share-locked until the surrounding transaction ends (see QuizzesFacade), so the
 * version checked here is the version snapshotted, and no quiz edit can land between the check and the snapshot. A block whose quiz is missing, empty or edited since the block was saved is
 * reported as a problem (not ready to publish) and keeps its plain reference.
 */
@Injectable()
export class QuizEmbedService {
  constructor(private readonly quizzes: QuizzesFacade) {}

  async embed(
    blocks: readonly ResolvedBlock[],
    manager?: EntityManager,
    level?: LearningLevel,
  ): Promise<{ blocks: ResolvedBlock[]; problems: EmbedProblem[] }> {
    const problems: EmbedProblem[] = [];
    const out: ResolvedBlock[] = [];
    for (const block of blocks) {
      if (block.type !== 'QUIZ' || block.content === null || block.source === null) {
        out.push(block);
        continue;
      }
      const quizId = quizIdOf(block.content);
      if (!quizId) {
        out.push(block); // an empty or malformed reference is reported by the block type's own completeness check
        continue;
      }
      const quiz = await this.quizzes.findForLesson(quizId, manager);
      const fail = (message: string) => {
        problems.push({ blockId: block.blockId, problems: [{ path: 'quizId', message }] });
        out.push(block);
      };
      if (!quiz) {
        fail('The quiz chosen for this lesson no longer exists. Choose another quiz.');
        continue;
      }
      if (quiz.questions.length === 0) {
        fail(`The quiz "${quiz.title}" has no questions yet. Add at least one question to it, then save this quiz block again.`);
        continue;
      }
      if (quiz.problems.length > 0) {
        // Never publish part of a quiz: one unsupported or incomplete question blocks the whole block, so a score always means all questions.
        fail(`The quiz "${quiz.title}" cannot be published yet: ${quiz.problems.join('; ')}. Fix the quiz, then save this quiz block again.`);
        continue;
      }
      const chosen = quizVersionOf(block.content);
      if (chosen !== quiz.version) {
        fail(`The quiz "${quiz.title}" was changed (edited, published or unpublished) after it was added to this lesson. Open the quiz block and save it again to use the latest version; the lesson will then need approval again.`);
        continue;
      }
      const eligible = level === undefined ? quiz.questions : quiz.questions.filter((question) => question.levels === null || question.levels.includes(level));
      if (eligible.length === 0) {
        fail(`No question of the quiz "${quiz.title}" is enabled for the ${level} level, so this quiz block would be empty there. Enable at least one question for ${level} in the quiz, or hide this quiz block at ${level}; then save the quiz block again.`);
        continue;
      }
      out.push({
        ...block,
        content: {
          quizId: quiz.id,
          quizVersion: quiz.version,
          quiz: {
            title: quiz.title,
            description: quiz.description,
            questions: eligible.map((question) => ({
              id: question.id,
              type: question.type,
              prompt: question.prompt,
              explanation: question.explanation,
              correctOptionId: question.correctOptionId,
              options: question.options.map((option) => ({ id: option.id, text: option.text })),
            })),
          },
        },
      });
    }
    return { blocks: out, problems };
  }
}
