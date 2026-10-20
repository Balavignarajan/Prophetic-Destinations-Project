import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  type ContentStatus,
  checkExpectedVersion,
  checkReorder,
} from '../../../shared-kernel/index.js';
import type { AuthenticatedAdmin, Role } from '../../identity/index.js';
import {
  type AssessmentInput,
  type AssessmentWithQuestions,
  type ValidationReport,
  buildSnapshot,
  checkAssessmentContent,
  normalizeAssessment,
  parseScoringConfig,
  snapshotHash,
  validateForPublishing,
} from '../domain/assessment-rules.js';
import {
  ASSESSMENT_ACTIONS,
  type AssessmentAction,
  canPerform,
  normalizeNote,
  planTransition,
  requiresNote,
} from '../domain/assessment-workflow.js';
import { type Publication, AssessmentRepository, type WorkflowEvent } from '../persistence/assessment.repository.js';

export interface TransitionInput {
  note?: string | null;
  /** The assessment `version` the actor was looking at; if it moved, the transition is refused (409). */
  expectedVersion?: number;
}

export interface TransitionResult {
  assessmentId: string;
  fromStatus: ContentStatus;
  status: ContentStatus;
  version: number;
  event: WorkflowEvent;
  /** PUBLISH: the new publication. UNPUBLISH: the one that was ended. Null for review actions. */
  publication: Publication | null;
  /** PUBLISH only: the publication it replaced (possibly of another assessment). */
  supersededPublication: Publication | null;
}

export interface AssessmentDetail {
  assessment: AssessmentWithQuestions;
  activePublication: Publication | null;
  latestVersion: number | null;
  allowedActions: AssessmentAction[];
}

const VERBS: Record<AssessmentAction, string> = {
  SUBMIT_FOR_REVIEW: 'submit for review',
  REQUEST_CHANGES: 'request changes on',
  APPROVE: 'approve',
  PUBLISH: 'publish',
  UNPUBLISH: 'unpublish',
};

const notFound = () => new NotFoundError('Assessment not found');

/**
 * Authoring and workflow of assessments (staff only; the HTTP layer enforces the roles, and the workflow re-checks them). Every write is ONE
 * transaction that locks the assessment row first, so edits and transitions on one assessment queue up and a stale `version` is refused.
 *
 * Editing changes the WORKING copy only and returns it to DRAFT; what learners get is the immutable publication (see `publish`). Publish and unpublish also
 * serialize on one advisory lock (there is a single active publication in total), taken BEFORE any row lock.
 */
