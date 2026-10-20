import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurriculumModule } from '../curriculum/index.js';
import { MediaModule } from '../media/index.js';
import { QuizzesModule } from '../quizzes/index.js';
import { ScriptureModule } from '../scripture/index.js';
import { BlockLevelsController } from './api/block-levels.controller.js';
import { BlocksController } from './api/blocks.controller.js';
import { LessonsController } from './api/lessons.controller.js';
import { ModuleLessonsController } from './api/module-lessons.controller.js';
import { CourseLessonsController } from './api/course-lessons.controller.js';
import { PreviewController } from './api/preview.controller.js';
import { BlockLevelService } from './application/block-level.service.js';
import { BlockService } from './application/block.service.js';
import { LessonService } from './application/lesson.service.js';
import { LessonsFacade } from './application/lessons.facade.js';
import { PreviewService } from './application/preview.service.js';
import { QuizEmbedService } from './application/quiz-embed.service.js';
import { ScriptureEmbedService } from './application/scripture-embed.service.js';
import { BlockTypeRegistry } from './domain/blocks/registry.js';
import { LessonBlockLevelEntity } from './persistence/lesson-block-level.entity.js';
import { LessonRelatedRepository } from './persistence/lesson-related.repository.js';
import { LessonBlockLevelRepository } from './persistence/lesson-block-level.repository.js';
import { LessonBlockEntity } from './persistence/lesson-block.entity.js';
import { LessonBlockRepository } from './persistence/lesson-block.repository.js';
import { LessonLevelEntity } from './persistence/lesson-level.entity.js';
import { LessonEntity } from './persistence/lesson.entity.js';
import { LessonRepository } from './persistence/lesson.repository.js';

/** Lessons and the levels they are available at. Blocks (RICH_TEXT and IMAGE for now), their per-level visibility and variants, and the level-aware preview. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      LessonEntity,
      LessonLevelEntity,
      LessonBlockEntity,
      LessonBlockLevelEntity,
    ]),
    CurriculumModule,
    MediaModule,
    QuizzesModule,
    ScriptureModule,
  ],
  controllers: [
    ModuleLessonsController, CourseLessonsController,
    LessonsController,
    BlocksController,
    BlockLevelsController,
    PreviewController,
  ],
  providers: [
    LessonRepository,
    LessonBlockRepository,
    LessonBlockLevelRepository,
    LessonRelatedRepository,
    BlockTypeRegistry,
    LessonService,
    BlockService,
    BlockLevelService,
    PreviewService,
    QuizEmbedService,
    ScriptureEmbedService,
    LessonsFacade,
  ],
  exports: [LessonsFacade],
})
export class LessonsModule {}
