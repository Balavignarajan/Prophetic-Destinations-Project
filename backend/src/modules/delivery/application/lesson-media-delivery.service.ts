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

/** The image ids an active published snapshot actually uses: IMAGE, INTERACTIVE_IMAGE and MAP blocks and TIMELINE event images and HISTORICAL_EVIDENCE, SECTION_INTRO, SYMBOL_STUDY and NARRATIVE_SCENE images and MEDIA_ANIMATION assets and posters only, nothing else in the snapshot is trusted as a reference. */
export function publishedImageIds(snapshot: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  // The lesson's published cover (absent in snapshots written before covers existed).
  const cover = (snapshot.lesson as { coverMediaId?: unknown } | undefined)?.coverMediaId;
  if (typeof cover === 'string') ids.add(cover);
  const blocks = snapshot.blocks;
  if (!Array.isArray(blocks)) return ids;
  for (const block of blocks) {
    if (typeof block !== 'object' || block === null) continue;
    const { type, content } = block as { type?: unknown; content?: unknown };
    if (type === 'MEDIA_ANIMATION' && typeof content === 'object' && content !== null) {
      const { mediaId: animated, posterMediaId: poster } = content as { mediaId?: unknown; posterMediaId?: unknown };
      if (typeof animated === 'string') ids.add(animated);
      if (typeof poster === 'string') ids.add(poster);
      continue;
    }
    if ((type === 'HISTORICAL_EVIDENCE' || type === 'SECTION_INTRO' || type === 'SYMBOL_STUDY' || type === 'NARRATIVE_SCENE') && typeof content === 'object' && content !== null) {
      const image = (content as { image?: unknown }).image;
      const evidenceMedia = typeof image === 'object' && image !== null ? (image as { mediaId?: unknown }).mediaId : undefined;
      if (typeof evidenceMedia === 'string') ids.add(evidenceMedia);
      continue;
    }
    if (type === 'TIMELINE' && typeof content === 'object' && content !== null) {
      const events = (content as { events?: unknown }).events;
      for (const event of Array.isArray(events) ? events : []) {
        const eventMedia = typeof event === 'object' && event !== null ? (event as { mediaId?: unknown }).mediaId : undefined;
        if (typeof eventMedia === 'string') ids.add(eventMedia);
      }
      continue;
    }
    if ((type !== 'IMAGE' && type !== 'INTERACTIVE_IMAGE' && type !== 'MAP') || typeof content !== 'object' || content === null) {
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

  /**
   * The cover of a published course. Served only when the course is currently visible at that level AND its active
   * catalog snapshot names this asset as its cover; every other case is the same 404.
   */
  async getCourseCover(
    courseId: string,
    mediaId: string,
    level: LearningLevel,
    ifNoneMatch?: string,
  ): Promise<LessonMediaRepresentation> {
    const view = await this.publishing.findPublishedCourse(courseId, level);
    if (!view || view.coverMediaId !== mediaId) throw notFound();
    const asset = await this.media.find(mediaId);
    if (!asset || !asset.contentType.startsWith('image/')) throw notFound();
    const etag = `"${asset.sha256}"`;
    if (ifNoneMatchMatches(ifNoneMatch, etag)) return { kind: 'NOT_MODIFIED', etag };
    return { kind: 'OK', etag, content: await this.media.openContent(mediaId) };
  }

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
