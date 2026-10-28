'use client';

import React from 'react';
import type { DraftOrder } from '../lib/use-draft-order';

const BUTTON = 'rounded-lg px-3.5 py-2 text-sm font-medium focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

/**
 * The bar under (or, for a long list, floating at the foot of) an ordered list while its arrangement is not saved: "Unsaved order changes", Reset and Save Order, with "Saving order…" and the
 * reason when a save did not happen. After a refusal (someone else changed the list) Save Order is held and "Reload latest order" is offered instead of overwriting anything. It is shown only
 * while there is something to save or reload, and says the same thing on every screen that orders a list. Reset asks for nothing and sends nothing; Save Order is a normal button that stays
 * focusable while it works (a second press does nothing), so the keyboard is never dropped.
 */
export default function OrderBar({ order, sticky = false }: { order: Pick<DraftOrder<{ id: string }>, 'dirty' | 'stale' | 'saving' | 'error' | 'saveOrder' | 'reset' | 'reloadLatest' | 'dismiss'>; sticky?: boolean }) {
  if (!order.dirty && !order.stale && !order.error) return null;
  // Only a message is left: the list changed under an arrangement that could not be kept (nothing is unsaved any more).
  if (!order.dirty && !order.stale) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        <span>{order.error}</span>
        <button type="button" onClick={order.dismiss} className={`${BUTTON} border border-rose-300 bg-white text-rose-900 hover:bg-rose-100`}>
          Dismiss
        </button>
      </div>
    );
  }
  return (
    <div
      role="region"
      aria-label="Unsaved order changes"
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 ${sticky ? 'sticky bottom-4 z-20 shadow-lg' : 'shadow-xs'}`}
    >
      <div className="min-w-0 flex-1 basis-64 space-y-0.5 text-amber-950">
        <p className="text-sm font-semibold">{order.dirty ? 'Unsaved order changes' : 'This list is out of date'}</p>
        {order.saving ? (
          <p role="status" className="flex items-center gap-2 text-xs">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-300 border-t-amber-800 motion-reduce:animate-none" aria-hidden="true" />
            Saving order…
          </p>
        ) : order.error ? (
          <p role="alert" className="text-xs font-medium text-rose-800">
            {order.error}
          </p>
        ) : (
          <p className="text-xs">The saved order stays in force until you choose Save Order.</p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {order.stale && (
          <button type="button" onClick={order.reloadLatest} disabled={order.saving} className={`${BUTTON} border border-rose-300 bg-white text-rose-900 hover:bg-rose-50 disabled:opacity-50`}>
            Reload latest order
          </button>
        )}
        {order.dirty && (
          <>
            <button type="button" onClick={order.reset} disabled={order.saving} className={`${BUTTON} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50`}>
              Reset
            </button>
            <button
              type="button"
              onClick={() => void order.saveOrder()}
              disabled={order.stale}
              aria-busy={order.saving}
              aria-disabled={order.saving || order.stale}
              className={`${BUTTON} bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 ${order.saving ? 'cursor-wait opacity-80' : ''}`}
            >
              Save Order
            </button>
          </>
        )}
      </div>
    </div>
  );
}
