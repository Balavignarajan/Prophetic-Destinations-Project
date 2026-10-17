import { configuredDaniel2Lesson } from '@/features/daniel-2/content';
import { PROGRESS_KEY } from '@/features/daniel-2/progress';
import { isLearningLevel } from '@/learning/levels';
import { isRecord, readJson, writeJson } from '@/storage/json-store';

import { type Bookmark, sceneBookmarkId } from './model';

/**
 * Storage of bookmarks: ONE list under `pd.bookmarks.v1`, shape { version: 1, items: Bookmark[], migrated: { daniel2Legacy } }.
 * Separate from the offline cache, learning progress, Daniel 2 progress and the theme preference.
 *
 * Migration. Before this version, Daniel 2 scene bookmarks lived inside the Daniel 2 progress record (`pd.daniel2.progress.v1`,
 * field `bookmarks`: a list of scene ids). On the first load of this store those ids are copied into the list as scene bookmarks
 * (titles from the lesson content), and `migrated.daniel2Legacy` is set so it never runs again. The legacy field is READ ONLY
 * here: it is left untouched, so the Daniel 2 progress format is unchanged and nothing is lost if the migration is interrupted.
 */
export const BOOKMARKS_KEY = 'pd.bookmarks.v1';

export type BookmarksState = { items: Bookmark[]; migratedLegacy: boolean };

function parseItem(raw: unknown): Bookmark | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.title !== 'string' || typeof raw.savedAt !== 'number') return null;
  if (raw.type === 'lesson' && typeof raw.lessonId === 'string' && isLearningLevel(raw.level)) {
    return {
      id: raw.id,
      type: 'lesson',
      lessonId: raw.lessonId,
      level: raw.level,
      courseId: typeof raw.courseId === 'string' ? raw.courseId : null,
      title: raw.title,
      savedAt: raw.savedAt,
      ...(typeof raw.unavailableSince === 'number' ? { unavailableSince: raw.unavailableSince } : {}),
    };
  }
  if (raw.type === 'daniel2-scene' && typeof raw.sceneId === 'string') {
    return { id: raw.id, type: 'daniel2-scene', sceneId: raw.sceneId, title: raw.title, savedAt: raw.savedAt };
  }
  return null;
}

function parseState(raw: unknown): BookmarksState | null {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.items)) return null;
  const seen = new Set<string>();
  const items: Bookmark[] = [];
  for (const entry of raw.items) {
    const item = parseItem(entry);
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  }
  return { items, migratedLegacy: isRecord(raw.migrated) && raw.migrated.daniel2Legacy === true };
}

/** Scene ids saved by the previous version inside the Daniel 2 progress record. */
async function readLegacySceneIds(): Promise<string[]> {
  const ids = await readJson(PROGRESS_KEY, (raw) =>
    isRecord(raw) && Array.isArray(raw.bookmarks) ? raw.bookmarks.filter((id): id is string => typeof id === 'string') : null,
  );
  return ids ?? [];
}

export async function loadBookmarks(): Promise<BookmarksState> {
  const saved = (await readJson(BOOKMARKS_KEY, parseState)) ?? { items: [], migratedLegacy: false };
  if (saved.migratedLegacy) return saved;

  const known = new Map(configuredDaniel2Lesson.scenes.map((scene) => [scene.id as string, scene.title]));
  const have = new Set(saved.items.map((item) => item.id));
  const now = Date.now();
  const migrated: Bookmark[] = [];
  for (const sceneId of await readLegacySceneIds()) {
    const title = known.get(sceneId);
    if (title && !have.has(sceneBookmarkId(sceneId))) {
      migrated.push({ id: sceneBookmarkId(sceneId), type: 'daniel2-scene', sceneId, title, savedAt: now });
      have.add(sceneBookmarkId(sceneId));
    }
  }
  const next: BookmarksState = { items: [...saved.items, ...migrated], migratedLegacy: true };
  await saveBookmarks(next);
  return next;
}

export function saveBookmarks(state: BookmarksState): Promise<void> {
  return writeJson(BOOKMARKS_KEY, { version: 1, items: state.items, migrated: { daniel2Legacy: state.migratedLegacy } });
}
