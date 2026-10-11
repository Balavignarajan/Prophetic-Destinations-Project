import { Injectable } from '@nestjs/common';
import {
  type LearningLevel,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import { CurriculumFacade } from '../../curriculum/index.js';
import type {
  CatalogLevelSnapshot,
  CatalogPublication,
} from '../domain/models.js';
import { CatalogPublicationRepository } from '../persistence/catalog-publication.repository.js';

/** Read-only admin view of a course's catalog history: every version and its stored snapshots, newest first. */
@Injectable()
export class CatalogHistoryService {
  constructor(
    private readonly curriculum: CurriculumFacade,
    private readonly catalog: CatalogPublicationRepository,
  ) {}

  async list(courseId: string, limit: number, offset: number) {
    await this.requireCourse(courseId);
    return this.catalog.list(courseId, limit, offset);
  }

  async get(courseId: string, version: number): Promise<CatalogPublication> {
    await this.requireCourse(courseId);
    const publication = await this.catalog.findByVersion(courseId, version);
    if (!publication) throw new NotFoundError('Publication not found');
    return publication;
  }

  async getSnapshot(
    courseId: string,
    version: number,
    level: LearningLevel,
  ): Promise<CatalogLevelSnapshot> {
    await this.requireCourse(courseId);
    const snapshot = await this.catalog.findLevelSnapshot(
      courseId,
      version,
      level,
    );
    if (!snapshot) throw new NotFoundError('Snapshot not found');
    return snapshot;
  }

  private async requireCourse(courseId: string): Promise<void> {
    if (!(await this.curriculum.findCourseForWorkflow(courseId))) {
      throw new NotFoundError('Course not found');
    }
  }
}
