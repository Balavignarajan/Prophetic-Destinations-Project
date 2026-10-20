import { Injectable } from '@nestjs/common';
import {
  type LearningLevel,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import { BlockTypeRegistry } from '../domain/blocks/registry.js';
import { type Resolution, resolveLesson } from '../domain/level-resolution.js';
import type { Lesson } from '../domain/models.js';
import {
  LessonBlockLevelRepository,
  groupByBlock,
} from '../persistence/lesson-block-level.repository.js';
import { LessonBlockRepository } from '../persistence/lesson-block.repository.js';
import { LessonRepository } from '../persistence/lesson.repository.js';
import { QuizEmbedService } from './quiz-embed.service.js';
import { ScriptureEmbedService } from './scripture-embed.service.js';
import { toResolvable } from './resolvable.js';

export interface Preview {
  lesson: Lesson;
  resolution: Resolution;
}

/**
 * Shows a lesson as a learner at one level would see it, using the same pure
 * resolver intended for publishing and learner delivery.
 *
 * Preview is advisory. It reads the lesson, its blocks and their level rows in
 * separate queries without locks, so under concurrent edits it can show a mix of
 * old and new data. It also does not check completeness. Publishing must validate
 * a consistent state of the content itself; a clean preview does not mean the
 * lesson is ready to publish. Previewing changes nothing (no status, no version).
 */
@Injectable()
export class PreviewService {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly blocks: LessonBlockRepository,
    private readonly levels: LessonBlockLevelRepository,
    private readonly registry: BlockTypeRegistry,
    private readonly quizEmbed: QuizEmbedService,
    private readonly scriptureEmbed: ScriptureEmbedService,
  ) {}

  async preview(lessonId: string, level: LearningLevel): Promise<Preview> {
    const lesson = await this.lessons.findById(lessonId);
    if (!lesson) throw new NotFoundError('Lesson not found');

    const blocks = await this.blocks.listByLesson(lessonId);
    const rows = groupByBlock(await this.levels.listByLesson(lessonId));

    const resolvable = toResolvable(lesson, blocks, rows, this.registry);

    const resolution = resolveLesson(resolvable, level);
    // Quiz blocks show the quiz as it is now (a quiz that cannot be shown keeps its plain reference).
    const embedded = await this.quizEmbed.embed(resolution.blocks, undefined, level);
    // Scripture passages show the passage as it would be published now (a passage that cannot be verified keeps its stored reference).
    const scripture = await this.scriptureEmbed.embed(embedded.blocks);
    return { lesson, resolution: { ...resolution, blocks: scripture.blocks } };
  }
}
