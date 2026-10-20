import { Injectable } from '@nestjs/common';
import type { LearningLevel } from '../../../shared-kernel/index.js';
import type {
  LessonNavigation,
  PublishedCourseView,
} from '../domain/catalog-view.js';
import type { ActiveSnapshotInfo } from '../domain/models.js';
import { PublicationRepository } from '../persistence/publication.repository.js';
import { PublishedCatalogService, type RelatedLessonsResult } from './published-catalog.service.js';

/**
 * What other modules (the Delivery module) may ask Publishing: the published snapshot a learner
 * should get right now. Read-only, plain data, no entities, and it only ever reads the publication
 * tables: never the authoring tables, never a draft, never an ended publication.
 *
 * Lesson snapshots are available only while the lesson's module AND course are published as well
 * (checked in the same query, on every call). The catalog reads below return the ACTIVE catalog snapshot
 * of a course filtered by what is currently published, and the previous/next lesson derived from it.
 *
 * Two small steps so that a revalidation (`If-None-Match`) needs only the hash, not a snapshot of
 * up to 5 MiB:
 *  1. `findActiveSnapshotInfo`: which publication/version/hash is active for this lesson and level.
 *  2. `readActiveSnapshotContent`: the stored content of that exact publication and level, but only
 *     if it is still active when read (a snapshot never changes, so the only thing that can have
 *     changed between the steps is that the publication ended).
 */
@Injectable()
export class PublishingFacade {
  constructor(
    private readonly publications: PublicationRepository,
    private readonly catalog: PublishedCatalogService,
  ) {}

  findActiveSnapshotInfo(
    lessonId: string,
    level: LearningLevel,
  ): Promise<ActiveSnapshotInfo | null> {
    return this.publications.findActiveSnapshotInfo(lessonId, level);
  }

  readActiveSnapshotContent(
    publicationId: string,
    level: LearningLevel,
  ): Promise<Record<string, unknown> | null> {
    return this.publications.findActiveSnapshotContent(publicationId, level);
  }

  /** Published courses with at least one currently eligible lesson at `level`, in the manual course order. */
  listPublishedCourses(level: LearningLevel): Promise<PublishedCourseView[]> {
    return this.catalog.listCourses(level);
  }

  /** One published course at `level`, or null if it is not published or nothing in it is eligible there. */
  findPublishedCourse(
    courseId: string,
    level: LearningLevel,
  ): Promise<PublishedCourseView | null> {
    return this.catalog.findCourse(courseId, level);
  }

  /** Related lessons of a deliverable lesson that are themselves deliverable at `level`, with the identity of the source publication (null if the lesson is not deliverable). */
  findRelatedLessons(lessonId: string, level: LearningLevel): Promise<RelatedLessonsResult | null> {
    return this.catalog.findRelated(lessonId, level);
  }

  /** The deliverable targets of one Continue Exploring block of a deliverable lesson, with the identity of the source publication (null if not deliverable or the block is not in that snapshot). */
  findExploringLinks(lessonId: string, blockId: string, level: LearningLevel): Promise<(RelatedLessonsResult & { blockId: string }) | null> {
    return this.catalog.findExploring(lessonId, blockId, level);
  }

  /** Previous/next eligible lesson of a deliverable lesson, or null if it has no place in a published catalog. */
  findLessonNavigation(
    lessonId: string,
    level: LearningLevel,
  ): Promise<LessonNavigation | null> {
    return this.catalog.findNavigation(lessonId, level);
  }
}
