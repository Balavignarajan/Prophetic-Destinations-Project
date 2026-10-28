'use client';

import { useRouter } from 'next/navigation';
import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';

// ------------------------------------------------------------------------------------------------------------------------------ the registry of unsaved work

/**
 * An ordered list with an arrangement that is not saved yet, as the guard needs to know it. Every list that keeps a draft order (lib/use-draft-order.ts, the Home Entries page) registers one
 * while its draft differs from the saved order, with `useUnsavedWork`; the single guard (components/UnsavedGuardHost.tsx, mounted once in the layout) then protects ALL of them at once: the
 * question when the administrator leaves the page, and the question `guardUnsavedWork` asks before an action that would reload the list under a draft.
 */
export interface UnsavedWork {
  /** What the draft is, for the questions: "Curriculum modules", "Block order". */
  label: string;
  /** Which list it is ("modules", "direct-lessons", "blocks"), so `guardUnsavedWork` can ask only about the lists an action actually changes. */
  scope?: string;
  /**
   * What the draft is: an arrangement of a list (the default, worded as "unsaved order changes") or edits to content in an editor, such as the Quiz Builder ("unsaved changes"). It only
   * changes the words of the question asked when the administrator leaves the page.
   */
  kind?: 'order' | 'changes';
  /** False while the list was changed by someone else and must be reloaded before its order can be saved. */
  canSave: boolean;
  /** Saves the draft; true when it is saved. */
  save: () => Promise<boolean>;
  /** Discards the draft (no request). */
  reset: () => void;
}

const registry = new Map<string, MutableRefObject<UnsavedWork>>();
const listeners = new Set<() => void>();
const notifyListeners = () => listeners.forEach((listener) => listener());

/** Registers `work` under `id` for as long as `active` (a draft exists). The latest `work` is always the one used; changing it does not re-register. */
export function useUnsavedWork(id: string, active: boolean, work: UnsavedWork): void {
  const ref = useRef(work);
  ref.current = work;
  useEffect(() => {
    if (!active) return;
    registry.set(id, ref);
    notifyListeners();
    return () => {
      if (registry.get(id) === ref) registry.delete(id);
      notifyListeners();
    };
  }, [id, active]);
  // The guard's text and buttons depend on these two.
  useEffect(() => {
    if (active) notifyListeners();
  }, [active, work.canSave, work.label]);
}

export function subscribeUnsavedWork(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A string that changes exactly when the registered work does (so it can be a React external-store snapshot): '' when there is none. */
export function unsavedWorkSnapshot(): string {
  if (registry.size === 0) return '';
  const works = [...registry.values()].map((ref) => ref.current);
  return JSON.stringify({ labels: works.map((work) => work.label), canSave: works.every((work) => work.canSave), changes: works.some((work) => work.kind === 'changes') });
}

/** The registered drafts an action concerns: all of them, or only those whose scope is in `scopes`. */
function concerned(scopes?: readonly string[]): MutableRefObject<UnsavedWork>[] {
  return [...registry.values()].filter((ref) => !scopes || (ref.current.scope !== undefined && scopes.includes(ref.current.scope)));
}

/** What the drafts an action concerns are called, and whether all of them can be saved now. */
export function unsavedWorkSummary(scopes?: readonly string[]): { labels: string[]; canSave: boolean } {
  const works = concerned(scopes).map((ref) => ref.current);
  return { labels: works.map((work) => work.label), canSave: works.every((work) => work.canSave) };
}

/** Saves the drafts an action concerns, one after the other; stops at the first that is not saved. True when all are. */
export async function saveAllUnsavedWork(scopes?: readonly string[]): Promise<boolean> {
  for (const ref of concerned(scopes)) {
    if (!(await ref.current.save())) return false;
  }
  return true;
}

/** Discards the drafts an action concerns. No request is made. */
export function resetAllUnsavedWork(scopes?: readonly string[]): void {
  for (const ref of concerned(scopes)) ref.current.reset();
}

export interface UnsavedQuestion {
  action: string;
  run: () => void;
  scopes?: readonly string[];
}
type AskHost = (question: UnsavedQuestion) => void;
let askHost: AskHost | null = null;

/** The guard host announces itself here so `guardUnsavedWork` can ask its question. */
export function registerUnsavedHost(host: AskHost): () => void {
  askHost = host;
  return () => {
    if (askHost === host) askHost = null;
  };
}

/**
 * Runs `run` now when no list has an unsaved order; otherwise asks first (Save Order and continue, Discard and continue, or Cancel) and runs it only after the administrator has decided what
 * becomes of the order. Use it for an action that would reload or change the list under a draft: adding or deleting an item, publishing, restoring. `action` names it in the question
 * ("Adding a module"). `scopes` names the lists the action changes ("modules"); a draft of any other list is not asked about, because the action cannot touch it. Without `scopes` every
 * unsaved list is concerned (publishing, restoring). Actions that leave the list as it is (opening a dialog that changes one item, switching a filter) need no guard.
 */
export function guardUnsavedWork(action: string, run: () => void, scopes?: readonly string[]): void {
  if (concerned(scopes).length === 0) {
    run();
    return;
  }
  if (askHost) {
    askHost({ action, run, scopes });
    return;
  }
  // No host (it is always mounted by the layout): the plain browser question, so a draft is still never dropped silently.
  if (window.confirm(`You have unsaved order changes. ${action} would lose them. Continue and discard them?`)) {
    resetAllUnsavedWork(scopes);
    run();
  }
}

// ------------------------------------------------------------------------------------------------------------------------------ leaving the page

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
 * It is the ONLY guard of the Admin's unsaved lists: it is run once, by `UnsavedGuardHost` in the layout, for whatever pages have registered unsaved work (see `useUnsavedWork` below),
 * so a page with two lists has one guard, not two. `pathname` is the current page's path: the extra history entry belongs to ONE page, so it is never taken away (or relied on) once the
 * path has changed, whatever the reason (a link, a redirect after the session ended). When `active` is false it does nothing at all.
 */
export function useUnsavedGuard(active: boolean, pathname: string) {
  const router = useRouter();
  const [held, setHeld] = useState<HeldNavigation | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const heldRef = useRef<HeldNavigation | null>(null);
  heldRef.current = held;
  // Whether the extra history entry is currently the one on top, which page it was added on, and whether the next popstate is our own doing.
  const sentinel = useRef(false);
  const sentinelPath = useRef('');
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
    // An entry left on another page is not this page's: forget it, and add one here.
    if (sentinel.current && sentinelPath.current !== pathname) sentinel.current = false;
    if (!sentinel.current) {
      try {
        window.history.pushState(null, '', window.location.href);
        sentinel.current = true;
        sentinelPath.current = pathname;
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
  }, [active, pathname]);

  // Nothing left to lose: take the extra history entry away, so Back is one press again. Only when the page is still the one the entry was added on: when `active` turned off because the
  // page itself went away (a link, a redirect), history is left exactly as it is.
  useEffect(() => {
    if (active || !sentinel.current) return;
    sentinel.current = false;
    if (sentinelPath.current !== pathname) return;
    ignorePop.current = true;
    window.history.back();
  }, [active, pathname]);

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
