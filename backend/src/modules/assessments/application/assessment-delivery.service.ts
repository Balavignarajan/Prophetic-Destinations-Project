import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared-kernel/index.js';
import {
  type AssessmentResult,
  type PublicAssessment,
  type SubmittedAnswer,
  scoreAttempt,
  toPublicAssessment,
} from '../domain/assessment-rules.js';
import { AssessmentRepository } from '../persistence/assessment.repository.js';

/**
 * What the mobile app gets back: the result for the version it answered, plus where learners stand now.
 *
 * HOW TO READ `current`: the result is ALWAYS correct for `assessmentId` + `version`, the version the client rendered, whatever `current` says.
 *  - `current: true`  - that version is still the active one. Nothing more to do.
 *  - `current: false` - it has since been replaced or withdrawn. The recommendation is still valid advice and a learner is never locked to a level, so the app
 *    may keep it; it MAY offer a retake. `activePublication` says what a retake would use (null = no assessment is published now).
 */
export interface SubmissionResult extends AssessmentResult {
  current: boolean;
  activePublication: { assessmentId: string; version: number } | null;
}

/**
 * The learner side (anonymous, stateless, nothing is stored). Learners only ever see the ACTIVE PUBLICATION, an immutable snapshot: a draft, a pending or an
 * approved assessment, and any edit of the working copy, are invisible to them. Answers are scored against the exact published version the client names.
 */
@Injectable()
export class AssessmentDeliveryService {
  constructor(private readonly assessments: AssessmentRepository) {}

  /** The active published assessment, without points or any editorial data. 404 (reason ASSESSMENT_UNAVAILABLE) when none is published. */
  async getActive(): Promise<PublicAssessment> {
    const active = await this.assessments.findActive();
    if (!active) throw new NotFoundError('No assessment is available right now', { reason: 'ASSESSMENT_UNAVAILABLE' });
    return toPublicAssessment(active.snapshot);
  }

  /**
   * Scores answers against `assessmentId` at `version`: the stored snapshot, active or since superseded (a client that rendered an older version is scored
   * against that one). Unknown assessment or version: 404 (reason ASSESSMENT_VERSION_NOT_FOUND). Invalid, duplicate or missing answers: 422.
   */
  async submit(assessmentId: string, version: number, answers: readonly SubmittedAnswer[]): Promise<SubmissionResult> {
    const publication = await this.assessments.findPublication(assessmentId, version);
    if (!publication) throw new NotFoundError('This assessment version is not available', { reason: 'ASSESSMENT_VERSION_NOT_FOUND' });
    const result = scoreAttempt(publication.snapshot, answers);
    const active = await this.assessments.findActive();
    return { ...result, current: active !== null && active.id === publication.id, activePublication: active ? { assessmentId: active.assessmentId, version: active.version } : null };
  }
}
