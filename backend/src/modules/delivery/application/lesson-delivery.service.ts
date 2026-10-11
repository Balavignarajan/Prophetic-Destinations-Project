import { Injectable } from '@nestjs/common';
import {
  type LearningLevel,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import { PublishingFacade } from '../../publishing/index.js';
import { ifNoneMatchMatches, snapshotEtag } from '../domain/etag.js';

/**
 * The stable response envelope of the public lesson endpoint. `snapshot` is the stored,
 * immutable payload exactly as published (its own `schemaVersion` and structure untouched).
 */
export interface LessonSnapshotEnvelope {
  lessonId: string;
  level: LearningLevel;
  publicationVersion: number;
  /** sha256 (hex) of the stored snapshot's canonical serialization. */
  contentHash: string;
  snapshot: Record<string, unknown>;
}

export type LessonRepresentation =
  | { kind: 'NOT_MODIFIED'; etag: string }
  | { kind: 'OK'; etag: string; envelope: LessonSnapshotEnvelope };

/** A look at the active publication changing between two reads is retried this many times. */
const MAX_ATTEMPTS = 3;

/**
 * Learner-facing read of a published lesson at one level. It only ever asks Publishing for the
 * ACTIVE publication's stored snapshot: there is no other source (no authoring tables, no preview,
 * no ended publication, no other level). Every "nothing to show" case is the same 404, so a
 * caller cannot tell a draft from a withdrawn, nonexistent or level-less lesson.
 */
@Injectable()
export class LessonDeliveryService {
  constructor(private readonly publishing: PublishingFacade) {}

  async getLessonSnapshot(
    lessonId: string,
    level: LearningLevel,
    ifNoneMatch?: string,
  ): Promise<LessonRepresentation> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const info = await this.publishing.findActiveSnapshotInfo(
        lessonId,
        level,
      );
      if (!info) throw notFound();

      const etag = snapshotEtag(info);
      // A revalidation needs only the hash: the (up to 5 MiB) content is never read for a 304.
      if (ifNoneMatchMatches(ifNoneMatch, etag)) {
        return { kind: 'NOT_MODIFIED', etag };
      }

      const snapshot = await this.publishing.readActiveSnapshotContent(
        info.publicationId,
        level,
      );
      if (snapshot) {
        return {
          kind: 'OK',
          etag,
          envelope: {
            lessonId: info.lessonId,
            level: info.level,
            publicationVersion: info.publicationVersion,
            contentHash: info.contentHash,
            snapshot,
          },
        };
      }
      // That publication ended between the two reads (withdrawn or replaced): look again.
    }
    throw notFound();
  }
}

function notFound() {
  return new NotFoundError('Lesson not found');
}
