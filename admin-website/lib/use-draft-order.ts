'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { moveItem, sameMembers, sameOrder } from './home-entries';
import { friendlyError } from './ui-messages';
import { useUnsavedWork } from './unsaved-guard';

/** The words the lists use when a refusal means the list changed under the arrangement. */
export const ORDER_CONFLICT_TEXT =
  'The order was changed by someone else (or items were added, removed or published) after this page was loaded, so nothing was saved and nobody else’s change was overwritten. Your arrangement is still here, unsaved. To go on, reload the latest order (that replaces your arrangement) and arrange it again.';

interface Options<T extends { id: string }> {
  /** What the list is called in the questions about leaving: "Curriculum modules", "Block order". */
  label: string;
  /** Which list this is ("modules", "direct-lessons", "blocks"): the page names it when it guards an action that changes that list (see `guardUnsavedWork`). */
  scope?: string;
  /** The list as the server has it, in its order. Replace it (a new array) whenever the page reloads. */
  items: readonly T[];
  canWrite: boolean;
  /** Names one item in what a screen reader is told. */
  itemLabel: (item: T) => string;
  /** Saves the COMPLETE order. `previousIds` is the order last seen, so the server can refuse (409) if it changed. Returns the items as stored. */
  save: (ids: string[], previousIds: string[]) => Promise<T[]>;
  /** Told the items the server returned after a successful save. */
  onSaved: (items: T[]) => void;
  /** Reloads the page's data (after a refusal, when the administrator asks for the latest order). */
  onReload: () => void;
}

export interface DraftOrder<T extends { id: string }> {
  /** The items in the arrangement on screen: the draft when there is one, otherwise the saved order. */
  ordered: T[];
  /** The arrangement on screen differs from the saved order. */
  dirty: boolean;
  saving: boolean;
  /** The list was changed by someone else under the draft: saving is held until the latest order is reloaded. */
  stale: boolean;
  error: string | null;
  /** The last Save Order succeeded (cleared by the next move). */
  saved: boolean;
  /** Said to screen readers; render it in a live region. */
  announcement: string;
  move: (from: number, to: number) => void;
  reset: () => void;
  saveOrder: () => Promise<boolean>;
  reloadLatest: () => void;
  /** Clears the success message. */
  dismiss: () => void;
}

function orderLike<T extends { id: string }>(items: readonly T[], ids: readonly string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const arranged = ids.map((id) => byId.get(id)).filter((item): item is T => Boolean(item));
  return arranged.length === items.length ? arranged : [...items];
}

/**
 * The draft-order behaviour of a list that saves its order on its own (not inside a form), the same as the Home Entries screen's: moving an item (drag, arrow keys, Move up / Move down)
 * changes only `ordered`, a DRAFT; nothing is sent. `dirty` is true while the draft differs from the saved order, and moving the items back clears it by itself. `saveOrder` sends the
 * complete draft with the order last seen, so the server refuses if anyone changed the list; a failure keeps the draft and can be repeated, a refusal keeps it too but holds saving
 * (`stale`) until `reloadLatest`, which is the only thing that discards the draft besides `reset` (no request). If the page reloads the list under a draft: the draft is kept when it still
 * fits, held as stale when the server's order moved meanwhile, and dropped with a message only when items were added or removed (merging would be a guess). While dirty the list is registered
 * as unsaved work, so leaving the page, and the actions the page guards with `guardUnsavedWork`, ask first.
 */
