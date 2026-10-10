import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurriculumModule } from '../curriculum/index.js';
import { BlocksController } from './api/blocks.controller.js';
import { LessonsController } from './api/lessons.controller.js';
import { ModuleLessonsController } from './api/module-lessons.controller.js';
import { BlockService } from './application/block.service.js';
import { LessonService } from './application/lesson.service.js';
import { BlockTypeRegistry } from './domain/blocks/registry.js';
import { LessonBlockEntity } from './persistence/lesson-block.entity.js';
import { LessonBlockRepository } from './persistence/lesson-block.repository.js';
import { LessonLevelEntity } from './persistence/lesson-level.entity.js';
import { LessonEntity } from './persistence/lesson.entity.js';
import { LessonRepository } from './persistence/lesson.repository.js';

/** Lessons and the levels they are available at. Blocks (RICH_TEXT only for now); levels/variants come later. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      LessonEntity,
      LessonLevelEntity,
      LessonBlockEntity,
    ]),
    CurriculumModule,
  ],
  controllers: [ModuleLessonsController, LessonsController, BlocksController],
  providers: [
    LessonRepository,
    LessonBlockRepository,
    BlockTypeRegistry,
    LessonService,
    BlockService,
  ],
})
export class LessonsModule {}
