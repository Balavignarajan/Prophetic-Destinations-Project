import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  BusinessRuleError,
  type ContentStatus,
  ConflictError,
} from '../../../shared-kernel/index.js';
import {
  type CourseWorkflowRef,
  CurriculumFacade,
  type ModuleWorkflowRef,
} from '../../curriculum/index.js';
import type { AuthenticatedAdmin } from '../../identity/index.js';
import { LessonsFacade } from '../../lessons/index.js';
import {
  CATALOG_SNAPSHOT_SCHEMA_VERSION,
  type PublishedModuleEntry,
  buildCatalogLevels,
  evaluateCatalogReadiness,
  preserveOrder,
  serializeCatalogLevel,
} from '../domain/catalog-snapshot.js';
import type { CatalogCause, CatalogPublication } from '../domain/models.js';
import { CatalogEventRepository } from '../persistence/catalog-event.repository.js';
import { CatalogPublicationRepository } from '../persistence/catalog-publication.repository.js';
import { PublicationRepository } from '../persistence/publication.repository.js';

export interface CatalogEffect {
  /** The catalog version this action created. */
  publication: CatalogPublication;
  /** The version it replaced, if there was an active one. */
  superseded: CatalogPublication | null;
}

export interface CoursePublishEffect extends CatalogEffect {
  /** APPROVED modules that this course publication publishes (the caller moves their status and records events). */
  modulesToPublish: ModuleWorkflowRef[];
  /** Modules left out because they are neither approved nor already published. */
  modulesNotIncluded: {
    moduleId: string;
    status: ContentStatus;
    reason: 'NOT_APPROVED' | 'WITHDRAWN';
  }[];
}

interface VersionInput {
  course: CourseWorkflowRef;
  /** What the catalog shows for the course: the approved (or carried-over) title/description. */
  courseTitle: string;
  courseDescription: string | null;
  /** The cover published with this version: the approved cover on a course publish, otherwise carried over. */
  courseCoverMediaId: string | null;
  /** The modules of the new version, in the order learners see them (ordinals are assigned here). */
  modules: Omit<PublishedModuleEntry, 'position'>[];
  cause: CatalogCause;
  /** Publishing a version must be ready; withdrawing (unpublishing a module) never is blocked. */
  requireReady: boolean;
  /** The version this one replaces (the active one, or for a republish the latest ended one), if any. */
  base: CatalogPublication | null;
  /**
   * Whether the CURRENT authoring order of the modules is approved for this version (a course publish: the
   * course being published is APPROVED, and re-ordering modules returns it to DRAFT). Otherwise the published
   * order of `base` is kept and only new modules are inserted.
   */
  liveModuleOrder: boolean;
  /** Modules whose current lesson order is approved (they are APPROVED/PUBLISHED and being published here). */
  liveLessonOrder: ReadonlySet<string>;
  /** Direct lesson order is approved only by a course publish. */
  liveDirectLessonOrder: boolean;
}

/**
 * Creates and ends catalog versions of a course. These methods do NOT open a transaction: they run inside the
 * catalog workflow's transaction (CatalogWorkflowService), after it has locked the course (and the modules it
 * changes), so a version, the status changes and the audit events commit or roll back together.
 *
 * What a version contains is decided here and only from published or approved data:
 *  - the course and module metadata comes from an APPROVED working copy, or is carried over unchanged from the
 *    version that already published it (so unapproved edits never leak);
 *  - the lesson layer is rebuilt from the lessons' ACTIVE lesson publications (published data only), in the
 *    existing module and lesson `position` order.
 */
function isApproved(module: ModuleWorkflowRef): boolean {
  return module.status === 'APPROVED' || module.status === 'PUBLISHED';
}

@Injectable()
export class CatalogPublicationService {
  constructor(
    private readonly curriculum: CurriculumFacade,
    private readonly lessons: LessonsFacade,
    private readonly lessonPublications: PublicationRepository,
    private readonly catalog: CatalogPublicationRepository,
    private readonly events: CatalogEventRepository,
  ) {}

  findActive(courseId: string, manager?: EntityManager) {
    return this.catalog.findActive(courseId, manager);
  }

