import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { TitledLesson } from '@/features/learning/progress-model';

import { type Bookmark, withCurrentBookmarkTitles } from './model';
import { type BookmarksState, loadBookmarks, saveBookmarks } from './store';

type BookmarksContextValue = {
  /** Newest first. */
  items: Bookmark[];
  ready: boolean;
  has: (id: string) => boolean;
  /** Adds the bookmark if absent, removes it if present. */
  toggle: (bookmark: Bookmark) => void;
  remove: (id: string) => void;
  /** Records whether the backend currently reports a saved lesson as unavailable. Writes only when that changes. */
  setUnavailable: (id: string, unavailable: boolean) => void;
  /**
   * Brings the saved title of these lessons up to date with the live published catalog (a lesson renamed in the CMS). Changes only the title of the saved lessons it
   * names, in place: ids, saved times, order and everything else stay, and nothing is written when the titles already match. Ignored until the saved list has been
   * read, so it can never be written over a list that is not known yet. The saved title stays the fallback when the catalog is not available.
   */
  syncTitles: (lessons: readonly TitledLesson[]) => void;
};

const BookmarksContext = createContext<BookmarksContextValue>({
  items: [],
  ready: false,
  has: () => false,
  toggle: () => undefined,
  remove: () => undefined,
  setUnavailable: () => undefined,
  syncTitles: () => undefined,
});

/** Loads the saved list once (migrating legacy Daniel 2 bookmarks) and shares it with every screen. */
export function BookmarksProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BookmarksState>({ items: [], migratedLegacy: false });
  const [ready, setReady] = useState(false);
  const latest = useRef(state);
  // True once the saved list has been read: a change that is not the learner's own never writes before that.
  const read = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadBookmarks().then((loaded) => {
      if (cancelled) return;
      latest.current = loaded;
      read.current = true;
      setState(loaded);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const commit = useCallback((next: BookmarksState) => {
    latest.current = next;
    setState(next);
    void saveBookmarks(next);
  }, []);

  const toggle = useCallback(
    (bookmark: Bookmark) => {
      const current = latest.current;
      const exists = current.items.some((item) => item.id === bookmark.id);
      commit({
        ...current,
        items: exists ? current.items.filter((item) => item.id !== bookmark.id) : [{ ...bookmark, savedAt: Date.now() }, ...current.items],
      });
    },
    [commit],
  );

  const remove = useCallback(
    (id: string) => {
      const current = latest.current;
      if (current.items.some((item) => item.id === id)) commit({ ...current, items: current.items.filter((item) => item.id !== id) });
    },
    [commit],
  );

  const setUnavailable = useCallback(
    (id: string, unavailable: boolean) => {
      const current = latest.current;
      const target = current.items.find((item) => item.id === id);
      if (!target || target.type !== 'lesson') return;
      if (unavailable === (target.unavailableSince !== undefined)) return;
      commit({
        ...current,
        items: current.items.map((item) => {
          if (item.id !== id || item.type !== 'lesson') return item;
          if (!unavailable) {
            const { unavailableSince: _dropped, ...rest } = item;
            return rest;
          }
          return { ...item, unavailableSince: Date.now() };
        }),
      });
    },
    [commit],
  );

  const syncTitles = useCallback(
    (lessons: readonly TitledLesson[]) => {
      if (!read.current) return;
      const current = latest.current;
      const items = withCurrentBookmarkTitles(current.items, lessons);
      if (items !== current.items) commit({ ...current, items });
    },
    [commit],
  );

  const value = useMemo<BookmarksContextValue>(
    () => ({
      items: [...state.items].sort((a, b) => b.savedAt - a.savedAt),
      ready,
      has: (id) => state.items.some((item) => item.id === id),
      toggle,
      remove,
      setUnavailable,
      syncTitles,
    }),
    [state.items, ready, toggle, remove, setUnavailable, syncTitles],
  );

  return <BookmarksContext.Provider value={value}>{children}</BookmarksContext.Provider>;
}

export const useBookmarks = () => useContext(BookmarksContext);
