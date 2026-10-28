'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { ReusableBlock } from '../../lib/types';

/**
 * The content of a reusable block for the library's cards. The list route carries no content (by design), so a card asks for its block's content only once it comes into view, with a small
 * limit on how many requests are open at once, and every answer is remembered for as long as the block's version is the same: scrolling back or switching between grid and list asks for nothing
 * again, and an edited block (a new version) is fetched fresh. Reading only: nothing is written.
 */
const MAX_PARALLEL = 4;
const cache = new Map<string, ReusableBlock>();
const inflight = new Map<string, Promise<ReusableBlock>>();
let running = 0;
const waiting: (() => void)[] = [];

const slot = (): Promise<void> =>
  running < MAX_PARALLEL
    ? ((running += 1), Promise.resolve())
    : new Promise<void>((resolve) => {
        waiting.push(() => {
          running += 1;
          resolve();
        });
      });
const release = () => {
  running -= 1;
  waiting.shift()?.();
};

const keyOf = (id: string, version: number) => `${id}:${version}`;

function fetchBlock(id: string, version: number): Promise<ReusableBlock> {
  const key = keyOf(id, version);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const open = inflight.get(key);
  if (open) return open;
  const request = (async () => {
    await slot();
    try {
      const block = await api.request<ReusableBlock>(`/admin/reusable-blocks/${id}`);
      cache.set(keyOf(block.id, block.version), block);
      return block;
    } finally {
      release();
      inflight.delete(key);
    }
  })();
  inflight.set(key, request);
  return request;
}

/** Forgets what is remembered about one block (after it was edited or deleted). */
export function forgetBlock(id: string): void {
  for (const key of [...cache.keys()]) if (key.startsWith(`${id}:`)) cache.delete(key);
}

export type BlockContentState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; block: ReusableBlock } | { status: 'error' };

/** A ref to put on a card, and the content once the card has been in view. `retry` asks again after a failure. */
export function useBlockContent(id: string, version: number): { ref: (element: HTMLElement | null) => void; state: BlockContentState; retry: () => void } {
  const [seen, setSeen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<BlockContentState>(() => {
    const hit = cache.get(keyOf(id, version));
    return hit ? { status: 'ready', block: hit } : { status: 'idle' };
  });
  const observer = useRef<IntersectionObserver | null>(null);

  const ref = useCallback((element: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const next = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          next.disconnect();
        }
      },
      // A little before the card is on screen, so the preview is usually there when it arrives.
      { rootMargin: '240px' },
    );
    next.observe(element);
    observer.current = next;
  }, []);

  useEffect(() => () => observer.current?.disconnect(), []);

  useEffect(() => {
    const hit = cache.get(keyOf(id, version));
    if (hit) {
      setState({ status: 'ready', block: hit });
      return;
    }
    if (!seen) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    fetchBlock(id, version)
      .then((block) => !cancelled && setState({ status: 'ready', block }))
      .catch(() => !cancelled && setState({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [id, version, seen, attempt]);

  return { ref, state, retry: () => setAttempt((n) => n + 1) };
}
