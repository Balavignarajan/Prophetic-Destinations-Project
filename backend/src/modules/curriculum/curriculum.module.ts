import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaModule } from '../media/media.module.js';
import { CoursesController } from './api/courses.controller.js';
import { ModulesController } from './api/modules.controller.js';
import { CourseService } from './application/course.service.js';
import { CurriculumFacade } from './application/curriculum.facade.js';
import { ModuleService } from './application/module.service.js';
import { CourseModuleEntity } from './persistence/course-module.entity.js';
import { CourseModuleRepository } from './persistence/course-module.repository.js';
import { CourseEntity } from './persistence/course.entity.js';
import { CourseRepository } from './persistence/course.repository.js';

/** Courses and their Modules. Lessons will attach to Modules in a later phase. */
@Module({
  imports: [TypeOrmModule.forFeature([CourseEntity, CourseModuleEntity]), MediaModule],
  controllers: [CoursesController, ModulesController],
  providers: [
    CourseRepository,
    CourseModuleRepository,
    CourseService,
    ModuleService,
    CurriculumFacade,
  ],
  exports: [CurriculumFacade],
})
export class CurriculumModule {}
