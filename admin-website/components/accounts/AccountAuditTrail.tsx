'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { accountError, accountsApi, actorLabel, describeEvent, formatDateTime } from '../../lib/accounts';
import type { AccountEvent, AccountItem } from '../../lib/types';
import { LoadingSpinner } from '../ui';

/**
 * The recorded history of ONE account, newest first, as a timeline: what happened (the stored event name in words), when, and who did it (you, the account itself, another staff member by
 * e-mail, or an account that is no longer listed). It shows exactly what the audit trail holds and nothing more (no sign-in times, addresses or devices are recorded, so none are shown). The
 * server returns 25 events at a time; "Load more" asks for the next page. The list scrolls inside its own frame, so a long history never stretches the panel.
 */
const PAGE = 25;

export default function AccountAuditTrail({
  accountId,
  accounts,
  currentUserId,
  refreshKey,
  headingRef,
}: {
  accountId: string;
  /** Used only to turn an actor's id into an e-mail address. */
  accounts: readonly AccountItem[];
  currentUserId: string;
  /** Changes whenever something was just done to the account, so the trail is read again. */
  refreshKey: number;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  const headingId = useId();
  const [items, setItems] = useState<AccountEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const run = useRef(0);

  const load = useCallback(async () => {
    const mine = ++run.current;
    setLoading(true);
    setError(null);
    setMoreError(null);
    try {
      const res = await accountsApi.events(accountId, 0, PAGE);
      if (mine !== run.current) return;
      setItems(res.items);
      setTotal(res.total);
    } catch (err: unknown) {
      if (mine === run.current) setError(accountError(err, 'The audit trail could not be loaded.').message);
    } finally {
      if (mine === run.current) setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const loadMore = async () => {
    if (loadingMore) return;
    const mine = run.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const res = await accountsApi.events(accountId, items.length, PAGE);
      if (mine !== run.current) return;
      setItems((current) => [...current, ...res.items.filter((e) => !current.some((c) => c.id === e.id))]);
      setTotal(res.total);
    } catch (err: unknown) {
      if (mine === run.current) setMoreError(accountError(err, 'More events could not be loaded.').message);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={headingId} ref={headingRef} tabIndex={-1} className="text-base font-semibold text-slate-900 focus:outline-hidden">
          Audit Trail
        </h3>
        {!loading && !error && <span className="text-xs text-slate-700">{total === 1 ? '1 event' : `${total} events`}</span>}
      </div>

      {loading ? (
        <LoadingSpinner text="Loading the audit trail..." />
      ) : error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <p>{error}</p>
          <button type="button" onClick={() => void load()} className="mt-2 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-900 hover:bg-rose-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">No events have been recorded for this account.</p>
      ) : (
        <div tabIndex={0} role="region" aria-label="Audit events, newest first. Scrollable." className="max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
          <ol className="p-4">
            {items.map((event, index) => {
              const words = describeEvent(event);
              const last = index === items.length - 1;
              const serious = event.action === 'ACCOUNT_DISABLED' || event.action === 'ACCOUNT_DELETED';
              return (
                <li key={event.id} className={`relative pl-7 ${last ? '' : 'pb-5'}`}>
                  {!last && <span aria-hidden="true" className="absolute bottom-0 left-[5px] top-4 w-px bg-slate-200" />}
                  <span aria-hidden="true" className={`absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full border-2 bg-white ${serious ? 'border-rose-500' : 'border-amber-500'}`} />
                  <p className="text-sm font-semibold text-slate-900">{words.title}</p>
                  {words.detail && <p className="text-sm text-slate-800 wrap-break-word">{words.detail}</p>}
                  <p className="mt-0.5 text-xs text-slate-700">
                    <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
                    <span aria-hidden="true"> · </span>
                    <span className="sr-only">, by </span>
                    <span className="wrap-break-word">{actorLabel(event, accounts, currentUserId)}</span>
                  </p>
                </li>
              );
            })}
          </ol>
          {items.length < total && (
            <div className="border-t border-slate-100 p-3 text-center">
              {moreError && (
                <p role="alert" className="mb-2 text-xs text-rose-900">
                  {moreError}
                </p>
              )}
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                {loadingMore ? 'Loading…' : `Load more (${total - items.length} older)`}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
