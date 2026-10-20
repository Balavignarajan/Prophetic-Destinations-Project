'use client';

import { useEffect, useState } from 'react';
import { api } from './api';
import type { ScriptureRef } from './scripture-block';

/**
 * A Scripture reference attached to an item of another block (a timeline event or an image hotspot). PROPOSED schema, see
 * backend/src/modules/lessons/domain/blocks/scripture-refs.ts. The admin sends only { reference, refresh? }: the data set stamp is
 * recorded by the server and only READ here (to tell the author when the installed text has changed since the passage was added).
 */
export interface ScriptureEntryDraft {
  reference: ScriptureRef;
  /** Text fingerprint the server recorded: undefined = added in this session (no stamp yet), null = an older stamp without one. */
  stampFingerprint?: string | null;
  /** Staged request to re-verify against the installed text on the next save. */
  refresh: boolean;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const whole = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1;

/** The stored `scripture` list of an item (unusable entries are left out). */
export function readScriptureEntries(value: unknown): ScriptureEntryDraft[] {
  if (!Array.isArray(value)) return [];
  const out: ScriptureEntryDraft[] = [];
  for (const entry of value) {
    if (!isObject(entry) || !isObject(entry.reference)) continue;
    const r = entry.reference;
    if (typeof r.bookId !== 'string' || !whole(r.chapter) || !whole(r.startVerse) || !whole(r.endVerse)) continue;
    const dataset = isObject(entry.dataset) ? entry.dataset : null;
    out.push({
      reference: { bookId: r.bookId, chapter: r.chapter, startVerse: r.startVerse, endVerse: r.endVerse },
      stampFingerprint: dataset ? (typeof dataset.fingerprint === 'string' ? dataset.fingerprint : null) : undefined,
      refresh: false,
    });
  }
  return out;
}

/** What to send: references only (and refresh requests); never a stamp, never Scripture text. Empty list = key left out. */
export function buildScriptureEntries(entries: readonly ScriptureEntryDraft[]): { scripture: { reference: ScriptureRef; refresh?: true }[] } | Record<string, never> {
  if (entries.length === 0) return {};
  return { scripture: entries.map((e) => ({ reference: e.reference, ...(e.refresh ? { refresh: true as const } : {}) })) };
}

/** The references to save as a plain list (for a block's own list, such as a summary's key Scripture); undefined = nothing to send. */
export function buildScriptureList(entries: readonly ScriptureEntryDraft[]): { reference: ScriptureRef; refresh?: true }[] | undefined {
  if (entries.length === 0) return undefined;
  return entries.map((e) => ({ reference: e.reference, ...(e.refresh ? { refresh: true as const } : {}) }));
}

export interface ScriptureInfo {
  loading: boolean;
  error: boolean;
  available: boolean;
  /** Fingerprint of the installed text, when available. */
  fingerprint: string | null;
  message: string | null;
  bookNames: Record<string, string>;
}

let cached: Promise<Omit<ScriptureInfo, 'loading' | 'error'>> | null = null;

function fetchInfo(): Promise<Omit<ScriptureInfo, 'loading' | 'error'>> {
  cached ??= (async () => {
    const status = await api.request<{ available: boolean; message?: string; metadata?: { fingerprint?: string } }>('/admin/scripture/status');
    const books = await api.request<{ items: { id: string; name: string }[] }>('/admin/scripture/books');
    return {
      available: status.available,
      fingerprint: status.available ? (status.metadata?.fingerprint ?? null) : null,
      message: status.available ? null : (status.message ?? null),
      bookNames: Object.fromEntries(books.items.map((b) => [b.id, b.name])),
    };
  })();
  cached.catch(() => {
    cached = null; // a failed load is retried the next time a form opens
  });
  return cached;
}

/** Scripture availability, the installed text fingerprint and book names, loaded once and shared by every reference list on the page. */
export function useScriptureInfo(): ScriptureInfo {
  const [state, setState] = useState<ScriptureInfo>({ loading: true, error: false, available: false, fingerprint: null, message: null, bookNames: {} });
  useEffect(() => {
    let cancelled = false;
    fetchInfo()
      .then((info) => !cancelled && setState({ loading: false, error: false, ...info }))
      .catch(() => !cancelled && setState((s) => ({ ...s, loading: false, error: true })));
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

export function describeReference(ref: ScriptureRef, bookNames: Record<string, string>): string {
  const verses = ref.endVerse === ref.startVerse ? `${ref.startVerse}` : `${ref.startVerse}-${ref.endVerse}`;
  return `${bookNames[ref.bookId] ?? ref.bookId} ${ref.chapter}:${verses}`;
}
