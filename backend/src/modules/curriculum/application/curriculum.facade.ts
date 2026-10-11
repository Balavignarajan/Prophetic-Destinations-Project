import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  type ContentStatus,
  NotFoundError,
  statusAfterEdit,
} from '../../../shared-kernel/index.js';
import type { Course, CourseModule } from '../domain/models.js';
import { CourseModuleRepository } from '../persistence/course-module.repository.js';
import { CourseRepository } from '../persistence/course.repository.js';

/** The little other modules may know about a Module (never the entity itself). */
export interface ModuleRef {
  id: string;
  courseId: string;
}

/** A course as Publishing needs to see it: plain data, never the entity. */
export interface CourseWorkflowRef {
  id: string;
  title: string;
  description: string | null;
  status: ContentStatus;
  version: number;
}

/** A module as Publishing needs to see it. `position` is its place in the course (1..n). */
export interface ModuleWorkflowRef extends CourseWorkflowRef {
  courseId: string;
  position: number;
}

/**
 * What the rest of the application may ask curriculum. Lessons use it to check
 * that a Module exists and to lock it while lessons are inserted, removed or reordered.
 */
@Injectable()
export class CurriculumFacade {
  constructor(
    private readonly modules: CourseModuleRepository,
    private readonly courses: CourseRepository,
  ) {}

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

  /**
   * Records that the module's content was edited (its lessons were re-ordered): a published or approved module
   * returns to DRAFT and its version moves, exactly like any other edit. Call it inside the transaction that
   * holds the module lock.
   */
  async markModuleEdited(
    moduleId: string,
    manager: EntityManager,
  ): Promise<void> {
    const module = await this.modules.findByIdForUpdate(moduleId, manager);
    if (!module) throw new NotFoundError('Module not found');
    await this.modules.update(
      moduleId,
      { status: statusAfterEdit(module.status) },
      manager,
    );
  }

  // ---- workflow support for Publishing (lock order: Course, then Module, then Lesson) ----

  /** Locks the course row until the transaction ends. Throws NotFoundError if the course is gone. */
  async lockCourseForWorkflow(
    courseId: string,
    manager: EntityManager,
  ): Promise<CourseWorkflowRef> {
    const course = await this.courses.findByIdForUpdate(courseId, manager);
    if (!course) throw new NotFoundError('Course not found');
    return toCourseRef(course);
  }

  /** Locks the module row (take the course lock first). Throws NotFoundError if the module is gone. */
  async lockModuleForWorkflow(
    moduleId: string,
    manager: EntityManager,
  ): Promise<ModuleWorkflowRef> {
    const module = await this.modules.findByIdForUpdate(moduleId, manager);
    if (!module) throw new NotFoundError('Module not found');
    return toModuleRef(module);
  }

  async findCourseForWorkflow(
    courseId: string,
    manager?: EntityManager,
  ): Promise<CourseWorkflowRef | null> {
    const course = await this.courses.findById(courseId, manager);
    return course ? toCourseRef(course) : null;
  }

  async findModuleForWorkflow(
    moduleId: string,
    manager?: EntityManager,
  ): Promise<ModuleWorkflowRef | null> {
    const module = await this.modules.findById(moduleId, manager);
    return module ? toModuleRef(module) : null;
  }

  /** The course's modules in their configured order (position 1..n). */
  async listModules(
    courseId: string,
    manager?: EntityManager,
  ): Promise<ModuleWorkflowRef[]> {
    return (await this.modules.listByCourse(courseId, manager)).map(
      toModuleRef,
    );
  }

  /** Status compare-and-set: not an edit, so `version` does not move. False if the status was not `from`. */
  compareAndSetCourseStatus(
    courseId: string,
    from: ContentStatus,
    to: ContentStatus,
    manager: EntityManager,
  ): Promise<boolean> {
    return this.courses.compareAndSetStatus(courseId, from, to, manager);
  }

  compareAndSetModuleStatus(
    moduleId: string,
    from: ContentStatus,
    to: ContentStatus,
    manager: EntityManager,
  ): Promise<boolean> {
    return this.modules.compareAndSetStatus(moduleId, from, to, manager);
  }
}

function toCourseRef(course: Course): CourseWorkflowRef {
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    status: course.status,
    version: course.version,
  };
}

function toModuleRef(module: CourseModule): ModuleWorkflowRef {
  return {
    ...toCourseRef(module),
    courseId: module.courseId,
    position: module.position,
  };
}
