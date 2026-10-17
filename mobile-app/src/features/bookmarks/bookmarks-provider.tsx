import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { Bookmark } from './model';
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
};

const BookmarksContext = createContext<BookmarksContextValue>({
  items: [],
  ready: false,
  has: () => false,
  toggle: () => undefined,
  remove: () => undefined,
  setUnavailable: () => undefined,
});

/** Loads the saved list once (migrating legacy Daniel 2 bookmarks) and shares it with every screen. */
export function BookmarksProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BookmarksState>({ items: [], migratedLegacy: false });
  const [ready, setReady] = useState(false);
  const latest = useRef(state);

  useEffect(() => {
    let cancelled = false;
    loadBookmarks().then((loaded) => {
      if (cancelled) return;
      latest.current = loaded;
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

  const value = useMemo<BookmarksContextValue>(
    () => ({
      items: [...state.items].sort((a, b) => b.savedAt - a.savedAt),
      ready,
      has: (id) => state.items.some((item) => item.id === id),
      toggle,
      remove,
      setUnavailable,
    }),
    [state.items, ready, toggle, remove, setUnavailable],
  );

  return <BookmarksContext.Provider value={value}>{children}</BookmarksContext.Provider>;
}

export const useBookmarks = () => useContext(BookmarksContext);
