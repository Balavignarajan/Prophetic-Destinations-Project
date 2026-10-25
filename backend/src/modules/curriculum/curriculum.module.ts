import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaModule } from '../media/media.module.js';
import { CoursesController } from './api/courses.controller.js';
import { HomeEntriesController } from './api/home-entries.controller.js';
import { ModulesController } from './api/modules.controller.js';
import { CourseService } from './application/course.service.js';
import { CurriculumFacade } from './application/curriculum.facade.js';
import { HomeEntryService } from './application/home-entry.service.js';
import { ModuleService } from './application/module.service.js';
import { CourseModuleEntity } from './persistence/course-module.entity.js';
import { CourseModuleRepository } from './persistence/course-module.repository.js';
import { CourseEntity } from './persistence/course.entity.js';
import { CourseRepository } from './persistence/course.repository.js';
import { HomeEntryEntity } from './persistence/home-entry.entity.js';
import { HomeEntryRepository } from './persistence/home-entry.repository.js';

/** Courses and their Modules, and the Home Entries (learner Home cards) that open courses. Lessons attach to Modules in the lessons module. */
@Module({
  imports: [TypeOrmModule.forFeature([CourseEntity, CourseModuleEntity, HomeEntryEntity]), MediaModule],
  controllers: [CoursesController, ModulesController, HomeEntriesController],
  providers: [
    CourseRepository,
    CourseModuleRepository,
    HomeEntryRepository,
    CourseService,
    ModuleService,
    HomeEntryService,
    CurriculumFacade,
  ],
  exports: [CurriculumFacade],
})
export class CurriculumModule {}
