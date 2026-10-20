import { Inject, Injectable, Optional } from '@nestjs/common';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import { libraryLessonRefused } from '../domain/library-lesson.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import type { ContentStatus } from '../../../shared-kernel/index.js';
import type { AuthenticatedAdmin, Role } from '../../identity/index.js';
import { LessonsFacade } from '../../lessons/index.js';
import type { Publication, WorkflowEvent } from '../domain/models.js';
import { normalizeNote } from '../domain/notes.js';
import { canPerform, canPublishDirectly } from '../domain/roles.js';
import {
  SEPARATION_OF_DUTIES_POLICY,
  type SeparationOfDutiesPolicy,
  checkSeparationOfDuties,
} from '../domain/separation-of-duties.js';
import {
  WORKFLOW_ACTIONS,
  type WorkflowAction,
  planTransition,
  requiresNote,
} from '../domain/workflow.js';
import { WorkflowEventRepository } from '../persistence/workflow-event.repository.js';
import { PublicationService } from './publication.service.js';

/**
 * How long a workflow transition waits for the lesson lock (or any other lock) before it
 * gives up with a retryable 409. Provided as a token so tests can shorten it.
 */
export const WORKFLOW_LOCK_TIMEOUT_MS = Symbol('WORKFLOW_LOCK_TIMEOUT_MS');
export const DEFAULT_WORKFLOW_LOCK_TIMEOUT_MS = 10_000;

/** The review actions (everything except publishing and unpublishing, which are ADMIN-only and create/end publications). ADMIN publishes without them. */
export const REVIEW_ACTIONS = [
  'SUBMIT_FOR_REVIEW',
  'REQUEST_CHANGES',
  'APPROVE',
] as const satisfies readonly WorkflowAction[];

export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export interface TransitionInput {
  note?: string | null;
  /** The content revision the actor was looking at; if it moved, the transition is refused (409). */
  expectedContentRevision?: number;
}

export interface TransitionResult {
  lessonId: string;
  fromStatus: ContentStatus;
  status: ContentStatus;
  contentRevision: number;
  event: WorkflowEvent;
  /** PUBLISH: the new publication. UNPUBLISH: the publication that was ended. Null for review actions. */
  publication: Publication | null;
  /** PUBLISH only: the previously active publication that the new one replaced. */
  supersededPublication: Publication | null;
}

export interface WorkflowState {
  lessonId: string;
  status: ContentStatus;
  contentRevision: number;
  /** The actions this caller may perform right now (by role and by the lesson's current status). */
  allowedActions: WorkflowAction[];
  /** The publication learners currently get, if any (it can exist while the working copy is being edited). */
  activePublication: Publication | null;
  latestEvent: WorkflowEvent | null;
}

const VERBS: Record<WorkflowAction, string> = {
  SUBMIT_FOR_REVIEW: 'submit for review',
  REQUEST_CHANGES: 'request changes on',
  APPROVE: 'approve',
  PUBLISH: 'publish',
  UNPUBLISH: 'unpublish',
};

/**
 * Workflow of a lesson: submit, request changes, approve, publish, unpublish.
 *
 * Each transition is one transaction that
 *   1. locks the lesson row (the lock every authoring writer takes first),
 *   2. checks the action is allowed from the current status and the expected revision,
 *   3. changes the status with a compare-and-set, and
 *   4. appends the audit event,
 * so the status change and its event commit or roll back together, and two
 * concurrent transitions can never both succeed. Publishing and unpublishing do their
 * publication work (snapshots, versions, ending the active one) in the same transaction,
 * between the checks and the status change. Workflow transitions are not authoring
 * changes: neither `lessons.version` nor `content_revision` moves.
 */
@Injectable()
export class WorkflowService {
  constructor(
    private readonly lessons: LessonsFacade,
    private readonly events: WorkflowEventRepository,
    private readonly transactions: TransactionRunner,
    @Inject(SEPARATION_OF_DUTIES_POLICY)
    private readonly separationOfDuties: SeparationOfDutiesPolicy,
    private readonly publications: PublicationService,
    @Optional()
    @Inject(WORKFLOW_LOCK_TIMEOUT_MS)
    private readonly lockTimeoutMs: number = DEFAULT_WORKFLOW_LOCK_TIMEOUT_MS,
  ) {}

