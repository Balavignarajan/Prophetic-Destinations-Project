'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

/** What the guard is holding back until the administrator decides: following a link inside the Admin, or the browser's Back button. */
export type HeldNavigation = { kind: 'link'; target: string } | { kind: 'back' };

/**
 * One guard against losing unsaved work on a page, for the three ways of leaving it. While `active`:
 *
 *  1. REFRESH, CLOSE THE TAB, TYPE ANOTHER ADDRESS: the browser's own "Leave site?" question (`beforeunload`; the browser words it, a page cannot).
 *  2. A LINK INSIDE THE ADMIN (the sidebar, a course link in a row): the click is caught before Next.js sees it, nothing happens yet, and `held` says where it was going. The page asks, then
 *     calls `leave()` (go there) or `stay()` (do nothing). Links that open elsewhere (a new tab, another site, the same page) are not held. Next.js (App Router) has no navigation events to
 *     hook, so this watches clicks on links; a button that navigates by code (Sign out) is not held.
 *  3. THE BROWSER'S BACK BUTTON: while there is something to lose, one extra history entry sits above the page's own, so Back lands on THIS page and the question can be asked (`held` is
 *     { kind: 'back' }). `stay()` puts the entry back; `leave()` goes back for real. When nothing is left to lose the extra entry is taken away again. The Forward button cannot be held:
 *     the browser has already moved when the page hears of it.
 *
 * It is the only guard this page uses and it changes nothing about the page it protects; when `active` is false it does nothing at all.
 */
export function useUnsavedGuard(active: boolean) {
  const router = useRouter();
  const [held, setHeld] = useState<HeldNavigation | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const heldRef = useRef<HeldNavigation | null>(null);
  heldRef.current = held;
  // Whether the extra history entry is currently the one on top, and whether the next popstate is our own doing.
  const sentinel = useRef(false);
  const ignorePop = useRef(false);

  // 1. Refresh / close / other address.
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);

  // 2. Links inside the Admin. Caught in the capture phase, so they are held before the link's own handler (Next.js's Link) can start the navigation.
  useEffect(() => {
    if (!active) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || heldRef.current) return;
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      if ((target.target && target.target !== '_self') || target.hasAttribute('download')) return;
      const url = new URL(target.href, window.location.href);
      if (url.origin !== window.location.origin) return; // another site: the browser's own question (1) covers it
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // this page (or a place on it)
      event.preventDefault();
      event.stopPropagation();
      setHeld({ kind: 'link', target: `${url.pathname}${url.search}${url.hash}` });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [active]);

  // 3. The Back button.
  useEffect(() => {
    if (!active) return;
    if (!sentinel.current) {
      try {
        window.history.pushState(null, '', window.location.href);
        sentinel.current = true;
      } catch {
        /* history cannot be extended here: only (1) and (2) protect the page */
      }
    }
    const onPop = () => {
      if (ignorePop.current) {
        ignorePop.current = false;
        return;
      }
      // Back from the extra entry: we are on the page again. Ask before going any further.
      if (activeRef.current && sentinel.current && !heldRef.current) {
        sentinel.current = false;
        setHeld({ kind: 'back' });
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [active]);

  // Nothing left to lose: take the extra history entry away, so Back is one press again. (Not done when the page itself goes away, only when `active` turns off while it stays.)
  useEffect(() => {
    if (active || !sentinel.current) return;
    sentinel.current = false;
    ignorePop.current = true;
    window.history.back();
  }, [active]);

  /** Takes the extra entry away, then carries on with `then` (after the browser has moved). */
  const removeSentinel = useCallback((then: () => void) => {
    if (!sentinel.current) {
      then();
      return;
    }
    sentinel.current = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('popstate', finish);
      then();
    };
    ignorePop.current = true;
    window.addEventListener('popstate', finish);
    window.setTimeout(finish, 400);
    window.history.back();
  }, []);

  /** Stay on the page: nothing happens, and the guard keeps watching. */
  const stay = useCallback(() => {
    const was = heldRef.current;
    setHeld(null);
    if (was?.kind === 'back' && activeRef.current && !sentinel.current) {
      try {
        window.history.pushState(null, '', window.location.href);
        sentinel.current = true;
      } catch {
        /* see above */
      }
    }
  }, []);

  /** Go where the held navigation was going. The unsaved work is given up by the caller's choice of this button. */
  const leave = useCallback(() => {
    const was = heldRef.current;
    setHeld(null);
    if (!was) return;
    if (was.kind === 'link') removeSentinel(() => router.push(was.target));
    else window.history.back();
  }, [removeSentinel, router]);

  return { held, stay, leave };
}
