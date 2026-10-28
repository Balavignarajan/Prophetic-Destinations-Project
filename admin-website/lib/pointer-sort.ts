'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type React from 'react';

/**
 * Drag-to-reorder for a vertical list, built on POINTER events so that one code path serves the mouse, a finger and a pen (the browser's own drag-and-drop does not work reliably on touch
 * screens). Only a row's HANDLE starts a drag: put `handle` on a button inside the row and `data-sort-id="<the row's id>"` on that button; nothing else in the row can start one. The handle
 * should have `touch-action: none` so a finger drags the row instead of scrolling the page.
 *
 * While dragging, the dragged row follows the pointer (its transform is written straight to the element, so the pointer's movement causes NO React renders), the rows between its old and its
 * new place slide out of the way (`rowShift`), and a placeholder marks the slot it will drop into (`gap`, relative to the list). React state changes only when the slot changes. The page
 * scrolls by itself near its top and bottom edge, and Escape (or a cancelled pointer) puts everything back. On release the hook calls `onMove(from, to)` once and does nothing else:
 * it never reorders the data itself, saves nothing and has no idea what the rows are.
 */
const START_PX = 4;
const EDGE_PX = 72;

interface RowBox {
  top: number;
  bottom: number;
}

export interface SortDrag {
  id: string;
  from: number;
  over: number;
  /** The dragged row's height. */
  height: number;
  /** How far the rows it passes slide: its height plus the space between rows (none in a list divided by borders, the gap of a list of cards). */
  step: number;
  /** Where the slot is, in pixels from the top of the list. */
  gapTop: number;
}

interface Session {
  id: string;
  pointerId: number;
  handle: HTMLElement;
  from: number;
  over: number;
  rows: RowBox[];
  height: number;
  step: number;
  listTop: number;
  startY: number;
  clientY: number;
  moved: boolean;
  scroller: HTMLElement | null;
  frame: number;
}

