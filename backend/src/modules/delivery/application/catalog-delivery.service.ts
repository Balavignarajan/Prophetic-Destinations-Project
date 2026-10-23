import { Injectable } from '@nestjs/common';
import {
  type LearningLevel,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import {
  type LessonNavigation,
  type PublishedCourseView,
  type PublishedLessonSummary,
  PublishingFacade,
} from '../../publishing/index.js';
import type {
  CourseListResponseDto,
  CourseResponseDto,
  NavigationLessonDto,
  ExploreResponseDto,
  NavigationResponseDto,
  RelatedResponseDto,
} from '../api/dto/catalog-delivery.dto.js';
import { ifNoneMatchMatches, representationEtag } from '../domain/etag.js';

export type CatalogRepresentation<T> =
  | { kind: 'NOT_MODIFIED'; etag: string }
  | { kind: 'OK'; etag: string; body: T };

/**
 * Learner-facing catalog reads. Everything comes from Publishing's facade, i.e. from the active catalog snapshot
 * filtered by what is published right now. Every "nothing to show" case is the same 404, so a caller cannot tell
 * a draft from a withdrawn, nonexistent or level-less course or lesson. The validator is computed over the body
 * that is about to be sent, so a 304 is only ever answered for exactly the representation the client holds.
 */
@Injectable()
export class CatalogDeliveryService {
  constructor(private readonly publishing: PublishingFacade) {}

  async listCourses(
    level: LearningLevel,
    ifNoneMatch?: string,
  ): Promise<CatalogRepresentation<CourseListResponseDto>> {
    const views = await this.publishing.listPublishedCourses(level);
    const body: CourseListResponseDto = {
      level,
      courses: views.map((view) => ({
        courseId: view.courseId,
        catalogVersion: view.catalogVersion,
        title: view.title,
        description: view.description,
        coverMediaId: view.coverMediaId,
        book: view.book ?? null,
        moduleCount: view.moduleCount,
        lessonCount: view.lessonCount,
        lessonIds: [...(view.directLessons ?? []), ...view.modules.flatMap((module) => module.lessons)].map((lesson) => lesson.lessonId),
      })),
    };
    return represent('course-list', [level], body, ifNoneMatch);
  }

  async getCourse(
    courseId: string,
    level: LearningLevel,
    ifNoneMatch?: string,
  ): Promise<CatalogRepresentation<CourseResponseDto>> {
    const view = await this.publishing.findPublishedCourse(courseId, level);
    if (!view) throw new NotFoundError('Course not found');
    return represent(
      'course',
      [view.courseId, level],
      toCourseBody(view),
      ifNoneMatch,
    );
  }

  async getRelated(
    lessonId: string,
    level: LearningLevel,
    ifNoneMatch?: string,
  ): Promise<CatalogRepresentation<RelatedResponseDto>> {
    const result = await this.publishing.findRelatedLessons(lessonId, level);
    if (!result) throw new NotFoundError('Lesson not found');
    // The tag is computed over this whole body (source publication identity AND the visible targets' published fields), so it changes whenever
    // the list a learner would see changes, including a target becoming or ceasing to be deliverable.
    return represent(
      'related',
      [lessonId, level],
      { lessonId, level, publicationVersion: result.publicationVersion, contentHash: result.contentHash, lessons: result.lessons },
      ifNoneMatch,
    );
  }

  async getExploring(
    lessonId: string,
    blockId: string,
    level: LearningLevel,
    ifNoneMatch?: string,
  ): Promise<CatalogRepresentation<ExploreResponseDto>> {
    const result = await this.publishing.findExploringLinks(lessonId, blockId, level);
    if (!result) throw new NotFoundError('Lesson not found');
    return represent(
      'explore',
      [lessonId, blockId, level],
      { lessonId, blockId, level, publicationVersion: result.publicationVersion, contentHash: result.contentHash, lessons: result.lessons },
      ifNoneMatch,
    );
  }

  async getNavigation(
    lessonId: string,
    level: LearningLevel,
    ifNoneMatch?: string,
  ): Promise<CatalogRepresentation<NavigationResponseDto>> {
    const navigation = await this.publishing.findLessonNavigation(
      lessonId,
      level,
    );
    if (!navigation) throw new NotFoundError('Lesson not found');
    return represent(
      'navigation',
      [navigation.lessonId, level],
      toNavigationBody(navigation),
      ifNoneMatch,
    );
  }
}

function represent<T>(
  kind: Parameters<typeof representationEtag>[0],
  identity: readonly string[],
  body: T,
  ifNoneMatch: string | undefined,
): CatalogRepresentation<T> {
  const etag = representationEtag(kind, identity, body);
  return ifNoneMatchMatches(ifNoneMatch, etag)
    ? { kind: 'NOT_MODIFIED', etag }
    : { kind: 'OK', etag, body };
}

function toCourseBody(view: PublishedCourseView): CourseResponseDto {
  return {
    courseId: view.courseId,
    level: view.level,
    catalogVersion: view.catalogVersion,
    title: view.title,
    description: view.description,
    coverMediaId: view.coverMediaId,
    book: view.book ?? null,
    moduleCount: view.moduleCount,
    lessonCount: view.lessonCount,
    modules: view.modules.map((module) => ({
      moduleId: module.moduleId,
      title: module.title,
      description: module.description,
      lessons: module.lessons.map((lesson) => ({
        lessonId: lesson.lessonId,
        title: lesson.title,
        shortTitle: lesson.shortTitle,
        subtitle: lesson.subtitle,
        estimatedMinutes: lesson.estimatedMinutes,
        coverMediaId: lesson.coverMediaId,
        previousLessonId: lesson.previousLessonId,
        nextLessonId: lesson.nextLessonId,
      })),
    })),
    directLessons: view.directLessons.map((lesson) => ({
      lessonId: lesson.lessonId, title: lesson.title, shortTitle: lesson.shortTitle, subtitle: lesson.subtitle,
      estimatedMinutes: lesson.estimatedMinutes, coverMediaId: lesson.coverMediaId, previousLessonId: lesson.previousLessonId, nextLessonId: lesson.nextLessonId,
    })),
  };
}

function toNavigationLesson(
  lesson: PublishedLessonSummary | null,
): NavigationLessonDto | null {
  return lesson
    ? {
        lessonId: lesson.lessonId,
        moduleId: lesson.moduleId,
        title: lesson.title,
        shortTitle: lesson.shortTitle,
        subtitle: lesson.subtitle,
        estimatedMinutes: lesson.estimatedMinutes,
      }
    : null;
}

function toNavigationBody(navigation: LessonNavigation): NavigationResponseDto {
  return {
    lessonId: navigation.lessonId,
    level: navigation.level,
    courseId: navigation.courseId,
    moduleId: navigation.moduleId,
    catalogVersion: navigation.catalogVersion,
    previous: toNavigationLesson(navigation.previous),
    next: toNavigationLesson(navigation.next),
  };
}