  async perform(
    action: WorkflowAction,
    lessonId: string,
    actor: AuthenticatedAdmin,
    input: TransitionInput = {},
  ): Promise<TransitionResult> {
    // Cheap checks first, before any lock is taken.
    if (!canPerform(action, actor.role)) {
      throw new ForbiddenError('You do not have permission to do this');
    }
    const note = normalizeNote(input.note, requiresNote(action));

    return this.transactions.run(
      async (manager) => {
        const state = await this.lessons.lockForWorkflow(lessonId, manager);

        // A library lesson is an authoring source: it has no course, so it is never reviewed, published or delivered. Copy it into a course or module first.
        if (state.courseId === null) throw libraryLessonRefused();

        if (
          input.expectedContentRevision !== undefined &&
          input.expectedContentRevision !== state.contentRevision
        ) {
          throw new ConflictError(
            'The lesson was changed since you last looked at it. Reload it and try again.',
            { currentContentRevision: state.contentRevision },
          );
        }

        // Whether a publication is active matters only to unpublishing (read under the lesson lock).
        const active =
          action === 'UNPUBLISH'
            ? await this.publications.findActive(lessonId, manager)
            : null;
        const plan = planTransition(
          action,
          state.status,
          active !== null,
          canPublishDirectly(actor.role),
        );
        if (!plan.allowed) {
          throw new ConflictError(
            plan.reason === 'NOT_PUBLISHED'
              ? 'The lesson has no active publication to unpublish'
              : `Cannot ${VERBS[action]} a lesson that is ${state.status}`,
            { action, status: state.status, allowedFrom: plan.allowedFrom },
          );
        }

        checkSeparationOfDuties(this.separationOfDuties, {
          action,
          actorId: actor.id,
          priorEvents: (
            await this.events.list(lessonId, PRIOR_EVENTS_WINDOW, 0, manager)
          ).items.map((event) => ({
            action: event.action,
            actorId: event.actorAdminId,
          })),
        });

        // Publication work first: readiness failures and snapshot problems abort before anything is written.
        let publication: Publication | null = null;
        let supersededPublication: Publication | null = null;
        if (action === 'PUBLISH') {
          const effect = await this.publications.publish(
            lessonId,
            state.contentRevision,
            actor,
            manager,
          );
          publication = effect.publication;
          supersededPublication = effect.superseded;
        } else if (action === 'UNPUBLISH') {
          publication = await this.publications.unpublish(
            lessonId,
            actor,
            manager,
          );
        }

        // An unpublish that keeps the working copy's status writes nothing to the lesson at all
        // (the lock held since the start already guarantees the status is still what was planned).
        if (plan.from !== plan.to) {
          const applied = await this.lessons.compareAndSetStatus(
            lessonId,
            plan.from,
            plan.to,
            manager,
          );
          if (!applied) {
            // Cannot happen while the lock is held; refuse rather than record an event for a change that did not happen.
            throw new ConflictError(
              'The lesson changed state; reload it and try again.',
            );
          }
        }

        const event = await this.events.append(
          {
            lessonId,
            action,
            fromStatus: plan.from,
            toStatus: plan.to,
            actorAdminId: actor.id,
            actorRole: actor.role,
            note,
            contentRevision: state.contentRevision,
            publicationId: publication?.id ?? null,
          },
          manager,
        );

        return {
          lessonId,
          fromStatus: plan.from,
          status: plan.to,
          contentRevision: state.contentRevision,
          event,
          publication,
          supersededPublication,
        };
      },
      { lockTimeoutMs: this.lockTimeoutMs ?? DEFAULT_WORKFLOW_LOCK_TIMEOUT_MS },
    );
  }

  async getState(lessonId: string, role: Role): Promise<WorkflowState> {
    const state = await this.lessons.findWorkflowState(lessonId);
    if (!state) throw lessonNotFound();
    const activePublication = await this.publications.findActive(lessonId);

    return {
      lessonId,
      status: state.status,
      contentRevision: state.contentRevision,
      allowedActions: WORKFLOW_ACTIONS.filter(
        (action) =>
          state.courseId !== null &&
          canPerform(action, role) &&
          planTransition(
            action,
            state.status,
            activePublication !== null,
            canPublishDirectly(role),
          ).allowed,
      ),
      activePublication,
      latestEvent: await this.events.latest(lessonId),
    };
  }

  /** The lesson's workflow history, newest first. */
  async listEvents(lessonId: string, limit: number, offset: number) {
    if (!(await this.lessons.findWorkflowState(lessonId))) {
      throw lessonNotFound();
    }
    return this.events.list(lessonId, limit, offset);
  }
}

/** How many recent events a separation-of-duties policy gets to look at. */
const PRIOR_EVENTS_WINDOW = 50;

function lessonNotFound() {
  return new NotFoundError('Lesson not found');
}
