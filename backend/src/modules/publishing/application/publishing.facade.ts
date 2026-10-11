import { Injectable } from '@nestjs/common';
import type { LearningLevel } from '../../../shared-kernel/index.js';
import type { ActiveSnapshotInfo } from '../domain/models.js';
import { PublicationRepository } from '../persistence/publication.repository.js';

/**
 * What other modules (the Delivery module) may ask Publishing: the published snapshot a learner
 * should get right now. Read-only, plain data, no entities, and it only ever reads the publication
 * tables: never the authoring tables, never a draft, never an ended publication.
 *
 * Two small steps so that a revalidation (`If-None-Match`) needs only the hash, not a snapshot of
 * up to 5 MiB:
 *  1. `findActiveSnapshotInfo`: which publication/version/hash is active for this lesson and level.
 *  2. `readActiveSnapshotContent`: the stored content of that exact publication and level, but only
 *     if it is still active when read (a snapshot never changes, so the only thing that can have
 *     changed between the steps is that the publication ended).
 */
@Injectable()
export class PublishingFacade {
  constructor(private readonly publications: PublicationRepository) {}

  findActiveSnapshotInfo(
    lessonId: string,
    level: LearningLevel,
  ): Promise<ActiveSnapshotInfo | null> {
    return this.publications.findActiveSnapshotInfo(lessonId, level);
  }

  readActiveSnapshotContent(
    publicationId: string,
    level: LearningLevel,
  ): Promise<Record<string, unknown> | null> {
    return this.publications.findActiveSnapshotContent(publicationId, level);
  }
}
