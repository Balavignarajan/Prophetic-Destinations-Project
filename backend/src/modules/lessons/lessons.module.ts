import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurriculumModule } from '../curriculum/index.js';
import { BlockLevelsController } from './api/block-levels.controller.js';
import { BlocksController } from './api/blocks.controller.js';
import { LessonsController } from './api/lessons.controller.js';
import { ModuleLessonsController } from './api/module-lessons.controller.js';
import { PreviewController } from './api/preview.controller.js';
import { BlockLevelService } from './application/block-level.service.js';
import { BlockService } from './application/block.service.js';
import { LessonService } from './application/lesson.service.js';
import { LessonsFacade } from './application/lessons.facade.js';
import { PreviewService } from './application/preview.service.js';
import { BlockTypeRegistry } from './domain/blocks/registry.js';
import { LessonBlockLevelEntity } from './persistence/lesson-block-level.entity.js';
import { LessonBlockLevelRepository } from './persistence/lesson-block-level.repository.js';
import { LessonBlockEntity } from './persistence/lesson-block.entity.js';
import { LessonBlockRepository } from './persistence/lesson-block.repository.js';
import { LessonLevelEntity } from './persistence/lesson-level.entity.js';
import { LessonEntity } from './persistence/lesson.entity.js';
import { LessonRepository } from './persistence/lesson.repository.js';

/** Lessons and the levels they are available at. Blocks (RICH_TEXT only for now), their per-level visibility and variants, and the level-aware preview. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      LessonEntity,
      LessonLevelEntity,
      LessonBlockEntity,
      LessonBlockLevelEntity,
    ]),
    CurriculumModule,
  ],
  controllers: [
    ModuleLessonsController,
    LessonsController,
    BlocksController,
    BlockLevelsController,
    PreviewController,
  ],
  providers: [
    LessonRepository,
    LessonBlockRepository,
    LessonBlockLevelRepository,
    BlockTypeRegistry,
    LessonService,
    BlockService,
    BlockLevelService,
    PreviewService,
    LessonsFacade,
  ],
  exports: [LessonsFacade],
})
export class LessonsModule {}