@Injectable()
export class AssessmentService {
  constructor(
    private readonly assessments: AssessmentRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  list(limit: number, offset: number, status?: ContentStatus) {
    return this.assessments.list(limit, offset, status);
  }

  async get(id: string, role: Role): Promise<AssessmentDetail> {
    const assessment = await this.assessments.findWithQuestions(id);
    if (!assessment) throw notFound();
    const [activeOfThis, publications] = await Promise.all([this.assessments.findActiveOf(id), this.assessments.listPublications(id)]);
    return {
      assessment,
      activePublication: activeOfThis,
      latestVersion: publications[0]?.version ?? null,
      allowedActions: ASSESSMENT_ACTIONS.filter((action) => canPerform(action, role) && planTransition(action, assessment.status, activeOfThis !== null).allowed),
    };
  }

  async create(actor: AuthenticatedAdmin, input: AssessmentInput): Promise<string> {
    const content = this.validated(input);
    return this.transactions.run(async (manager) => {
      this.checkNoForeignIds(content, undefined);
      const id = await this.assessments.insertAssessment(
        { title: content.title, description: content.description ?? null, scoringConfig: this.configOf(content), createdBy: actor.id },
        manager,
      );
      await this.assessments.syncQuestions(id, content.questions, manager);
      return id;
    });
  }

  /** Replaces the whole content of the working copy (ids that are sent are kept). Returns it to DRAFT. The published version is not touched. */
  async update(id: string, input: AssessmentInput, expectedVersion?: number): Promise<void> {
    const content = this.validated(input);
    await this.transactions.run(async (manager) => {
      const current = await this.assessments.lock(id, manager);
      if (!current) throw notFound();
      checkExpectedVersion(current.version, expectedVersion);
      const existing = await this.assessments.questionsOf(id, manager);
      this.checkNoForeignIds(content, existing);
      await this.assessments.syncQuestions(id, content.questions, manager);
      await this.assessments.markEdited(id, { title: content.title, description: content.description ?? null, scoringConfig: this.configOf(content) }, manager);
    });
  }

  /** Sets the order of ALL questions. `previousQuestionIds` (the order the editor saw), if sent, must equal the stored order, else 409 and nothing changes. */
  async reorderQuestions(id: string, questionIds: readonly string[], previousQuestionIds?: readonly string[], expectedVersion?: number): Promise<void> {
    await this.transactions.run(async (manager) => {
      const current = await this.assessments.lock(id, manager);
      if (!current) throw notFound();
      checkExpectedVersion(current.version, expectedVersion);
      const stored = (await this.assessments.questionsOf(id, manager)).map((q) => q.id);
      this.checkStale(stored, previousQuestionIds, 'The question order was changed by someone else. Reload the assessment and try again.');
      checkReorder(stored, questionIds);
      if (stored.every((qid, index) => qid === questionIds[index])) return;
      await this.assessments.applyQuestionPositions(id, questionIds, manager);
      await this.assessments.markEdited(id, {}, manager);
    });
  }

  async reorderOptions(id: string, questionId: string, optionIds: readonly string[], previousOptionIds?: readonly string[], expectedVersion?: number): Promise<void> {
    await this.transactions.run(async (manager) => {
      const current = await this.assessments.lock(id, manager);
      if (!current) throw notFound();
      checkExpectedVersion(current.version, expectedVersion);
      const question = (await this.assessments.questionsOf(id, manager)).find((q) => q.id === questionId);
      if (!question) throw new NotFoundError('Question not found');
      const stored = question.options.map((o) => o.id);
      this.checkStale(stored, previousOptionIds, 'The answer order was changed by someone else. Reload the assessment and try again.');
      checkReorder(stored, optionIds);
      if (stored.every((oid, index) => oid === optionIds[index])) return;
      await this.assessments.applyOptionPositions(questionId, optionIds, manager);
      await this.assessments.markEdited(id, {}, manager);
    });
  }

  /** The publishing report of the saved working copy: blocking problems and non-blocking warnings. Read-only. */
  async validate(id: string): Promise<ValidationReport & { valid: boolean }> {
    const assessment = await this.assessments.findWithQuestions(id);
    if (!assessment) throw notFound();
    const report = validateForPublishing(assessment);
    return { valid: report.problems.length === 0, ...report };
  }

  publications(id: string) {
    return this.assertExists(id).then(() => this.assessments.listPublications(id));
  }

  events(id: string, limit: number, offset: number) {
    return this.assertExists(id).then(() => this.assessments.listEvents(id, limit, offset));
  }

  // ----------------------------------------------------------------------------------------------------------------------------------- workflow

  async perform(action: AssessmentAction, id: string, actor: AuthenticatedAdmin, input: TransitionInput = {}): Promise<TransitionResult> {
    if (!canPerform(action, actor.role)) throw new ForbiddenError('You do not have permission to do this');
    const note = normalizeNote(input.note, requiresNote(action));
    const publishing = action === 'PUBLISH' || action === 'UNPUBLISH';

    return this.transactions.run(async (manager) => {
      // Lock order: the global publishing lock (only publish/unpublish), then this assessment, then (publish only) the assessment it replaces.
      if (publishing) await this.assessments.lockPublishing(manager);
      const current = await this.assessments.lock(id, manager);
      if (!current) throw notFound();
      checkExpectedVersion(current.version, input.expectedVersion);

      const activeOfThis = await this.assessments.findActiveOf(id, manager);
      const plan = planTransition(action, current.status, activeOfThis !== null);
      if (!plan.allowed) {
        throw new ConflictError(
          plan.reason === 'NOT_PUBLISHED' ? 'The assessment has no active publication to unpublish' : `Cannot ${VERBS[action]} an assessment that is ${current.status}`,
          { action, status: current.status, allowedFrom: plan.allowedFrom },
        );
      }

      let publication: Publication | null = null;
      let supersededPublication: Publication | null = null;

      if (action === 'PUBLISH') {
        const effect = await this.publish(id, actor, manager);
        publication = effect.publication;
        supersededPublication = effect.superseded;
      } else if (action === 'UNPUBLISH') {
        const [ended] = await this.assessments.endActive('UNPUBLISHED', actor.id, manager, id);
        if (!ended) throw new ConflictError('The assessment has no active publication');
        publication = ended;
      }

      if (plan.from !== plan.to) await this.assessments.setStatus(id, plan.to, manager);

      const event = await this.assessments.appendEvent(
        { assessmentId: id, action, fromStatus: plan.from, toStatus: plan.to, actorAdminId: actor.id, actorRole: actor.role, note, assessmentVersion: current.version, publicationId: publication?.id ?? null },
        manager,
      );
      return { assessmentId: id, fromStatus: plan.from, status: plan.to, version: current.version, event, publication, supersededPublication };
    });
  }

  /**
   * Validates the locked working copy again (authoritatively), freezes it as the next version, ends the active publication (it is superseded) and records
   * it. Nothing is written if anything is wrong. If the superseded publication belonged to ANOTHER assessment, that assessment is withdrawn too: its
   * status goes PUBLISHED -> APPROVED (as for an unpublish) and its audit trail records it.
   */
  private async publish(id: string, actor: AuthenticatedAdmin, manager: EntityManager): Promise<{ publication: Publication; superseded: Publication | null }> {
    const assessment = await this.assessments.findWithQuestions(id, manager);
    if (!assessment) throw notFound();
    const report = validateForPublishing(assessment);
    if (report.problems.length > 0) {
      throw new BusinessRuleError('The assessment is not ready to be published', { report });
    }

    const ended = await this.assessments.endActive('SUPERSEDED', actor.id, manager);
    const version = await this.assessments.nextVersion(id, manager);
    const snapshot = buildSnapshot(assessment, version);
    const publication = await this.assessments.insertPublication({ assessmentId: id, version, snapshot, hash: snapshotHash(snapshot), publishedBy: actor.id }, manager);

    for (const replaced of ended.filter((p) => p.assessmentId !== id)) {
      const other = await this.assessments.lock(replaced.assessmentId, manager);
      if (!other) continue;
      const to: ContentStatus = other.status === 'PUBLISHED' ? 'APPROVED' : other.status;
      if (to !== other.status) await this.assessments.setStatus(other.id, to, manager);
      await this.assessments.appendEvent(
        {
          assessmentId: other.id,
          action: 'UNPUBLISH',
          fromStatus: other.status,
          toStatus: to,
          actorAdminId: actor.id,
          actorRole: actor.role,
          note: 'Withdrawn because another assessment was published',
          assessmentVersion: other.version,
          publicationId: replaced.id,
        },
        manager,
      );
    }
    return { publication, superseded: ended[0] ?? null };
  }

  // -------------------------------------------------------------------------------------------------------------------------------- helpers

  private async assertExists(id: string): Promise<void> {
    if (!(await this.assessments.findById(id))) throw notFound();
  }

  private validated(input: AssessmentInput): AssessmentInput {
    const content = normalizeAssessment(input);
    const problems = checkAssessmentContent(content);
    if (problems.length > 0) throw new BusinessRuleError('The assessment is not valid', { problems });
    return content;
  }

  private configOf(content: AssessmentInput) {
    return content.scoringConfig === null || content.scoringConfig === undefined ? null : parseScoringConfig(content.scoringConfig).config;
  }

  /** Ids sent with a save must belong to THIS assessment (an option to its own question): ids are never accepted from elsewhere. */
  private checkNoForeignIds(content: AssessmentInput, existing: AssessmentWithQuestions['questions'] | undefined): void {
    const known = new Map((existing ?? []).map((q) => [q.id, new Set(q.options.map((o) => o.id))]));
    const foreign: string[] = [];
    for (const q of content.questions) {
      if (q.id && !known.has(q.id)) foreign.push(q.id);
      for (const o of q.options) if (o.id && !(q.id && known.get(q.id)?.has(o.id))) foreign.push(o.id);
    }
    if (foreign.length > 0) throw new BusinessRuleError('Some ids do not belong to this assessment', { code: 'UNKNOWN_ID', ids: foreign });
  }

  private checkStale(stored: readonly string[], previous: readonly string[] | undefined, message: string): void {
    if (previous && (stored.length !== previous.length || stored.some((id, index) => id !== previous[index]))) throw new ConflictError(message);
  }
}
