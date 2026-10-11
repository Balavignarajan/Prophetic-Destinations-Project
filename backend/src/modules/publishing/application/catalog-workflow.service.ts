import { Inject, Injectable, Optional } from '@nestjs/common';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import {
  ConflictError,
  type ContentStatus,
  ForbiddenError,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import {
  type CourseWorkflowRef,
  CurriculumFacade,
  type ModuleWorkflowRef,
} from '../../curriculum/index.js';
import type { AuthenticatedAdmin, Role } from '../../identity/index.js';
import type {
  CatalogPublication,
  CatalogWorkflowEvent,
} from '../domain/models.js';
import { planCatalogTransition } from '../domain/catalog-transition.js';
import { normalizeNote } from '../domain/notes.js';
import { canPerform } from '../domain/roles.js';
import {
  SEPARATION_OF_DUTIES_POLICY,
  type SeparationOfDutiesPolicy,
  checkSeparationOfDuties,
} from '../domain/separation-of-duties.js';
import {
  WORKFLOW_ACTIONS,
  type WorkflowAction,
  requiresNote,
} from '../domain/workflow.js';
import { CatalogEventRepository } from '../persistence/catalog-event.repository.js';
import { CatalogPublicationRepository } from '../persistence/catalog-publication.repository.js';
import { CatalogPublicationService } from './catalog-publication.service.js';
import {
  DEFAULT_WORKFLOW_LOCK_TIMEOUT_MS,
  WORKFLOW_LOCK_TIMEOUT_MS,
} from './workflow.service.js';

export interface CatalogTransitionInput {
  note?: string | null;
  /** The course's / module's `version` the actor was looking at; if it moved, the transition is refused (409). */
  expectedVersion?: number;
}

/** The thing a transition applies to: a course, or one module of it. */
export interface CatalogSubject {
  courseId: string;
  moduleId?: string;
}

export interface CatalogTransitionResult {
  courseId: string;
  moduleId: string | null;
  fromStatus: ContentStatus;
  status: ContentStatus;
  version: number;
  event: CatalogWorkflowEvent;
  /** Publish and the module actions: the catalog version created. Course unpublish: the version that was ended. */
  publication: CatalogPublication | null;
  /** The version a new one replaced. */
  supersededPublication: CatalogPublication | null;
  /** Course publish: the modules whose approved state was published with it. */
  modulesPublished: string[];
  /** Course publish: modules left out because they are neither approved nor already published. */
  modulesNotIncluded: {
    moduleId: string;
    status: ContentStatus;
    reason: 'NOT_APPROVED' | 'WITHDRAWN';
  }[];
}

export interface CatalogWorkflowState {
  courseId: string;
  moduleId: string | null;
  status: ContentStatus;
  version: number;
  /** The actions this caller may perform right now (by role and by the current state). */
  allowedActions: WorkflowAction[];
  /** Course: it has an active catalog version. Module: it is listed in the course's active catalog version. */
  published: boolean;
  /** The course's active catalog version, if any (a module's state is read against it). */
  activePublication: CatalogPublication | null;
  latestEvent: CatalogWorkflowEvent | null;
}

const VERBS: Record<WorkflowAction, string> = {
  SUBMIT_FOR_REVIEW: 'submit for review',
  REQUEST_CHANGES: 'request changes on',
  APPROVE: 'approve',
  PUBLISH: 'publish',
  UNPUBLISH: 'unpublish',
};

/** How many recent events a separation-of-duties policy gets to look at. */
const PRIOR_EVENTS_WINDOW = 50;

/**
 * Review and publishing workflow of courses and modules. Same rules as for lessons (the pure rules in
 * `domain/workflow.ts`, `roles.ts`, `notes.ts` and the separation-of-duties policy are shared), its own
 * orchestration because the subject, the lock order and the publication unit differ: every transition is
 * ONE transaction that
 *   1. locks the course (then, for a module action, the module; lock order Course, Module, Lesson),
 *   2. checks the expected version and plans the transition from the locked status,
 *   3. does the catalog work (a new catalog version, or ending the active one),
 *   4. changes the status with a compare-and-set, and
 *   5. appends the audit event(s),
 * so a catalog version, the statuses and the events commit or roll back together and two concurrent
 * transitions can never both succeed. Transitions are not edits: `version` does not move.
 */
@Injectable()
export class CatalogWorkflowService {
  constructor(
    private readonly curriculum: CurriculumFacade,
    private readonly catalog: CatalogPublicationRepository,
    private readonly catalogPublications: CatalogPublicationService,
    private readonly events: CatalogEventRepository,
    private readonly transactions: TransactionRunner,
    @Inject(SEPARATION_OF_DUTIES_POLICY)
    private readonly separationOfDuties: SeparationOfDutiesPolicy,
    @Optional()
    @Inject(WORKFLOW_LOCK_TIMEOUT_MS)
    private readonly lockTimeoutMs: number = DEFAULT_WORKFLOW_LOCK_TIMEOUT_MS,
  ) {}

  async perform(
    subject: CatalogSubject,
    action: WorkflowAction,
    actor: AuthenticatedAdmin,
    input: CatalogTransitionInput = {},
  ): Promise<CatalogTransitionResult> {
    // Cheap checks first, before any lock is taken.
    if (!canPerform(action, actor.role)) {
      throw new ForbiddenError('You do not have permission to do this');
    }
    const note = normalizeNote(input.note, requiresNote(action));
    const noun = subject.moduleId ? 'module' : 'course';

    return this.transactions.run(
      async (manager) => {
        const course = await this.curriculum.lockCourseForWorkflow(
          subject.courseId,
          manager,
        );
        const module = subject.moduleId
          ? await this.lockModule(subject.courseId, subject.moduleId, manager)
          : null;
        const target: CourseWorkflowRef = module ?? course;

        if (
          input.expectedVersion !== undefined &&
          input.expectedVersion !== target.version
        ) {
          throw new ConflictError(
            `The ${noun} was changed since you last looked at it. Reload it and try again.`,
            { currentVersion: target.version },
          );
        }

        const active = await this.catalog.findActive(course.id, manager);
        const published = module
          ? (active?.modules.some((m) => m.moduleId === module.id) ?? false)
          : active !== null;

        const plan = planCatalogTransition(action, target.status, published);
        if (!plan.allowed) {
          throw new ConflictError(
            plan.reason === 'NOT_PUBLISHED'
              ? `The ${noun} is not published, so there is nothing to unpublish`
              : `Cannot ${VERBS[action]} a ${noun} that is ${target.status}`,
            { action, status: target.status, allowedFrom: plan.allowedFrom },
          );
        }
        if (module && action === 'PUBLISH' && !active) {
          throw new ConflictError(
            'The course is not published. Publish the course first (it publishes its approved modules).',
            { reason: 'COURSE_NOT_PUBLISHED' },
          );
        }

        checkSeparationOfDuties(this.separationOfDuties, {
          action,
          actorId: actor.id,
          priorEvents: (
            await this.events.list(
              course.id,
              module?.id ?? null,
              PRIOR_EVENTS_WINDOW,
              0,
              manager,
            )
          ).items.map((event) => ({
            action: event.action,
            actorId: event.actorAdminId,
          })),
        });

        // Catalog work first: readiness failures abort before anything is written.
        let publication: CatalogPublication | null = null;
        let superseded: CatalogPublication | null = null;
        let modulesToPublish: ModuleWorkflowRef[] = [];
        let modulesNotIncluded: CatalogTransitionResult['modulesNotIncluded'] =
          [];
        if (action === 'PUBLISH' && !module) {
          const effect = await this.catalogPublications.publishCourse(
            course,
            actor,
            manager,
          );
          publication = effect.publication;
          superseded = effect.superseded;
          modulesToPublish = effect.modulesToPublish;
          modulesNotIncluded = effect.modulesNotIncluded;
        } else if (action === 'PUBLISH' && module) {
          const effect = await this.catalogPublications.publishModule(
            course,
            module,
            actor,
            manager,
          );
          publication = effect.publication;
          superseded = effect.superseded;
        } else if (action === 'UNPUBLISH' && module) {
          const effect = await this.catalogPublications.unpublishModule(
            course,
            module,
            actor,
            manager,
          );
          publication = effect.publication;
          superseded = effect.superseded;
        } else if (action === 'UNPUBLISH') {
          publication = await this.catalogPublications.unpublishCourse(
            course.id,
            actor,
            manager,
          );
        }

        // Publishing a course publishes its approved modules with it, each with its own event.
        for (const approved of modulesToPublish) {
          await this.changeStatus(
            approved.id,
            true,
            'APPROVED',
            'PUBLISHED',
            manager,
          );
          await this.events.append(
            {
              courseId: course.id,
              moduleId: approved.id,
              action: 'PUBLISH',
              fromStatus: 'APPROVED',
              toStatus: 'PUBLISHED',
              actorAdminId: actor.id,
              actorRole: actor.role,
              note: null,
              subjectVersion: approved.version,
              publicationId: publication!.id,
            },
            manager,
          );
        }

        // A status-preserving unpublish writes nothing to the course/module row at all.
        if (plan.from !== plan.to) {
          await this.changeStatus(
            target.id,
            !!module,
            plan.from,
            plan.to,
            manager,
          );
        }

        const event = await this.events.append(
          {
            courseId: course.id,
            moduleId: module?.id ?? null,
            action,
            fromStatus: plan.from,
            toStatus: plan.to,
            actorAdminId: actor.id,
            actorRole: actor.role,
            note,
            subjectVersion: target.version,
            publicationId: publication?.id ?? null,
          },
          manager,
        );

        return {
          courseId: course.id,
          moduleId: module?.id ?? null,
          fromStatus: plan.from,
          status: plan.to,
          version: target.version,
          event,
          publication,
          supersededPublication: superseded,
          modulesPublished: modulesToPublish.map((m) => m.id),
          modulesNotIncluded,
        };
      },
      { lockTimeoutMs: this.lockTimeoutMs ?? DEFAULT_WORKFLOW_LOCK_TIMEOUT_MS },
    );
  }

  async getState(
    subject: CatalogSubject,
    role: Role,
  ): Promise<CatalogWorkflowState> {
    const course = await this.curriculum.findCourseForWorkflow(
      subject.courseId,
    );
    if (!course) throw new NotFoundError('Course not found');
    const module = subject.moduleId
      ? await this.curriculum.findModuleForWorkflow(subject.moduleId)
      : null;
    if (subject.moduleId && (!module || module.courseId !== course.id)) {
      throw new NotFoundError('Module not found');
    }
    const target: CourseWorkflowRef = module ?? course;
    const active = await this.catalog.findActive(course.id);
    const published = module
      ? (active?.modules.some((m) => m.moduleId === module.id) ?? false)
      : active !== null;

    return {
      courseId: course.id,
      moduleId: module?.id ?? null,
      status: target.status,
      version: target.version,
      allowedActions: WORKFLOW_ACTIONS.filter(
        (action) =>
          canPerform(action, role) &&
          planCatalogTransition(action, target.status, published).allowed &&
          // a module can only be published into a course that is published
          !(module && action === 'PUBLISH' && !active),
      ),
      published,
      activePublication: active,
      latestEvent: await this.events.latest(course.id, module?.id ?? null),
    };
  }

  /** The course's (or module's) workflow history, newest first. */
  async listEvents(
    subject: CatalogSubject,
    limit: number,
    offset: number,
  ): Promise<{ items: CatalogWorkflowEvent[]; total: number }> {
    const course = await this.curriculum.findCourseForWorkflow(
      subject.courseId,
    );
    if (!course) throw new NotFoundError('Course not found');
    if (subject.moduleId) {
      const module = await this.curriculum.findModuleForWorkflow(
        subject.moduleId,
      );
      if (!module || module.courseId !== course.id) {
        throw new NotFoundError('Module not found');
      }
    }
    return this.events.list(course.id, subject.moduleId ?? null, limit, offset);
  }

  private async lockModule(
    courseId: string,
    moduleId: string,
    manager: Parameters<CurriculumFacade['lockModuleForWorkflow']>[1],
  ): Promise<ModuleWorkflowRef> {
    const module = await this.curriculum.lockModuleForWorkflow(
      moduleId,
      manager,
    );
    // a module of another course looks exactly like a missing one
    if (module.courseId !== courseId)
      throw new NotFoundError('Module not found');
    return module;
  }

  private async changeStatus(
    id: string,
    isModule: boolean,
    from: ContentStatus,
    to: ContentStatus,
    manager: Parameters<CurriculumFacade['lockModuleForWorkflow']>[1],
  ): Promise<void> {
    const applied = isModule
      ? await this.curriculum.compareAndSetModuleStatus(id, from, to, manager)
      : await this.curriculum.compareAndSetCourseStatus(id, from, to, manager);
    if (!applied) {
      // Cannot happen while the locks are held; refuse rather than record an event for a change that did not happen.
      throw new ConflictError('The state changed; reload and try again.');
    }
  }
}