  /**
   * Publishes the course with its modules. `course` is locked and APPROVED. Every module is locked here (in
   * position order, after the course), so its status and metadata cannot change underneath the snapshot.
   */
  async publishCourse(
    course: CourseWorkflowRef,
    actor: AuthenticatedAdmin,
    manager: EntityManager,
  ): Promise<CoursePublishEffect> {
    const live = await this.curriculum.listModules(course.id, manager);
    const modules: ModuleWorkflowRef[] = [];
    for (const module of live) {
      modules.push(
        await this.curriculum.lockModuleForWorkflow(module.id, manager),
      );
    }

    const latest = await this.catalog.findLatest(course.id, manager);
    const earlier = new Map(
      (latest?.modules ?? []).map((module) => [module.moduleId, module]),
    );

    // A course publish includes: the modules the previous version listed (from their approved working copy, or
    // unchanged if they were edited since), and modules that were never withdrawn and are approved. A module
    // whose last event is UNPUBLISH was withdrawn on purpose and stays out until it is approved again.
    const included: VersionInput['modules'] = [];
    const modulesToPublish: ModuleWorkflowRef[] = [];
    const modulesNotIncluded: CoursePublishEffect['modulesNotIncluded'] = [];
    for (const module of modules) {
      const approved =
        module.status === 'APPROVED' || module.status === 'PUBLISHED';
      const listedBefore = earlier.has(module.id);
      const withdrawn =
        !listedBefore &&
        (await this.events.latest(course.id, module.id, manager))?.action ===
          'UNPUBLISH';
      if (approved && (listedBefore || !withdrawn)) {
        included.push({
          moduleId: module.id,
          title: module.title,
          description: module.description,
        });
        if (module.status === 'APPROVED') modulesToPublish.push(module);
      } else if (listedBefore) {
        // Edited since it was published and not yet approved again: its published entry stays as it was.
        const entry = earlier.get(module.id)!;
        included.push({
          moduleId: entry.moduleId,
          title: entry.title,
          description: entry.description,
        });
      } else {
        modulesNotIncluded.push({
          moduleId: module.id,
          status: module.status,
          reason: withdrawn ? 'WITHDRAWN' : 'NOT_APPROVED',
        });
      }
    }

    const effect = await this.createVersion(
      {
        course,
        courseTitle: course.title,
        courseDescription: course.description,
        courseCoverMediaId: course.coverMediaId,
        modules: included,
        cause: 'COURSE_PUBLISH',
        requireReady: true,
        base: latest,
        liveModuleOrder: true,
        liveLessonOrder: new Set(
          included
            .map((m) => m.moduleId)
            .filter((id) => modules.some((x) => x.id === id && isApproved(x))),
        ),
        liveDirectLessonOrder: true,
      },
      actor,
      manager,
    );
    return { ...effect, modulesToPublish, modulesNotIncluded };
  }

  /**
   * Adds (or refreshes) one APPROVED module in the course's active catalog. `course` and `module` are locked.
   * Every other module and the course's own metadata are carried over from the active version unchanged.
   */
  async publishModule(
    course: CourseWorkflowRef,
    module: ModuleWorkflowRef,
    actor: AuthenticatedAdmin,
    manager: EntityManager,
  ): Promise<CatalogEffect> {
    const active = await this.requireActive(course.id, manager);
    return this.versionWithModule(
      course,
      active,
      module,
      'MODULE_PUBLISH',
      true,
      actor,
      manager,
    );
  }

  /** Removes one module from the course's active catalog (a new version without it). Never blocked by readiness. */
  async unpublishModule(
    course: CourseWorkflowRef,
    module: ModuleWorkflowRef,
    actor: AuthenticatedAdmin,
    manager: EntityManager,
  ): Promise<CatalogEffect> {
    const active = await this.requireActive(course.id, manager);
    return this.versionWithModule(
      course,
      active,
      null,
      'MODULE_UNPUBLISH',
      false,
      actor,
      manager,
      module.id,
    );
  }

  /** Ends the course's active catalog publication (exactly once); its snapshots are untouched. */
  async unpublishCourse(
    courseId: string,
    actor: AuthenticatedAdmin,
    manager: EntityManager,
  ): Promise<CatalogPublication> {
    const ended = await this.catalog.endActive(
      courseId,
      'UNPUBLISHED',
      actor.id,
      manager,
    );
    if (!ended) {
      throw new ConflictError('The course has no active catalog publication');
    }
    return ended;
  }

  private async requireActive(courseId: string, manager: EntityManager) {
    const active = await this.catalog.findActive(courseId, manager);
    if (!active) {
      throw new ConflictError(
        'The course is not published. Publish the course first (it publishes its approved modules).',
        { reason: 'COURSE_NOT_PUBLISHED' },
      );
    }
    return active;
  }

