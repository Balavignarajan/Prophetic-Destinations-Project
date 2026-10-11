import { IsIn } from 'class-validator';
import {
  LEARNING_LEVELS,
  type LearningLevel,
} from '../../../../shared-kernel/index.js';

export class LessonDeliveryQueryDto {
  /** Required, exactly one of BEGINNER, INTERMEDIATE, ADVANCED (upper case). */
  @IsIn(LEARNING_LEVELS)
  level: LearningLevel;
}

/**
 * Response of `GET /api/v1/lessons/:lessonId?level=`.
 *
 * `snapshot` is the stored, immutable payload of that level, exactly as published; its own
 * `schemaVersion` and content structure are preserved. Everything else is the fixed envelope.
 * Nothing in the body depends on time or on the request.
 */
export class LessonSnapshotResponseDto {
  /** The requested lesson. */
  lessonId: string;
  /** The requested level. */
  level: LearningLevel;
  /** The publication this snapshot belongs to (per lesson, starting at 1). */
  publicationVersion: number;
  /** sha256 (hex) of the snapshot's canonical (sorted-key) JSON serialization. */
  contentHash: string;
  /** The stored snapshot payload; see the publishing documentation for its structure. */
  snapshot: Record<string, unknown>;
}
