import type {
  LevelSnapshot,
  Publication,
  PublicationEndReason,
} from '../../domain/models.js';

export class PublicationLevelDto {
  level: string;
  /** sha256 (hex) of the snapshot's canonical serialization. */
  contentHash: string;
  /** Size of that serialization in UTF-8 bytes. */
  contentBytes: number;
}

/** One published version. `active` while it is the version learners get; ended publications are kept forever. */
export class PublicationDto {
  id: string;
  lessonId: string;
  version: number;
  active: boolean;
  /** The lesson's content revision that was published. */
  sourceContentRevision: number;
  snapshotSchemaVersion: number;
  publishedAt: string;
  publishedBy: string;
  endedAt: string | null;
  endedBy: string | null;
  endedReason: PublicationEndReason | null;
  levels: PublicationLevelDto[];

  static from(publication: Publication): PublicationDto {
    return {
      id: publication.id,
      lessonId: publication.lessonId,
      version: publication.version,
      active: publication.endedAt === null,
      sourceContentRevision: publication.sourceContentRevision,
      snapshotSchemaVersion: publication.snapshotSchemaVersion,
      publishedAt: publication.publishedAt.toISOString(),
      publishedBy: publication.publishedBy,
      endedAt: publication.endedAt?.toISOString() ?? null,
      endedBy: publication.endedBy,
      endedReason: publication.endedReason,
      levels: publication.levels.map((level) => ({ ...level })),
    };
  }
}

export class PublicationListDto {
  items: PublicationDto[];
  total: number;
  limit: number;
  offset: number;
}

/** The stored snapshot of one level (admin view; there is no learner-facing endpoint yet). */
export class LevelSnapshotDto {
  lessonId: string;
  publicationId: string;
  version: number;
  level: string;
  contentHash: string;
  contentBytes: number;
  content: Record<string, unknown>;

  static from(snapshot: LevelSnapshot): LevelSnapshotDto {
    return {
      lessonId: snapshot.lessonId,
      publicationId: snapshot.publicationId,
      version: snapshot.version,
      level: snapshot.level,
      contentHash: snapshot.contentHash,
      contentBytes: snapshot.contentBytes,
      content: snapshot.content,
    };
  }
}