  /**
   * A new version built from the active one: the modules are those of the active version in their current
   * order, with `add` taking the place of its earlier entry (or joining) and `dropModuleId` removed.
   */
  private async versionWithModule(
    course: CourseWorkflowRef,
    active: CatalogPublication,
    add: ModuleWorkflowRef | null,
    cause: CatalogCause,
    requireReady: boolean,
    actor: AuthenticatedAdmin,
    manager: EntityManager,
    dropModuleId?: string,
  ): Promise<CatalogEffect> {
    const carried = new Map(active.modules.map((m) => [m.moduleId, m]));
    const live = await this.curriculum.listModules(course.id, manager);
    const entries = new Map<string, VersionInput['modules'][number]>();
    for (const module of live) {
      if (module.id === dropModuleId) continue;
      if (add && module.id === add.id) {
        entries.set(module.id, {
          moduleId: add.id,
          title: add.title,
          description: add.description,
        });
      } else if (carried.has(module.id)) {
        const entry = carried.get(module.id)!;
        entries.set(module.id, {
          moduleId: entry.moduleId,
          title: entry.title,
          description: entry.description,
        });
      }
    }
    // Other modules keep the order they were published in; only the module added here is placed by its position.
    const modules = preserveOrder(
      live.filter((m) => entries.has(m.id)).map((m) => m.id),
      active.modules.map((m) => m.moduleId),
    ).map((id) => entries.get(id)!);
    return this.createVersion(
      {
        course,
        // the course itself is not being published here: its metadata is the published one, not the working copy
        courseTitle: active.courseTitle,
        courseDescription: active.courseDescription,
        courseCoverMediaId: active.courseCoverMediaId,
        modules,
        cause,
        requireReady,
        base: active,
        liveModuleOrder: false,
        liveLessonOrder: new Set(add ? [add.id] : []),
        liveDirectLessonOrder: false,
      },
      actor,
      manager,
    );
  }

  private async createVersion(
    input: VersionInput,
    actor: AuthenticatedAdmin,
    manager: EntityManager,
  ): Promise<CatalogEffect> {
    const moduleIds = input.modules.map((m) => m.moduleId);
    const placements = await this.lessons.listLessonPlacements(
      moduleIds,
      manager,
    );
    const directPlacements = await this.lessons.listDirectLessonPlacements(input.course.id, manager);
    const summaries = await this.lessonPublications.findActiveSummaries(
      [...placements.map((p) => p.lessonId), ...directPlacements.map((p) => p.lessonId)],
      manager,
    );

    // Order: an approved order is applied; otherwise the order already published is kept (new entries are
    // inserted by their authoring position), so an authoring-only reorder never goes public by side effect.
    const authored = input.modules.map((m) => m.moduleId);
    const orderedIds = input.liveModuleOrder
      ? authored
      : preserveOrder(
          authored,
          (input.base?.modules ?? []).map((m) => m.moduleId),
        );
    const byId = new Map(input.modules.map((m) => [m.moduleId, m]));
    const entries: PublishedModuleEntry[] = orderedIds.map((id, index) => ({
      ...byId.get(id)!,
      position: index + 1,
    }));
    const previous = input.base
      ? await this.catalog.findLevelContents(input.base.id, manager)
      : undefined;
    const levels = buildCatalogLevels({
      course: {
        id: input.course.id,
        title: input.courseTitle,
        description: input.courseDescription,
        ...(input.courseCoverMediaId ? { coverMediaId: input.courseCoverMediaId } : {}),
      },
      modules: entries,
      placements,
      directPlacements,
      summaries,
      previous,
      liveLessonOrder: input.liveLessonOrder,
      liveDirectLessonOrder: input.liveDirectLessonOrder,
    });
    const serialized = [...levels.values()].map(serializeCatalogLevel);

    if (input.requireReady) {
      const report = evaluateCatalogReadiness(serialized);
      if (!report.ready) {
        throw new BusinessRuleError(
          'The catalog is not ready to be published',
          {
            report,
          },
        );
      }
    }

    const superseded = await this.catalog.endActive(
      input.course.id,
      'SUPERSEDED',
      actor.id,
      manager,
    );
    const version = await this.catalog.nextVersion(input.course.id, manager);
    const id = await this.catalog.insert(
      {
        courseId: input.course.id,
        version,
        cause: input.cause,
        snapshotSchemaVersion: CATALOG_SNAPSHOT_SCHEMA_VERSION,
        courseTitle: input.courseTitle,
        courseDescription: input.courseDescription,
        courseCoverMediaId: input.courseCoverMediaId,
        sourceCourseVersion: input.course.version,
        publishedBy: actor.id,
      },
      manager,
    );
    await this.catalog.insertModules(id, input.course.id, entries, manager);
    await this.catalog.insertLevels(id, input.course.id, serialized, manager);

    return { publication: await this.catalog.get(id, manager), superseded };
  }
}
