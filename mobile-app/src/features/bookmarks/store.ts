import { isLearningLevel } from '@/learning/levels';
import { isRecord, readJson, writeJson } from '@/storage/json-store';

import { type Bookmark } from './model';

/**
 * Storage of bookmarks: ONE list under `pd.bookmarks.v1`, shape { version: 1, items: Bookmark[] }.
 * Separate from the offline cache, learning progress and the theme preference.
 *
 * A saved item of a kind this version does not know (for example a scene bookmark left by the removed built-in Daniel 2 preview) is skipped when the list is read,
 * and is gone from storage the next time the list is saved. An older record that still carries a `migrated` field is read as before; the field is ignored.
 */
export const BOOKMARKS_KEY = 'pd.bookmarks.v1';

export type BookmarksState = { items: Bookmark[] };

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
  return { items };
}

export async function loadBookmarks(): Promise<BookmarksState> {
  return (await readJson(BOOKMARKS_KEY, parseState)) ?? { items: [] };
}

export function saveBookmarks(state: BookmarksState): Promise<void> {
  return writeJson(BOOKMARKS_KEY, { version: 1, items: state.items });
}