export function useDraftOrder<T extends { id: string }>({ label, scope, items, canWrite, itemLabel, save, onSaved, onReload }: Options<T>): DraftOrder<T> {
  const workId = useId();
  const serverIds = useMemo(() => items.map((item) => item.id), [items]);
  const serverKey = serverIds.join(',');
  const [draft, setDraft] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const draftRef = useRef<string[] | null>(null);
  const staleRef = useRef(false);
  const savingRef = useRef(false);
  const baseline = useRef(serverKey);
  const latest = useRef({ serverIds, canWrite, itemLabel, save, onSaved, onReload, items });
  latest.current = { serverIds, canWrite, itemLabel, save, onSaved, onReload, items };

  const commitDraft = useCallback((ids: string[] | null) => {
    draftRef.current = ids;
    setDraft(ids);
  }, []);
  const commitStale = useCallback((value: boolean) => {
    staleRef.current = value;
    setStale(value);
  }, []);

  // The list changed on the server (the page reloaded it): decide what becomes of an arrangement that was made on the old list.
  useEffect(() => {
    if (baseline.current === serverKey) return;
    baseline.current = serverKey;
    const current = draftRef.current;
    if (!current) {
      // Nothing arranged: whatever was said about an older list no longer applies.
      commitStale(false);
      setError(null);
      return;
    }
    if (!sameMembers(current, serverIds)) {
      commitDraft(null);
      commitStale(false);
      setError('Items were added, removed or published meanwhile, so your unsaved order could not be kept. The list now shows the latest order.');
    } else if (sameOrder(current, serverIds)) {
      // Someone saved exactly this arrangement.
      commitDraft(null);
      commitStale(false);
      setError(null);
    } else {
      // The same items, but the server's order moved under the arrangement: keep it, hold saving.
      commitStale(true);
      setError(ORDER_CONFLICT_TEXT);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  const move = useCallback(
    (from: number, to: number) => {
      const { serverIds: base, canWrite: allowed, itemLabel: name, items: list } = latest.current;
      if (!allowed || savingRef.current) return;
      const current = draftRef.current ?? base;
      if (to < 0 || to >= current.length || from < 0 || from >= current.length || from === to) return;
      const next = moveItem(current, from, to);
      const changed = !sameOrder(next, base);
      commitDraft(changed ? next : null);
      setSaved(false);
      if (!staleRef.current) setError(null);
      const item = list.find((candidate) => candidate.id === current[from]);
      setAnnouncement(
        `${item ? name(item) : 'Item'} moved to position ${to + 1} of ${next.length}. ${changed ? 'The order has unsaved changes. Choose Save Order to apply them.' : 'This is the saved order again, so there is nothing to save.'}`,
      );
    },
    [commitDraft],
  );

  const saveOrder = useCallback(async (): Promise<boolean> => {
    const ids = draftRef.current;
    if (!ids || savingRef.current || staleRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await latest.current.save(ids, latest.current.serverIds);
      baseline.current = result.map((item) => item.id).join(',');
      commitDraft(null);
      commitStale(false);
      setSaved(true);
      setAnnouncement('Order saved successfully.');
      latest.current.onSaved(result);
      return true;
    } catch (err: unknown) {
      // The draft stays exactly as it was. A refusal means the list changed under it (saving is held until it is reloaded); anything else can simply be tried again.
      const status = (err as { status?: number } | null)?.status;
      if (status === 409 || status === 404 || status === 422) {
        commitStale(true);
        setError(ORDER_CONFLICT_TEXT);
      } else {
        setError(`${friendlyError(err, 'The order could not be saved.')} Your arrangement is still here and nothing was changed. Choose Save Order to try again.`);
      }
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [commitDraft, commitStale]);

  const reset = useCallback(() => {
    if (savingRef.current) return;
    commitDraft(null);
    if (!staleRef.current) setError(null);
    setAnnouncement('Unsaved order changes discarded. The saved order is shown.');
  }, [commitDraft]);

  const reloadLatest = useCallback(() => {
    if (savingRef.current) return;
    if (draftRef.current && !window.confirm('Reload the latest order? Your unsaved arrangement will be discarded.')) return;
    commitDraft(null);
    commitStale(false);
    setError(null);
    setSaved(false);
    setAnnouncement('Loading the latest order.');
    latest.current.onReload();
  }, [commitDraft, commitStale]);

  /** Clears the success message, and any message that is not about a refusal still waiting to be dealt with. */
  const dismiss = useCallback(() => {
    setSaved(false);
    if (!staleRef.current) setError(null);
  }, []);

  const dirty = draft !== null;
  const ordered = useMemo(() => (draft ? orderLike(items, draft) : [...items]), [items, draft]);
  useUnsavedWork(`order-${workId}`, dirty, { label, scope, canSave: !stale, save: saveOrder, reset });

  return {
    ordered,
    dirty,
    saving,
    stale,
    error,
    saved,
    announcement,
    move,
    reset,
    saveOrder,
    reloadLatest,
    dismiss,
  };
}
