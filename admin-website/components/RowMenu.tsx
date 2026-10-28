'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';

/** While `open`: pressing anywhere outside `containerRef`, or pressing Escape, calls `onClose`. */
export function useDismiss(open: boolean, onClose: () => void, containerRef: React.RefObject<HTMLElement | null>) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (event.target instanceof Node && containerRef.current?.contains(event.target)) return;
      closeRef.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, containerRef]);
}

export interface MenuItem {
  key: string;
  label: string;
  /** A short second line under the label. */
  hint?: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Drawn in red: the item destroys something. */
  danger?: boolean;
  /** A thin line above this item, to set a group apart. */
  dividerBefore?: boolean;
}

/**
 * A "more actions" button that opens a small menu (WAI-ARIA menu button): the button has `aria-haspopup` and `aria-expanded`; opening it (click, Enter, Space or the Down arrow) moves focus
 * to the first item that can be used; the Up and Down arrows, Home and End move between the items; Enter or Space uses one; Escape closes the menu and returns focus to the button; Tab
 * closes it and goes on; pressing anywhere else closes it. Items that cannot be used now are shown dimmed and are skipped by the arrow keys.
 */
export function RowMenu({ label, items, disabled = false, ownerId, onOpenChange }: { label: string; items: MenuItem[]; disabled?: boolean; ownerId: string; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpenState] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const notifyRef = useRef(onOpenChange);
  notifyRef.current = onOpenChange;

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    notifyRef.current?.(next);
  }, []);
  useDismiss(open, () => setOpen(false), wrapRef);

  // Opening the menu puts the keyboard on its first usable item.
  useEffect(() => {
    if (!open) return;
    const first = items.findIndex((item) => !item.disabled);
    itemRefs.current[first >= 0 ? first : 0]?.focus();
    // Only when it opens: the items are rebuilt on every render and must not pull focus back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A menu whose button became unusable (a save started) closes.
  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open, setOpen]);

  const usable = () => items.map((item, index) => (item.disabled ? -1 : index)).filter((index) => index >= 0);

  const onMenuKeys = (event: React.KeyboardEvent) => {
    const list = usable();
    const at = list.indexOf(itemRefs.current.findIndex((element) => element === document.activeElement));
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      if (list.length === 0) return;
      const next =
        event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : event.key === 'ArrowDown' ? (at + 1) % list.length : (at <= 0 ? list.length : at) - 1;
      itemRefs.current[list[next]]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'Tab') {
      // Focus goes back to the button first, so Tab carries on from there.
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        data-menu-owner={ownerId}
        title="More actions"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 aria-expanded:bg-slate-100"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <circle cx="4.5" cy="10" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="15.5" cy="10" r="1.6" />
        </svg>
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={label} onKeyDown={onMenuKeys} className="absolute right-0 top-full z-40 mt-1 w-60 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {items.map((item, index) => (
            <React.Fragment key={item.key}>
              {item.dividerBefore && <div role="separator" className="my-1 h-px bg-slate-200" />}
              <button
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                  item.onSelect();
                }}
                className={`flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-40 ${
                  item.danger ? 'text-rose-700 enabled:hover:bg-rose-50 enabled:focus-visible:bg-rose-50' : 'text-slate-800 enabled:hover:bg-slate-100 enabled:focus-visible:bg-slate-100'
                }`}
              >
                <span className="font-medium">{item.label}</span>
                {item.hint && <span className="text-xs font-normal text-slate-600">{item.hint}</span>}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
