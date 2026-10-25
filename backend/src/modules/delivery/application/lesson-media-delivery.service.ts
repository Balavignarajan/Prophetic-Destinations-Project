import { Injectable } from '@nestjs/common';
import {
  type LearningLevel,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import { MediaFacade, type MediaContent } from '../../media/index.js';
import { PublishingFacade } from '../../publishing/index.js';
import { type ByteRange, parseByteRange } from '../domain/byte-range.js';
import { ifNoneMatchMatches } from '../domain/etag.js';

/** A course cover: the whole image, or "unchanged". */
export type CoverRepresentation = { kind: 'NOT_MODIFIED'; etag: string } | { kind: 'OK'; etag: string; content: MediaContent };

export type LessonMediaRepresentation =
  | { kind: 'NOT_MODIFIED'; etag: string }
  /** `range` is set when only part of the file is sent (a video being played or sought): the bytes `start` to `end` of `size`. */
  | { kind: 'OK'; etag: string; content: MediaContent; range?: ByteRange & { size: number } }
  | { kind: 'UNSATISFIABLE'; etag: string; size: number };

/** The file type each playable media kind must have. A MEDIA_ANIMATION block names its kind; the asset's own stored (byte-detected) type must agree. */
const PLAYABLE_TYPES: Record<string, string> = { VIDEO: 'video/mp4', LOTTIE: 'application/json' };

/**
 * The video and Lottie assets an active published snapshot actually names: the `mediaId` of a MEDIA_ANIMATION block whose `mediaType` is VIDEO or LOTTIE,
 * with the one file type that kind may be. A poster is an image and is covered by `publishedImageIds`. Nothing else in the snapshot can make a video or a
 * JSON file servable.
 */
export function publishedPlayableMedia(snapshot: Record<string, unknown>): Map<string, string> {
  const playable = new Map<string, string>();
  const blocks = snapshot.blocks;
  if (!Array.isArray(blocks)) return playable;
  for (const block of blocks) {
    if (typeof block !== 'object' || block === null) continue;
    const { type, content } = block as { type?: unknown; content?: unknown };
    if (type !== 'MEDIA_ANIMATION' || typeof content !== 'object' || content === null) continue;
    const { mediaType, mediaId } = content as { mediaType?: unknown; mediaId?: unknown };
    if (typeof mediaType === 'string' && typeof mediaId === 'string' && PLAYABLE_TYPES[mediaType]) playable.set(mediaId, PLAYABLE_TYPES[mediaType]);
  }
  return playable;
}

/** The image ids an active published snapshot actually uses: IMAGE, INTERACTIVE_IMAGE and MAP blocks and TIMELINE event images and HISTORICAL_EVIDENCE, SECTION_INTRO, SYMBOL_STUDY and NARRATIVE_SCENE images and MEDIA_ANIMATION assets and posters, and the images of the blocks nested inside an EXPLORE_DEEPER block, only; nothing else in the snapshot is trusted as a reference. */
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
    if (type === 'EXPLORE_DEEPER' && typeof content === 'object' && content !== null) {
      // One level of nested blocks, and only the nested types that carry an image: an IMAGE, or a SYMBOL_STUDY / HISTORICAL_EVIDENCE with an image.
      const nested = (content as { blocks?: unknown }).blocks;
      for (const child of Array.isArray(nested) ? nested : []) {
        if (typeof child !== 'object' || child === null) continue;
        const { type: childType, content: childContent } = child as { type?: unknown; content?: unknown };
        if (typeof childContent !== 'object' || childContent === null) continue;
        if (childType === 'IMAGE') {
          const childMedia = (childContent as { mediaId?: unknown }).mediaId;
          if (typeof childMedia === 'string') ids.add(childMedia);
        } else if (childType === 'SYMBOL_STUDY' || childType === 'HISTORICAL_EVIDENCE') {
          const image = (childContent as { image?: unknown }).image;
          const childImage = typeof image === 'object' && image !== null ? (image as { mediaId?: unknown }).mediaId : undefined;
          if (typeof childImage === 'string') ids.add(childImage);
        }
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
  ): Promise<CoverRepresentation> {
    const view = await this.publishing.findPublishedCourse(courseId, level);
    if (!view || view.coverMediaId !== mediaId) throw notFound();
    const asset = await this.media.find(mediaId);
    if (!asset || !asset.contentType.startsWith('image/')) throw notFound();
    const etag = `"${asset.sha256}"`;
    if (ifNoneMatchMatches(ifNoneMatch, etag)) return { kind: 'NOT_MODIFIED', etag };
    return { kind: 'OK', etag, content: await this.media.openContent(mediaId) };
  }

  /**
   * The picture of a Home Entry. Served only when the entry is visible to a learner at that level right now (enabled, with at least one assigned course published with lessons there) AND its picture is
   * this asset; every other case is the same 404, so a guessed id reveals nothing and an image no card uses cannot be fetched through this route.
   */
  async getHomeEntryImage(
    entryId: string,
    mediaId: string,
    level: LearningLevel,
    ifNoneMatch?: string,
  ): Promise<CoverRepresentation> {
    const view = await this.publishing.findPublishedHomeEntry(entryId, level);
    if (!view || view.imageMediaId !== mediaId) throw notFound();
    const asset = await this.media.find(mediaId);
    if (!asset || !asset.contentType.startsWith('image/')) throw notFound();
    const etag = `"${asset.sha256}"`;
    if (ifNoneMatchMatches(ifNoneMatch, etag)) return { kind: 'NOT_MODIFIED', etag };
    return { kind: 'OK', etag, content: await this.media.openContent(mediaId) };
  }

  /**
   * One media file of a published lesson: an image of any image block, or the video / Lottie file of a MEDIA_ANIMATION block that names it. A video may be
   * asked for in parts (`range`, `ifRange`): a player seeks by requesting the bytes it needs.
   */
  async getImage(
    lessonId: string,
    mediaId: string,
    level: LearningLevel,
    ifNoneMatch?: string,
    range?: string,
    ifRange?: string,
  ): Promise<LessonMediaRepresentation> {
    const info = await this.publishing.findActiveSnapshotInfo(lessonId, level);
    if (!info) throw notFound();
    const snapshot = await this.publishing.readActiveSnapshotContent(
      info.publicationId,
      level,
    );
    if (!snapshot || !publishedImageIds(snapshot).has(mediaId)) throw notFound();

    const asset = await this.media.find(mediaId);
    if (!asset) throw notFound();
    // An image is served for any block that uses it. A video or JSON file is served only as the asset of a MEDIA_ANIMATION block of that kind, and only
    // when the stored type agrees with the kind (a file of another type cannot be passed off as one).
    if (!asset.contentType.startsWith('image/') && publishedPlayableMedia(snapshot).get(mediaId) !== asset.contentType) throw notFound();

    // Stored files never change, so the content hash identifies the bytes; the checks above still run on every revalidation.
    const etag = `"${asset.sha256}"`;
    if (ifNoneMatchMatches(ifNoneMatch, etag)) {
      return { kind: 'NOT_MODIFIED', etag };
    }
    // A range is honoured unless `If-Range` names a different version of the file (then the whole, current file is sent).
    const wanted = ifRange && ifRange.trim() !== etag ? { kind: 'NONE' as const } : parseByteRange(range, asset.sizeBytes);
    if (wanted.kind === 'UNSATISFIABLE') return { kind: 'UNSATISFIABLE', etag, size: asset.sizeBytes };
    if (wanted.kind === 'RANGE') {
      return { kind: 'OK', etag, content: await this.media.openContent(mediaId, wanted.range), range: { ...wanted.range, size: asset.sizeBytes } };
    }
    return { kind: 'OK', etag, content: await this.media.openContent(mediaId) };
  }
}

function notFound() {
  return new NotFoundError('Image not found');
}
