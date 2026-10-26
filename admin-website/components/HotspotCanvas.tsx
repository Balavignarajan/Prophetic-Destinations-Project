'use client';

import React, { useRef, useState } from 'react';
import { clampFraction, fractionsFromPoint } from '../lib/hotspot-block';
import MediaImage from './MediaImage';

export interface CanvasHotspot {
  id: string;
  /** Fractions 0..1 of the image from its top-left corner, or null when the hotspot is not placed yet. */
  x: number | null;
  y: number | null;
  label: string;
}

interface Props {
  mediaId: string;
  alt: string;
  hotspots: readonly CanvasHotspot[];
  selectedId: string | null;
  /** "hotspot" or "marker": used in the accessible names. */
  noun: string;
  /** 'edit': click the picture to place the selected hotspot, drag a marker to move it. 'view': markers only choose. */
  mode: 'edit' | 'view';
  disabled?: boolean;
  /** Edit: the selected hotspot was put where the picture was clicked. */
  onPlace?: (id: string, x: number, y: number) => void;
  /** Edit: a marker was dragged (on release) or nudged with the arrow keys. */
  onMove?: (id: string, x: number, y: number) => void;
  /** A marker was chosen. In view mode choosing the open one again passes null (close). */
  onSelect: (id: string | null) => void;
  onStatus?: (status: 'loading' | 'ready' | 'failed') => void;
  /** The tallest the picture may be, as a percentage of the window's height (default 70), so a tall picture is shown whole instead of running off the screen. */
  maxHeightVh?: number;
}

const DRAG_THRESHOLD = 4;
const CLICK_SUPPRESS_MS = 350;

/**
 * The picture of an interactive image with its numbered markers, for the editor and for the previews.
 *
 * COORDINATES. The box this component draws has exactly the picture's own aspect ratio (read from the loaded image) and the picture fills it, uncropped (`object-contain` in a box of the same
 * shape), so the box IS the displayed image: no letterboxing, no empty margin. Positions are fractions of THIS box, so they are the fractions of the picture, they do not change when the window
 * or the column is resized, and they are the same numbers the mobile app reads. The box is as wide as its column allows but never taller than `maxHeightVh` of the window (it gets narrower to
 * keep its shape), so a tall illustration such as the Daniel 2 statue is visible from head to feet.
 *
 * PLACING AND MOVING (edit mode). With a hotspot selected, a click or tap on the picture puts it there (nothing is created by a click: hotspots are added with "Add hotspot"). A marker is chosen
 * by clicking it and moved by dragging it (pointer events: mouse, pen and touch); it follows the pointer while dragging, stays inside the picture, and the new position is passed on when the pointer
 * is released. A drag never counts as a click, so it cannot place or create anything. The arrow keys nudge a focused marker. While dragging only this component redraws.
 */