/** The nearest ancestor that really scrolls, or null for the page itself. */
function scrollParent(from: HTMLElement | null): HTMLElement | null {
  for (let node = from?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return null;
}

const scrollTopOf = (scroller: HTMLElement | null) => (scroller ? scroller.scrollTop : window.scrollY);
const originTop = (scroller: HTMLElement | null) => (scroller ? scroller.getBoundingClientRect().top : 0);
/** A pointer height in the scrolling area's own coordinates, which do not change when it scrolls. */
const toContent = (scroller: HTMLElement | null, clientY: number) => clientY - originTop(scroller) + scrollTopOf(scroller);

/** How far a row that is not being dragged is moved while `drag` is under way: the dragged row's height (and the space between rows) up or down when the dragged row passes it, otherwise nothing. */
export function rowShift(drag: SortDrag | null, index: number): number {
  if (!drag || index === drag.from) return 0;
  if (drag.from < drag.over && index > drag.from && index <= drag.over) return -drag.step;
  if (drag.from > drag.over && index >= drag.over && index < drag.from) return drag.step;
  return 0;
}

export interface SortHandle {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
  onLostPointerCapture: (event: React.PointerEvent<HTMLElement>) => void;
}

export function usePointerSort({ ids, disabled, onMove }: { ids: readonly string[]; disabled: boolean; onMove: (from: number, to: number) => void }) {
  const listRef = useRef<HTMLElement | null>(null);
  const rowEls = useRef(new Map<string, HTMLElement>());
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const session = useRef<Session | null>(null);
  const [drag, setDrag] = useState<SortDrag | null>(null);

  const registerRow = useCallback((id: string, element: HTMLElement | null) => {
    if (element) rowEls.current.set(id, element);
    else rowEls.current.delete(id);
  }, []);

  // All the imperative work lives in closures made once; they reach the current data only through the refs above, so they never go stale.
  const handle = useMemo<SortHandle>(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        end(false);
      }
    };

    function update() {
      const s = session.current;
      if (!s) return;
      const offset = toContent(s.scroller, s.clientY) - s.startY;
      if (!s.moved) {
        if (Math.abs(offset) < START_PX) return;
        s.moved = true;
        setDrag({ id: s.id, from: s.from, over: s.from, height: s.height, step: s.step, gapTop: s.rows[s.from].top - s.listTop });
        window.addEventListener('keydown', onKey);
        s.frame = requestAnimationFrame(tick);
      }
      const element = rowEls.current.get(s.id);
      if (element) element.style.transform = `translateY(${offset}px)`;
      // The slot the dragged row's middle is over.
      const middle = s.rows[s.from].top + s.height / 2 + offset;
      let over = s.rows.length - 1;
      for (let i = 0; i < s.rows.length; i++) {
        if (middle < s.rows[i].bottom) {
          over = i;
          break;
        }
      }
      if (over !== s.over) {
        s.over = over;
        const gapTop = (over <= s.from ? s.rows[over].top : s.rows[over].bottom - s.height) - s.listTop;
        setDrag((current) => (current ? { ...current, over, gapTop } : current));
      }
    }

    // Near the top or bottom edge of what scrolls, scroll it, faster the nearer the edge.
    function tick() {
      const s = session.current;
      if (!s || !s.moved) return;
      const top = s.scroller ? s.scroller.getBoundingClientRect().top : 0;
      const bottom = s.scroller ? s.scroller.getBoundingClientRect().bottom : window.innerHeight;
      let step = 0;
      if (s.clientY < top + EDGE_PX) step = -Math.ceil((top + EDGE_PX - s.clientY) / 6);
      else if (s.clientY > bottom - EDGE_PX) step = Math.ceil((s.clientY - (bottom - EDGE_PX)) / 6);
      if (step !== 0) {
        if (s.scroller) s.scroller.scrollTop += step;
        else window.scrollBy(0, step);
        update();
      }
      s.frame = requestAnimationFrame(tick);
    }

    function end(commit: boolean) {
      const s = session.current;
      if (!s) return;
      session.current = null;
      cancelAnimationFrame(s.frame);
      window.removeEventListener('keydown', onKey);
      const element = rowEls.current.get(s.id);
      if (element) element.style.transform = '';
      try {
        s.handle.releasePointerCapture(s.pointerId);
      } catch {
        /* the pointer is already gone */
      }
      setDrag(null);
      if (commit && s.moved && s.over !== s.from) onMoveRef.current(s.from, s.over);
    }

    return {
      onPointerDown(event) {
        if (disabledRef.current || session.current || !event.isPrimary) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const target = event.currentTarget;
        const id = target.dataset.sortId;
        const list = listRef.current;
        if (!id || !list) return;
        const from = idsRef.current.indexOf(id);
        if (from < 0) return;
        const scroller = scrollParent(list);
        const origin = originTop(scroller);
        const scrollTop = scrollTopOf(scroller);
        const rows: RowBox[] = [];
        for (const rowId of idsRef.current) {
          const element = rowEls.current.get(rowId);
          if (!element) return;
          const box = element.getBoundingClientRect();
          rows.push({ top: box.top - origin + scrollTop, bottom: box.bottom - origin + scrollTop });
        }
        try {
          target.setPointerCapture(event.pointerId);
        } catch {
          return;
        }
        // The space between this row and its neighbour (a list of cards has gaps; a list divided by borders has none).
        const spacing = Math.max(0, from + 1 < rows.length ? rows[from + 1].top - rows[from].bottom : from > 0 ? rows[from].top - rows[from - 1].bottom : 0);
        session.current = {
          id,
          pointerId: event.pointerId,
          handle: target,
          from,
          over: from,
          rows,
          height: rows[from].bottom - rows[from].top,
          step: rows[from].bottom - rows[from].top + spacing,
          listTop: list.getBoundingClientRect().top - origin + scrollTop,
          startY: toContent(scroller, event.clientY),
          clientY: event.clientY,
          moved: false,
          scroller,
          frame: 0,
        };
      },
      onPointerMove(event) {
        const s = session.current;
        if (!s || event.pointerId !== s.pointerId) return;
        s.clientY = event.clientY;
        update();
      },
      onPointerUp(event) {
        const s = session.current;
        if (!s || event.pointerId !== s.pointerId) return;
        s.clientY = event.clientY;
        update();
        end(true);
      },
      onPointerCancel(event) {
        if (session.current && event.pointerId === session.current.pointerId) end(false);
      },
      onLostPointerCapture(event) {
        if (session.current && event.pointerId === session.current.pointerId) end(false);
      },
    };
  }, []);

  return { listRef, registerRow, handle, drag };
}
