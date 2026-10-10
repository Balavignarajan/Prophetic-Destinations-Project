import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { NotFoundError } from '../../../shared-kernel/index.js';
import { CourseModuleRepository } from '../persistence/course-module.repository.js';

/** The little other modules may know about a Module (never the entity itself). */
export interface ModuleRef {
  id: string;
  courseId: string;
}

/**
 * What the rest of the application may ask curriculum. Lessons use it to check
 * that a Module exists and to lock it while lessons are inserted, removed or reordered.
 */
@Injectable()
export class CurriculumFacade {
  constructor(private readonly modules: CourseModuleRepository) {}

  async findModule(
    moduleId: string,
    manager?: EntityManager,
  ): Promise<ModuleRef | null> {
    const module = await this.modules.findById(moduleId, manager);
    return module ? { id: module.id, courseId: module.courseId } : null;
  }

  /**
   * Locks the module row until the surrounding transaction ends, so changes to
   * its lessons run one at a time. Throws NotFoundError if the module is gone.
   */
  async lockModule(
    moduleId: string,
    manager: EntityManager,
  ): Promise<ModuleRef> {
    const module = await this.modules.findByIdForUpdate(moduleId, manager);
    if (!module) throw new NotFoundError('Module not found');
    return { id: module.id, courseId: module.courseId };
  }
}
