import { Injectable } from '@nestjs/common';
import type { LearningLevel } from '../../../shared-kernel/index.js';
import {
  type LessonNavigation,
  type PublishedCourseView,
  listedLessonIds,
  navigationFor,
  toCourseView,
} from '../domain/catalog-view.js';
import { PublicationRepository } from '../persistence/publication.repository.js';
import { PublishedCatalogRepository } from '../persistence/published-catalog.repository.js';

/**
 * What a learner may see of the catalog, from authoritative database state on every call: the ACTIVE catalog
 * snapshot of a course, filtered to the lessons that currently have an active lesson publication at the
 * requested level. Nothing is cached, nothing is read from a working copy, and no level falls back to another.
 * (The pure rules are in `domain/catalog-view.ts`.)
 */
@Injectable()
export class PublishedCatalogService {
  constructor(
    private readonly catalog: PublishedCatalogRepository,
    private readonly lessonPublications: PublicationRepository,
  ) {}

  /** Published courses with something to show at `level`, in the order they were first published. */
  async listCourses(level: LearningLevel): Promise<PublishedCourseView[]> {
    const active = await this.catalog.listActive(level);
    const eligible = await this.lessonPublications.findEligibleLessonIds(
      level,
      [...new Set(active.flatMap((a) => listedLessonIds(a.content)))],
    );
    return active.flatMap((a) => {
      const view = toCourseView(a.content, a.catalogVersion, eligible);
      return view ? [view] : [];
    });
  }

  async findCourse(
    courseId: string,
    level: LearningLevel,
  ): Promise<PublishedCourseView | null> {
    const active = await this.catalog.findActive(courseId, level);
    if (!active) return null;
    const eligible = await this.lessonPublications.findEligibleLessonIds(
      level,
      listedLessonIds(active.content),
    );
    return toCourseView(active.content, active.catalogVersion, eligible);
  }

  /**
   * Previous and next eligible lesson of a lesson that is itself deliverable at `level` (active lesson
   * publication, module and course published) and listed in its course's active catalog. Null otherwise.
   */
  async findNavigation(
    lessonId: string,
    level: LearningLevel,
  ): Promise<LessonNavigation | null> {
    const found = await this.catalog.findForLesson(lessonId, level);
    if (!found) return null;
    const eligible = await this.lessonPublications.findEligibleLessonIds(
      level,
      listedLessonIds(found.content),
    );
    return navigationFor(
      found.content,
      found.catalogVersion,
      lessonId.toLowerCase(),
      eligible,
    );
  }
}
