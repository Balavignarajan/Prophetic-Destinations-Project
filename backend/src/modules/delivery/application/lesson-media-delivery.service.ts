import { Injectable } from '@nestjs/common';
import {
  type LearningLevel,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import { MediaFacade, type MediaContent } from '../../media/index.js';
import { PublishingFacade } from '../../publishing/index.js';
import { ifNoneMatchMatches } from '../domain/etag.js';

export type LessonMediaRepresentation =
  | { kind: 'NOT_MODIFIED'; etag: string }
  | { kind: 'OK'; etag: string; content: MediaContent };

/** The image ids an active published snapshot actually uses: IMAGE blocks only, nothing else in the snapshot is trusted as a reference. */
export function publishedImageIds(snapshot: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  const blocks = snapshot.blocks;
  if (!Array.isArray(blocks)) return ids;
  for (const block of blocks) {
    if (typeof block !== 'object' || block === null) continue;
    const { type, content } = block as { type?: unknown; content?: unknown };
    if (type !== 'IMAGE' || typeof content !== 'object' || content === null) {
      continue;
    }
    const mediaId = (content as { mediaId?: unknown }).mediaId;
    if (typeof mediaId === 'string') ids.add(mediaId);
  }
  return ids;
}

/**
 * Learner-facing read of one image of a published lesson. An asset is served only if the ACTIVE published snapshot of that
 * lesson at that level contains an IMAGE block pointing at it. Every other case (draft, withdrawn, other lesson, other level,
 * asset not in the snapshot, asset or file gone) is the same 404, so a guessed asset id reveals nothing and no unpublished or
 * unreferenced upload can be fetched through this route.
 */
@Injectable()
export class LessonMediaDeliveryService {
  constructor(
    private readonly publishing: PublishingFacade,
    private readonly media: MediaFacade,
  ) {}

  async getImage(
    lessonId: string,
    mediaId: string,
    level: LearningLevel,
    ifNoneMatch?: string,
  ): Promise<LessonMediaRepresentation> {
    const info = await this.publishing.findActiveSnapshotInfo(lessonId, level);
    if (!info) throw notFound();
    const snapshot = await this.publishing.readActiveSnapshotContent(
      info.publicationId,
      level,
    );
    if (!snapshot || !publishedImageIds(snapshot).has(mediaId)) throw notFound();

    const asset = await this.media.find(mediaId);
    if (!asset || !asset.contentType.startsWith('image/')) throw notFound();

    // Stored files never change, so the content hash identifies the bytes; the checks above still run on every revalidation.
    const etag = `"${asset.sha256}"`;
    if (ifNoneMatchMatches(ifNoneMatch, etag)) {
      return { kind: 'NOT_MODIFIED', etag };
    }
    return { kind: 'OK', etag, content: await this.media.openContent(mediaId) };
  }
}

function notFound() {
  return new NotFoundError('Image not found');
}
