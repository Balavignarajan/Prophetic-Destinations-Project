import { Inject, Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import type { ContentStatus } from '../../../shared-kernel/index.js';
import type { AuthenticatedAdmin, Role } from '../../identity/index.js';
import { LessonsFacade } from '../../lessons/index.js';
import type { WorkflowEvent } from '../domain/models.js';
import { normalizeNote } from '../domain/notes.js';
import { canPerform } from '../domain/roles.js';
import {
  SEPARATION_OF_DUTIES_POLICY,
  type SeparationOfDutiesPolicy,
  checkSeparationOfDuties,
} from '../domain/separation-of-duties.js';
import {
  type WorkflowAction,
  planTransition,
  requiresNote,
} from '../domain/workflow.js';
import { WorkflowEventRepository } from '../persistence/workflow-event.repository.js';

/**
 * The review actions available in this slice. PUBLISH and UNPUBLISH are part of the
 * workflow rules but are implemented later, together with publications.
 */
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
}

export interface WorkflowState {
  lessonId: string;
  status: ContentStatus;
  contentRevision: number;
  /** The actions this caller may perform right now (by role and by the lesson's current status). */
  allowedActions: ReviewAction[];
  latestEvent: WorkflowEvent | null;
}

const VERBS: Record<ReviewAction, string> = {
  SUBMIT_FOR_REVIEW: 'submit for review',
  REQUEST_CHANGES: 'request changes on',
  APPROVE: 'approve',
};

/**
 * Review workflow of a lesson: submit, request changes, approve.
 *
 * Each transition is one transaction that
 *   1. locks the lesson row (the lock every authoring writer takes first),
 *   2. checks the action is allowed from the current status and the expected revision,
 *   3. changes the status with a compare-and-set, and
 *   4. appends the audit event,
 * so the status change and its event commit or roll back together, and two
 * concurrent transitions can never both succeed. Workflow transitions are not
 * authoring changes: neither `lessons.version` nor `content_revision` moves.
 */
@Injectable()
export class WorkflowService {
  constructor(
    private readonly lessons: LessonsFacade,
    private readonly events: WorkflowEventRepository,
    private readonly transactions: TransactionRunner,
    @Inject(SEPARATION_OF_DUTIES_POLICY)
    private readonly separationOfDuties: SeparationOfDutiesPolicy,
  ) {}

  async perform(
    action: ReviewAction,
    lessonId: string,
    actor: AuthenticatedAdmin,
    input: TransitionInput = {},
  ): Promise<TransitionResult> {
    // Cheap checks first, before any lock is taken.
    if (!canPerform(action, actor.role)) {
      throw new ForbiddenError('You do not have permission to do this');
    }
    const note = normalizeNote(input.note, requiresNote(action));

    return this.transactions.run(async (manager) => {
      const state = await this.lessons.lockForWorkflow(lessonId, manager);

      if (
        input.expectedContentRevision !== undefined &&
        input.expectedContentRevision !== state.contentRevision
      ) {
        throw new ConflictError(
          'The lesson was changed since you last looked at it. Reload it and try again.',
          { currentContentRevision: state.contentRevision },
        );
      }

      // No publications exist yet in this slice, so nothing is ever actively published.
      const plan = planTransition(action, state.status, false);
      if (!plan.allowed) {
        throw new ConflictError(
          `Cannot ${VERBS[action]} a lesson that is ${state.status}`,
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
        },
        manager,
      );

      return {
        lessonId,
        fromStatus: plan.from,
        status: plan.to,
        contentRevision: state.contentRevision,
        event,
      };
    });
  }

  async getState(lessonId: string, role: Role): Promise<WorkflowState> {
    const state = await this.lessons.findWorkflowState(lessonId);
    if (!state) throw lessonNotFound();

    return {
      lessonId,
      status: state.status,
      contentRevision: state.contentRevision,
      allowedActions: REVIEW_ACTIONS.filter(
        (action) =>
          canPerform(action, role) &&
          planTransition(action, state.status, false).allowed,
      ),
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
