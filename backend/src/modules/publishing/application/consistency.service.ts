import { Injectable } from '@nestjs/common';
import { LessonsFacade } from '../../lessons/index.js';
import {
  MAX_LEVEL_SNAPSHOT_BYTES,
  canonicalJson,
  hashCanonicalJson,
} from '../domain/snapshot-payload.js';
import {
  ConsistencyRepository,
  type PublicationFinding,
} from '../persistence/consistency.repository.js';

export type ConsistencyCode =
  | 'PUBLISHED_WITHOUT_ACTIVE_PUBLICATION'
  | 'MULTIPLE_ACTIVE_PUBLICATIONS'
  | 'PUBLICATION_WITHOUT_PUBLISH_EVENT'
  | 'PUBLISH_EVENT_REVISION_MISMATCH'
  | 'UNPUBLISHED_WITHOUT_EVENT'
  | 'SUPERSEDED_WITHOUT_SUCCESSOR'
  | 'PUBLICATION_WITHOUT_SNAPSHOTS'
  | 'SNAPSHOT_HASH_MISMATCH'
  | 'SNAPSHOT_SIZE_MISMATCH'
  | 'SNAPSHOT_TOO_LARGE';

export interface ConsistencyIssue {
  code: ConsistencyCode;
  lessonId: string;
  publicationId: string | null;
  level?: string;
}

export interface ConsistencyReport {
  consistent: boolean;
  /** At most this many issues are listed per check. */
  limitPerCheck: number;
  /** Whether stored snapshots were re-hashed and re-measured. */
  snapshotsVerified: boolean;
  /** True when some check hit its limit, so there may be more issues than listed. */
  truncated: boolean;
  issues: ConsistencyIssue[];
}

const PAGE = 200;
const SNAPSHOT_BATCH = 10;

/**
 * Looks for lessons and publications that break the publishing invariants. Strictly read-only:
 * it reports, it never repairs. Most rules are also enforced by the database itself (so the
 * corresponding checks normally find nothing); the ones that cannot be a cheap constraint
 * (events matching publications, snapshot hash and size) are verified here.
 *
 * What is NOT an inconsistency: a lesson of any status other than PUBLISHED may have an
 * older publication still active. After an authoring edit the working copy goes back to DRAFT
 * (and on to READY_FOR_REVIEW or APPROVED) while the published version keeps serving.
 */
@Injectable()
export class ConsistencyService {
  constructor(
    private readonly lessons: LessonsFacade,
    private readonly repository: ConsistencyRepository,
  ) {}

  async check(
    options: { verifySnapshots?: boolean; limitPerCheck?: number } = {},
  ): Promise<ConsistencyReport> {
    const limit = options.limitPerCheck ?? 100;
    const issues: ConsistencyIssue[] = [];
    let truncated = false;

    const add = (code: ConsistencyCode, found: PublicationFinding[]) => {
      if (found.length >= limit) truncated = true;
      for (const finding of found.slice(0, limit)) {
        issues.push({ code, ...finding });
      }
    };

    const published = await this.publishedWithoutActivePublication(limit);
    add('PUBLISHED_WITHOUT_ACTIVE_PUBLICATION', published);
    add(
      'MULTIPLE_ACTIVE_PUBLICATIONS',
      await this.repository.multipleActive(limit),
    );
    add(
      'PUBLICATION_WITHOUT_PUBLISH_EVENT',
      await this.repository.withoutPublishEvent(limit),
    );
    add(
      'PUBLISH_EVENT_REVISION_MISMATCH',
      await this.repository.publishRevisionMismatch(limit),
    );
    add(
      'UNPUBLISHED_WITHOUT_EVENT',
      await this.repository.unpublishedWithoutEvent(limit),
    );
    add(
      'SUPERSEDED_WITHOUT_SUCCESSOR',
      await this.repository.supersededWithoutSuccessor(limit),
    );
    add(
      'PUBLICATION_WITHOUT_SNAPSHOTS',
      await this.repository.withoutLevels(limit),
    );

    if (options.verifySnapshots) {
      const bad = await this.verifySnapshots(limit);
      if (bad.truncated) truncated = true;
      issues.push(...bad.issues);
    }

    return {
      consistent: issues.length === 0,
      limitPerCheck: limit,
      snapshotsVerified: options.verifySnapshots === true,
      truncated,
      issues,
    };
  }

  /** Lessons whose status is PUBLISHED but that have no active publication. */
  private async publishedWithoutActivePublication(
    limit: number,
  ): Promise<PublicationFinding[]> {
    const found: PublicationFinding[] = [];
    let after: string | null = null;
    while (found.length < limit) {
      const ids = await this.lessons.listLessonIdsByStatus(
        'PUBLISHED',
        PAGE,
        after,
      );
      if (ids.length === 0) break;
      const active = await this.repository.lessonsWithActivePublication(ids);
      for (const id of ids) {
        if (!active.has(id)) found.push({ lessonId: id, publicationId: null });
      }
      after = ids[ids.length - 1];
    }
    return found;
  }

  /** Re-hashes and re-measures stored snapshots from their stored content. */
  private async verifySnapshots(
    limit: number,
  ): Promise<{ issues: ConsistencyIssue[]; truncated: boolean }> {
    const issues: ConsistencyIssue[] = [];
    let after: { publicationId: string; level: string } | null = null;
    for (;;) {
      const batch = await this.repository.snapshotsAfter(after, SNAPSHOT_BATCH);
      if (batch.length === 0) break;
      for (const snapshot of batch) {
        const canonical = canonicalJson(snapshot.content);
        const bytes = Buffer.byteLength(canonical, 'utf8');
        const base = {
          lessonId: snapshot.lessonId,
          publicationId: snapshot.publicationId,
          level: snapshot.level,
        };
        if (hashCanonicalJson(canonical) !== snapshot.contentHash) {
          issues.push({ code: 'SNAPSHOT_HASH_MISMATCH', ...base });
        }
        if (bytes !== snapshot.contentBytes) {
          issues.push({ code: 'SNAPSHOT_SIZE_MISMATCH', ...base });
        }
        if (bytes > MAX_LEVEL_SNAPSHOT_BYTES) {
          issues.push({ code: 'SNAPSHOT_TOO_LARGE', ...base });
        }
        if (issues.length >= limit) return { issues, truncated: true };
      }
      const last = batch[batch.length - 1];
      after = { publicationId: last.publicationId, level: last.level };
    }
    return { issues, truncated: false };
  }
}