export default function HotspotCanvas({ mediaId, alt, hotspots, selectedId, noun, mode, disabled = false, onPlace, onMove, onSelect, onStatus, maxHeightVh = 70 }: Props) {
  const [ratio, setRatio] = useState<number | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressClickUntil = useRef(0);
  const editing = mode === 'edit' && !disabled;
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);

  const rect = () => boxRef.current?.getBoundingClientRect() ?? null;

  const placeOnClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editing || !selectedId || !onPlace) return;
    if (Date.now() < suppressClickUntil.current) return; // the click that ends a drag
    const box = rect();
    const point = box ? fractionsFromPoint(e.clientX, e.clientY, box) : null;
    if (point) onPlace(selectedId, point.x, point.y);
  };

  const startDrag = (e: React.PointerEvent<HTMLButtonElement>, id: string) => {
    if (!editing || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false };
    onSelect(id);
  };
  const moveDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== e.pointerId) return;
    if (!current.moved && Math.hypot(e.clientX - current.startX, e.clientY - current.startY) < DRAG_THRESHOLD) return;
    current.moved = true;
    const box = rect();
    const point = box ? fractionsFromPoint(e.clientX, e.clientY, box) : null;
    if (point) setDrag({ id: current.id, x: point.x, y: point.y });
  };
  const endDrag = (e: React.PointerEvent<HTMLButtonElement>, commit: boolean) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // the capture may already be gone (the pointer was cancelled)
    }
    if (current.moved) {
      suppressClickUntil.current = Date.now() + CLICK_SUPPRESS_MS;
      const box = rect();
      const point = commit && box ? fractionsFromPoint(e.clientX, e.clientY, box) : null;
      if (point) onMove?.(current.id, point.x, point.y);
    }
    setDrag(null);
  };

  const nudge = (e: React.KeyboardEvent<HTMLButtonElement>, h: CanvasHotspot) => {
    if (!editing || h.x === null || h.y === null) return;
    const step = e.shiftKey ? 0.05 : 0.01;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = move[e.key];
    if (!delta) return;
    e.preventDefault();
    onMove?.(h.id, clampFraction(h.x + delta[0]), clampFraction(h.y + delta[1]));
  };

  const choose = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // choosing a marker is never a placement
    if (Date.now() < suppressClickUntil.current) return;
    onSelect(!editing && selectedId === id ? null : id);
  };

  return (
    <div
      ref={boxRef}
      role="group"
      aria-label={
        editing
          ? `Image with numbered ${noun} markers. Choose a ${noun}, then click the image to place it. Drag a marker to move it, or focus it and use the arrow keys.`
          : `Image with numbered ${noun} markers. Choose a marker to read its explanation.`
      }
      onClick={placeOnClick}
      style={{ width: ratio ? `min(100%, calc(${maxHeightVh}vh * ${ratio}))` : '100%', aspectRatio: ratio ?? undefined, minHeight: ratio ? undefined : '10rem' }}
      className={`relative mx-auto select-none rounded-lg bg-slate-100 ring-1 ring-slate-300 ${editing && selectedId ? 'cursor-crosshair' : ''}`}
    >
      <MediaImage
        mediaId={mediaId}
        alt={alt}
        fit="contain"
        className="pointer-events-none block h-full w-full rounded-lg"
        onStatus={(next) => {
          setStatus(next);
          onStatus?.(next);
        }}
        onNaturalSize={({ width, height }) => {
          if (width > 0 && height > 0) setRatio(width / height);
        }}
      />
      {status === 'ready' &&
        hotspots.map((h, index) => {
          const dragging = drag !== null && drag.id === h.id;
          const x = dragging ? drag.x : h.x;
          const y = dragging ? drag.y : h.y;
          if (x === null || y === null) return null;
          const selected = selectedId === h.id;
          return (
            <button
              key={h.id}
              type="button"
              onClick={(e) => choose(e, h.id)}
              onPointerDown={(e) => startDrag(e, h.id)}
              onPointerMove={moveDrag}
              onPointerUp={(e) => endDrag(e, true)}
              onPointerCancel={(e) => endDrag(e, false)}
              onKeyDown={(e) => nudge(e, h)}
              aria-label={`${Noun} ${index + 1}: ${h.label || 'no label yet'}${editing ? '. Drag to move, or use the arrow keys.' : ''}`}
              aria-pressed={selected}
              style={{ left: `${x * 100}%`, top: `${y * 100}%`, touchAction: editing ? 'none' : undefined }}
              className={`absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-sm font-bold shadow-md focus:outline-hidden focus-visible:ring-4 focus-visible:ring-amber-300 motion-safe:transition-transform ${
                selected ? 'z-20 scale-125 bg-amber-400 text-slate-950 ring-4 ring-amber-300/80' : 'z-10 bg-slate-900/90 text-white hover:bg-slate-700'
              } ${editing ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer'}`}
            >
              {index + 1}
            </button>
          );
        })}
    </div>
  );
}
