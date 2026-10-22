import type { CourseListResponse, CourseResponse, LessonResponse } from '@/api/types';
import { courseCoverUrl, lessonCoverUrl } from '@/learning/cover-image';
import type { LearningLevel } from '@/learning/levels';

import { type CacheKind, cacheWrite } from './cache-store';
import {
  type AssetRef,
  currentEpoch,
  downloadSaved,
  forgetMissingFiles,
  hasAllAssets,
  initOfflineMedia,
  isOwnerComplete,
  mediaOwnerKey,
  offlineMediaEnabled,
  restoreSavedAssets,
  savedAssetIds,
  setSavedAssets,
  stageUpdate,
} from './offline-media';

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/**
 * The images a piece of PUBLISHED content needs, each with the learner route that serves it. Only what the delivered content
 * actually names: a lesson's IMAGE, INTERACTIVE_IMAGE, MAP, SYMBOL_STUDY, NARRATIVE_SCENE visuals, MEDIA_ANIMATION files and posters and TIMELINE-event images, the images of blocks nested inside an EXPLORE_DEEPER block, and cover; a course's cover and the covers of the lessons it lists; the covers of the
 * courses in the catalog list. (Lesson images and lesson covers use the same learner route.)
 */
export function assetsOf(kind: CacheKind, id: string, level: LearningLevel, data: unknown): AssetRef[] | null {
  const out: AssetRef[] = [];
  if (kind === 'lesson') {
    const lesson = data as LessonResponse;
    for (const block of lesson.snapshot?.blocks ?? []) {
      const mediaId = block.type === 'IMAGE' || block.type === 'INTERACTIVE_IMAGE' || block.type === 'MAP' ? (block.content as { mediaId?: unknown } | null)?.mediaId : undefined;
      if (isText(mediaId)) out.push({ mediaId, url: lessonCoverUrl(id, mediaId, level) });
    }
    for (const block of lesson.snapshot?.blocks ?? []) {
      if (block.type === 'MEDIA_ANIMATION') {
        // The animated file AND its poster are both needed to show the block, so both are collected (and tracked, deduplicated and cleaned up like every image).
        const c = (block.content ?? {}) as { mediaId?: unknown; posterMediaId?: unknown };
        for (const mediaId of [c.mediaId, c.posterMediaId]) if (isText(mediaId)) out.push({ mediaId, url: lessonCoverUrl(id, mediaId, level) });
        continue;
      }
      if (block.type === 'HISTORICAL_EVIDENCE' || block.type === 'SECTION_INTRO' || block.type === 'SYMBOL_STUDY' || block.type === 'NARRATIVE_SCENE') {
        const image = (block.content as { image?: unknown } | null)?.image;
        const mediaId = typeof image === 'object' && image !== null ? (image as { mediaId?: unknown }).mediaId : undefined;
        if (isText(mediaId)) out.push({ mediaId, url: lessonCoverUrl(id, mediaId, level) });
        continue;
      }
      if (block.type !== 'TIMELINE') continue;
      const events = (block.content as { events?: unknown } | null)?.events;
      for (const event of Array.isArray(events) ? events : []) {
        const mediaId = typeof event === 'object' && event !== null ? (event as { mediaId?: unknown }).mediaId : undefined;
        if (isText(mediaId)) out.push({ mediaId, url: lessonCoverUrl(id, mediaId, level) });
      }
    }
    // Blocks nested inside an Explore Deeper section: one level, and only the nested types that carry an image (an IMAGE, or a SYMBOL_STUDY /
    // HISTORICAL_EVIDENCE with an image). They are part of the lesson snapshot, so their pictures are saved with the lesson like any other.
    for (const block of lesson.snapshot?.blocks ?? []) {
      if (block.type !== 'EXPLORE_DEEPER') continue;
      const nested = (block.content as { blocks?: unknown } | null)?.blocks;
      for (const child of Array.isArray(nested) ? nested : []) {
        if (typeof child !== 'object' || child === null) continue;
        const { type, content } = child as { type?: unknown; content?: unknown };
        if (typeof content !== 'object' || content === null) continue;
        let mediaId: unknown;
        if (type === 'IMAGE') mediaId = (content as { mediaId?: unknown }).mediaId;
        else if (type === 'SYMBOL_STUDY' || type === 'HISTORICAL_EVIDENCE') {
          const image = (content as { image?: unknown }).image;
          mediaId = typeof image === 'object' && image !== null ? (image as { mediaId?: unknown }).mediaId : undefined;
        }
        if (isText(mediaId)) out.push({ mediaId, url: lessonCoverUrl(id, mediaId, level) });
      }
    }
    const cover = lesson.snapshot?.lesson?.coverMediaId;
    if (isText(cover)) out.push({ mediaId: cover, url: lessonCoverUrl(id, cover, level) });
    return out;
  }
  if (kind === 'course') {
    const course = data as CourseResponse;
    if (isText(course.coverMediaId)) out.push({ mediaId: course.coverMediaId, url: courseCoverUrl(id, course.coverMediaId, level) });
    const listed = [...(course.modules ?? []).flatMap((module) => module.lessons ?? []), ...(course.directLessons ?? [])];
    for (const lesson of listed) {
      if (isText(lesson.coverMediaId)) out.push({ mediaId: lesson.coverMediaId, url: lessonCoverUrl(lesson.lessonId, lesson.coverMediaId, level) });
    }
    return out;
  }
  if (kind === 'catalog') {
    for (const course of (data as CourseListResponse).courses ?? []) {
      if (isText(course.coverMediaId)) out.push({ mediaId: course.coverMediaId, url: courseCoverUrl(course.courseId, course.coverMediaId, level) });
    }
    return out;
  }
  return null; // navigation entries carry no images
}

