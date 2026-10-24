'use client';

import React, { useEffect, useRef } from 'react';

interface Props {
  /** Names the item in the buttons' labels, e.g. "question 2" or "option 3 of question 2". */
  label: string;
  /** The item's current place (0-based) and how many items there are. */
  index: number;
  count: number;
  disabled?: boolean;
  /** Asked to move the item to the place `to` (always inside the list). */
  onMove: (to: number) => void;
}

const BUTTON = 'px-1 py-0.5 text-sm leading-none text-slate-600 hover:text-slate-900 rounded focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500/60 disabled:opacity-30 disabled:hover:text-slate-600';

/**
 * Move up / Move down for one question or option, in the same form the other reorderable lists of the CMS use (an up and a down arrow with spoken labels), disabled at the
 * ends. A move changes the order shown in the form; it is saved with the quiz, like every other change in the form. After a move the same arrow keeps the keyboard focus (or the
 * other arrow, when the item has just reached an end), because moving the item in the page would otherwise drop it.
 */
export default function QuizMoveButtons({ label, index, count, disabled = false, onMove }: Props) {
  const up = useRef<HTMLButtonElement>(null);
  const down = useRef<HTMLButtonElement>(null);
  const keep = useRef<'up' | 'down' | null>(null);

  useEffect(() => {
    const wanted = keep.current;
    if (!wanted) return;
    keep.current = null;
    const same = wanted === 'up' ? up.current : down.current;
    const other = wanted === 'up' ? down.current : up.current;
    (same && !same.disabled ? same : other)?.focus();
  }, [index]);

  if (count < 2) return null;
  return (
    <span className="inline-flex items-center">
      <button type="button" ref={up} aria-label={`Move ${label} up`} disabled={disabled || index === 0} onClick={() => { keep.current = 'up'; onMove(index - 1); }} className={BUTTON}>
        <span aria-hidden="true">&uarr;</span>
      </button>
      <button type="button" ref={down} aria-label={`Move ${label} down`} disabled={disabled || index === count - 1} onClick={() => { keep.current = 'down'; onMove(index + 1); }} className={BUTTON}>
        <span aria-hidden="true">&darr;</span>
      </button>
    </span>
  );
}
