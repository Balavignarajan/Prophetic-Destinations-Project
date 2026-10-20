'use client';

import React, { useState } from 'react';
import { type ScriptureEntryDraft, describeReference, useScriptureInfo } from '../lib/scripture-info';
import ScripturePicker, { type ScriptureRefValue } from './ScripturePicker';

const MAX = 5;
const BTN = 'px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

interface Props {
  /** Names the item in labels and messages, e.g. "Event 2" or "Hotspot 1". */
  itemLabel: string;
  /** Makes element ids unique per item. */
  idPrefix: string;
  entries: ScriptureEntryDraft[];
  /** Changes stay in the parent form until it is saved. */
  onChange: (entries: ScriptureEntryDraft[]) => void;
  disabled?: boolean;
  /** Replaces the default heading ("Scripture references for <item> (optional)"). */
  title?: string;
  /** Replaces the default text shown while the list is empty. */
  emptyMessage?: string;
  /** How many passages the list may hold (default 5); 1 makes it a single-reference field. */
  max?: number;
}

/**
 * The Scripture references of one timeline event or hotspot: add (with ScripturePicker, inline), remove, and refresh. Adding is possible
 * only when the server has the Scripture text to verify against; existing references are always kept and shown, also when it does not.
 * "Refresh" asks the server to re-verify a reference against the CURRENT text on the next save; it is never done silently.
 */
export default function ScriptureRefList({ itemLabel, idPrefix, entries, onChange, disabled = false, title, emptyMessage, max = MAX }: Props) {
  const info = useScriptureInfo();
  const [adding, setAdding] = useState(false);
  const [candidate, setCandidate] = useState<ScriptureRefValue | null>(null);

  const same = (a: ScriptureRefValue, b: ScriptureEntryDraft['reference']) => a.bookId === b.bookId && a.chapter === b.chapter && a.startVerse === b.startVerse && a.endVerse === b.endVerse;
  const duplicate = candidate !== null && entries.some((e) => same(candidate, e.reference));

  const note = (e: ScriptureEntryDraft): string | null => {
    if (e.refresh) return 'Will be checked again against the current Scripture text when you save.';
    if (e.stampFingerprint === undefined) return null; // added in this session
    if (!info.available) return 'Kept as saved. It cannot be re-checked until the Scripture text is installed.';
    if (e.stampFingerprint === null) return 'Added before text fingerprints existed, so it is not treated as verified. Use Refresh, then save.';
    if (info.fingerprint && e.stampFingerprint !== info.fingerprint) return 'The Scripture text on the server has changed since this was added. Use Refresh, save, and have the lesson reviewed again before publishing (administrators can publish directly).';
    return null;
  };

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
      <p className="text-xs font-semibold text-slate-800">{title ?? `Scripture references for ${itemLabel} (optional)`}</p>
      {entries.length === 0 ? (
        <p className="text-xs text-slate-700">{emptyMessage ?? `No Scripture passages. ${itemLabel} is published as it is without them.`}</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry, index) => {
            const text = describeReference(entry.reference, info.bookNames);
            const warning = note(entry);
            return (
              <li key={`${text}-${index}`} className="rounded-md border border-slate-200 bg-white p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900">{text}</span>
                  <span className="flex gap-2">
                    {info.available && (
                      <button type="button" className={BTN} disabled={disabled || entry.refresh} aria-label={`Refresh ${text} for ${itemLabel}`} onClick={() => onChange(entries.map((e, i) => (i === index ? { ...e, refresh: true } : e)))}>
                        Refresh
                      </button>
                    )}
                    <button type="button" className={BTN} disabled={disabled} aria-label={`Remove ${text} from ${itemLabel}`} onClick={() => onChange(entries.filter((_, i) => i !== index))}>
                      Remove
                    </button>
                  </span>
                </div>
                {warning && <p className="mt-1 text-xs text-amber-900">{warning}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {info.error ? (
        <p role="alert" className="text-xs text-rose-900">The Scripture information could not be loaded, so passages cannot be added right now. Existing ones are kept.</p>
      ) : !info.loading && !info.available ? (
        <p role="status" className="text-xs text-amber-900">
          New passages cannot be added: {info.message ?? 'the Scripture text is not installed on the server.'} Existing passages are kept, and other edits are not affected.
        </p>
      ) : null}

      {!adding ? (
        <button type="button" className={BTN} disabled={disabled || !info.available || entries.length >= max} onClick={() => setAdding(true)}>
          Add Scripture passage
        </button>
      ) : (
        <div className="space-y-2">
          <ScripturePicker idPrefix={idPrefix} value={null} onChange={setCandidate} disabled={disabled} />
          {duplicate && <p className="text-xs text-amber-900">This passage is already listed for {itemLabel}.</p>}
          <div className="flex gap-2">
            <button
              type="button"
              className={BTN}
              disabled={disabled || !candidate || duplicate}
              onClick={() => {
                if (!candidate) return;
                onChange([...entries, { reference: { ...candidate }, refresh: false }]);
                setCandidate(null);
                setAdding(false);
              }}
            >
              Add this passage
            </button>
            <button type="button" className={BTN} onClick={() => { setAdding(false); setCandidate(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {entries.length >= max && <p className="text-xs text-slate-700">{max === 1 ? 'One passage only. Remove it to choose a different one.' : `At most ${max} passages per item.`}</p>}
    </div>
  );
}