/**
 * Saves freshly fetched, validated content to the content cache together with its images. `startedIn` is the offline-media epoch
 * from before the request began: if the offline cache was cleared meanwhile, nothing is written.
 *
 *  - No images to save (or a platform that keeps none): written at once.
 *  - First-time save, or the saved copy was not complete: the text is written at once (readable offline immediately) and its
 *    images are saved in the background; the item is "not fully saved" until they all arrive.
 *  - An update of a lesson whose saved copy is COMPLETE, when the new version needs images that are not on the device: the new
 *    content is staged. The old text and images stay in the cache; the new content is written only once all its images are on disk.
 *  - Courses and course lists (cover thumbnails only) are written at once with their new references.
 *
 * Resolves to `false` ONLY when the content cache refused the write (so the item is not saved for offline use and must not be reported
 * as saved); in every other case (saved, staged behind a complete older copy, or nothing to do because the cache was cleared) it is `true`.
 * When the write is refused the references are put back and no images are downloaded for it, so the text and its references always
 * describe the same saved version.
 */
export async function saveLoaded(kind: CacheKind, id: string, level: LearningLevel, value: unknown, startedIn: number): Promise<boolean> {
  if (startedIn !== currentEpoch()) return true; // the offline cache was cleared while this was loading
  let assets: AssetRef[] | null = null;
  try {
    assets = assetsOf(kind, id, level, value);
  } catch {
    assets = null; // a surprising shape: keep the text, skip the images
  }
  if (!offlineMediaEnabled || assets === null) return cacheWrite(kind, id, level, value);

  await initOfflineMedia();
  if (startedIn !== currentEpoch()) return true;
  const owner = mediaOwnerKey(kind, id, level);
  // A saved image whose file has gone is not "saved": forget it now, so it counts as missing and is downloaded again below.
  forgetMissingFiles(assets);

  if (kind === 'lesson' && isOwnerComplete(owner) && !hasAllAssets(assets)) {
    // The promotion must fail loudly when the cache refuses the new text, so the references stay with the older copy that is still saved.
    const promote = async () => {
      if (!(await cacheWrite(kind, id, level, value))) throw new Error('the offline cache refused the newer copy');
    };
    void stageUpdate(owner, assets, startedIn, promote).catch(() => undefined);
    return true; // the older, complete copy is still saved
  }

  // The references switch before the content they belong to is written, so the cache never holds new content with old references.
  const before = savedAssetIds(owner);
  setSavedAssets(owner, assets);
  if (!(await cacheWrite(kind, id, level, value))) {
    restoreSavedAssets(owner, before);
    return false;
  }
  void downloadSaved(owner, assets, startedIn).catch(() => undefined);
  return true;
}
