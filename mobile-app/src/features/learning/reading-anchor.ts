/**
 * Content-aware reading position, as pure geometry (no React, no storage). The lesson reader measures where each block of the lesson sits in its scrolling area and
 * these functions turn a scroll offset into a `ReadingAnchor` (which block, how far down it) and an anchor back into an offset, so a saved position finds the same
 * part of the lesson again after the content, the images or the screen changed. See `ReadingAnchor` in progress-model.ts.
 */
import type { LessonPosition, ReadingAnchor } from './progress-model.ts';

/** A block's place in the scrolling area: the distance of its top from the top of the content, and its height. */
export type BlockBox = { blockId: string; top: number; height: number };

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const inReadingOrder = (boxes: readonly BlockBox[]) => [...boxes].sort((a, b) => a.top - b.top);

/**
 * The anchor of what is at the top of the screen at `offset`: the last block that starts at or above it. Null above the first block (the lesson's own opening,
 * which the plain offset describes well enough) and when nothing is measured yet. Between two blocks it is the block above, at its end.
 */
export function anchorAtOffset(offset: number, boxes: readonly BlockBox[]): ReadingAnchor | null {
  if (!Number.isFinite(offset) || boxes.length === 0) return null;
  const ordered = inReadingOrder(boxes);
  let found = -1;
  for (let index = 0; index < ordered.length; index += 1) if (ordered[index].top <= offset + 1) found = index;
  if (found < 0) return null;
  const box = ordered[found];
  const fraction = box.height > 0 ? clamp01((offset - box.top) / box.height) : 0;
  return { blockId: box.blockId, fraction: round3(fraction), index: found };
}

/** What a saved position restores to: the offset to scroll to, and how it was found. */
export type RestorePlan = { offset: number; via: 'block' | 'neighbour' | 'pixels' };

/**
 * Where to scroll for a saved position, given the lesson as it is laid out NOW (`boxes`) and its published version (`contentHash`, null when unknown):
 *  1. the saved block is still in the lesson: the same place in it ('block');
 *  2. otherwise, a position saved in this same published version (or before versions were recorded): the saved pixel offset ('pixels'), exactly as before;
 *  3. otherwise (the lesson was republished and that block is gone): the block that now sits where it used to, or the last one ('neighbour');
 *  4. otherwise nothing: the lesson opens at the top.
 */
export function planRestore(
  position: Pick<LessonPosition, 'offset' | 'anchor'> & { contentHash?: string | null },
  boxes: readonly BlockBox[],
  contentHash: string | null,
): RestorePlan | null {
  const ordered = inReadingOrder(boxes);
  const anchor = position.anchor;
  if (anchor) {
    const box = ordered.find((candidate) => candidate.blockId === anchor.blockId);
    if (box) return { offset: Math.max(0, Math.round(box.top + clamp01(anchor.fraction) * box.height)), via: 'block' };
  }
  const sameVersion = !position.contentHash || !contentHash || position.contentHash === contentHash;
  if (sameVersion) return Number.isFinite(position.offset) && position.offset >= 0 ? { offset: Math.round(position.offset), via: 'pixels' } : null;
  if (anchor && ordered.length > 0) {
    const box = ordered[Math.min(anchor.index, ordered.length - 1)];
    return { offset: Math.max(0, Math.round(box.top)), via: 'neighbour' };
  }
  return null;
}

/** True when the saved anchor's block is among `boxes` (so a plan for it is final); false while it may simply not be laid out yet. */
export const hasAnchorBlock = (anchor: ReadingAnchor | undefined, boxes: readonly BlockBox[]): boolean =>
  anchor === undefined || boxes.some((box) => box.blockId === anchor.blockId);
