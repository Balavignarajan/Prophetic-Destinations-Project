import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  BusinessRuleError,
  ConflictError,
  type LearningLevel,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import type { AuthenticatedAdmin } from '../../identity/index.js';
import { LessonsFacade } from '../../lessons/index.js';
import type { LevelSnapshot, Publication } from '../domain/models.js';
import { evaluateReadiness } from '../domain/readiness.js';
import {
  MAX_LEVEL_SNAPSHOT_BYTES,
  SNAPSHOT_SCHEMA_VERSION,
  buildLevelPayload,
  serializeSnapshot,
} from '../domain/snapshot-payload.js';
import {
  type NewLevelSnapshot,
  PublicationRepository,
} from '../persistence/publication.repository.js';

export interface PublishEffect {
  /** The newly created, active publication. */
  publication: Publication;
  /** The publication it replaced (ended as SUPERSEDED), if the lesson had one. */
  superseded: Publication | null;
}

/**
 * Publications: creating a version with its per-level snapshots, ending the active
 * one, and reading the history. The write methods do NOT open a transaction; they run
 * inside the workflow transition's transaction (WorkflowService), after it has locked
 * the lesson, so the snapshots, the publication rows, the status change and the audit
 * event commit or roll back together.
 */
@Injectable()
export class PublicationService {
  constructor(
    private readonly lessons: LessonsFacade,
    private readonly publications: PublicationRepository,
  ) {}

  /**
   * Builds and stores the next version. The caller holds the lesson lock and has already
   * checked the status and the expected revision. Readiness is judged again here,
   * authoritatively, against the locked content; if anything is wrong nothing is written.
   */
  async publish(
    lessonId: string,
    expectedContentRevision: number,
    actor: AuthenticatedAdmin,
    manager: EntityManager,
  ): Promise<PublishEffect> {
    const assembled = await this.lessons.assembleForPublication(
      lessonId,
      manager,
    );
    if (assembled.contentRevision !== expectedContentRevision) {
      // Cannot happen while the lesson lock is held; never snapshot content that is not what was locked.
      throw new ConflictError(
        'The lesson changed while publishing; reload it and try again.',
        { currentContentRevision: assembled.contentRevision },
      );
    }

    const report = evaluateReadiness(assembled);
    if (!report.ready) {
      throw new BusinessRuleError('The lesson is not ready to be published', {
        report,
      });
    }

    // One independent snapshot per available level: nothing is shared between levels.
    const levels: NewLevelSnapshot[] = assembled.levels.map((level) => {
      const serialized = serializeSnapshot(buildLevelPayload(assembled, level));
      if (serialized.bytes > MAX_LEVEL_SNAPSHOT_BYTES) {
        // Readiness already checks this with the same serialization; kept as the last line of defence.
        throw new BusinessRuleError(
          `The ${level.level} snapshot is too large to publish`,
          { level: level.level, bytes: serialized.bytes },
        );
      }
      return {
        level: level.level,
        json: serialized.json,
        hash: serialized.hash,
        bytes: serialized.bytes,
      };
    });

    const superseded = await this.publications.endActive(
      lessonId,
      'SUPERSEDED',
      actor.id,
      manager,
    );
    const version = await this.publications.nextVersion(lessonId, manager);
    const id = await this.publications.insert(
      {
        lessonId,
        version,
        courseId: assembled.courseId,
        moduleId: assembled.moduleId,
        sourceContentRevision: assembled.contentRevision,
        snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
        publishedBy: actor.id,
      },
      manager,
    );
    await this.publications.insertLevels(id, lessonId, levels, manager);

    return {
      publication: await this.publications.get(id, manager),
      superseded,
    };
  }

  /** Ends the active publication (exactly once); its snapshots are untouched. */
  async unpublish(
    lessonId: string,
    actor: AuthenticatedAdmin,
    manager: EntityManager,
  ): Promise<Publication> {
    const ended = await this.publications.endActive(
      lessonId,
      'UNPUBLISHED',
      actor.id,
      manager,
    );
    if (!ended) {
      throw new ConflictError('The lesson has no active publication');
    }
    return ended;
  }

  findActive(lessonId: string, manager?: EntityManager) {
    return this.publications.findActive(lessonId, manager);
  }

  // ---- reads (history is open to every admin role) ----

  /** Publication history, newest version first. */
  async list(lessonId: string, limit: number, offset: number) {
    await this.requireLesson(lessonId);
    return this.publications.list(lessonId, limit, offset);
  }

  async get(lessonId: string, version: number): Promise<Publication> {
    await this.requireLesson(lessonId);
    const publication = await this.publications.findByVersion(
      lessonId,
      version,
    );
    if (!publication) throw new NotFoundError('Publication not found');
    return publication;
  }

  async getSnapshot(
    lessonId: string,
    version: number,
    level: LearningLevel,
  ): Promise<LevelSnapshot> {
    await this.requireLesson(lessonId);
    const snapshot = await this.publications.findLevelSnapshot(
      lessonId,
      version,
      level,
    );
    if (!snapshot) throw new NotFoundError('Snapshot not found');
    return snapshot;
  }

  private async requireLesson(lessonId: string): Promise<void> {
    if (!(await this.lessons.findWorkflowState(lessonId))) {
      throw new NotFoundError('Lesson not found');
    }
  }
}
