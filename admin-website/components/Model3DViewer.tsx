'use client';

import React, { useEffect, useRef, useState } from 'react';
import { formatBytes } from '../lib/image-block';
import { type GlbTap, type GlbViewerInstance, type Placement, type ViewerHotspot, claimViewer, describeFailure, fetchModelBytes, loadGlbEngine } from '../lib/glb-viewer';
import { getMedia } from '../lib/media-api';
import type { MediaAsset } from '../lib/types';

interface Props {
  /** The GLB file in the Media Library. */
  mediaId: string;
  /** Names the viewer for screen readers. */
  title?: string;
  /** The height of the viewing area (a Tailwind class). */
  heightClass?: string;
  /** Adds a "Close 3D view" button; it is also called when another viewer on the page takes over (only one is live at a time). */
  onClose?: () => void;
  /** Shows the model's file name and size under the viewer (default). */
  showFileInfo?: boolean;
  /** The hotspots to draw as numbered markers attached to the model (points in model space). The same markers appear in the editor, the preview and the learner app. */
  hotspots?: readonly ViewerHotspot[];
  /** The chosen hotspot: its marker is highlighted. */
  selectedId?: string | null;
  /** Called with the id of a marker the author taps. */
  onSelectHotspot?: (id: string) => void;
  /** The EDITOR only: while set, the next tap (not a drag) picks the surface point under it and reports it; the viewer then also offers "Place at the centre" and Cancel. */
  placing?: Placement | null;
  /** The EDITOR only: lets the viewer find surface points (it keeps the model's triangles in memory for that, which a read-only preview does not). */
  editable?: boolean;
}

/** The viewing area's colour as the engine takes it (red, green, blue from 0 to 1): the Admin's dark navy. */
const BACKGROUND: [number, number, number] = [0.1, 0.13, 0.21];
/** The markers' colours in the same terms: gold with a dark ring, a brighter gold with a light ring when chosen. */
const MARKERS = {
  fill: [0.83, 0.69, 0.22] as [number, number, number],
  ring: [0.04, 0.05, 0.09] as [number, number, number],
  ink: [0.04, 0.05, 0.09] as [number, number, number],
  selectedFill: [0.96, 0.84, 0.42] as [number, number, number],
  selectedRing: [0.97, 0.95, 0.9] as [number, number, number],
};

const BTN = 'px-3 py-1.5 text-sm font-medium bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

/**
 * The live 3D preview of a GLB model from the Media Library: the real file, drawn by the viewer engine (lib/glb-viewer.ts). Drag to rotate, scroll or pinch to zoom, Shift-drag or right-drag
 * to pan, double-click or the Reset view button to go back to the starting view. It starts when it is shown (not before), shows what it is doing (downloading with a percentage, preparing),
 * says in plain words when it fails and offers Try again where that can help, and frees its graphics, its download and its model when it goes away. Only one viewer is live on a page.
 *
 * HOTSPOTS. Given `hotspots`, it draws their numbered markers on the model (the engine projects them with the camera that draws the model, so they stay on their spot through every rotation,
 * zoom, pan and reset, and a marker behind the model is drawn faint). Tapping a marker calls `onSelectHotspot`. For the editor (`editable` and `placing`), the next TAP picks the surface point
 * under it from the real triangles of the model: a drag only rotates, so rotating the model never places anything by accident. `placing.onMiss` is called when the tap hit no surface.
 */
export default function Model3DViewer({ mediaId, title = '', heightClass = 'h-72', onClose, showFileInfo = true, hotspots, selectedId = null, onSelectHotspot, placing = null, editable = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<GlbViewerInstance | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const placingRef = useRef(placing);
  placingRef.current = placing;
  const selectRef = useRef(onSelectHotspot);
  selectRef.current = onSelectHotspot;
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [stage, setStage] = useState<'download' | 'prepare'>('download');
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<{ message: string; retry: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [asset, setAsset] = useState<MediaAsset | 'missing' | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let viewer: GlbViewerInstance | null = null;
    const controller = new AbortController();
    const release = claimViewer(() => closeRef.current?.());
    setPhase('loading');
    setStage('download');
    setProgress(null);
    setProblem(null);
    const fail = (error: unknown) => {
      if (cancelled) return;
      setProblem(describeFailure(error));
      setPhase('error');
    };
    const onTap = (tap: GlbTap) => {
      const placement = placingRef.current;
      if (placement) {
        const hit = viewer?.pick(tap.clientX, tap.clientY) ?? null;
        if (hit) placement.onPlace(hit.position);
        else placement.onMiss();
        return;
      }
      if (tap.hotspotId) selectRef.current?.(tap.hotspotId);
    };
    (async () => {
      try {
        const [engine, bytes] = await Promise.all([
          loadGlbEngine(),
          fetchModelBytes(mediaId, (fraction) => { if (!cancelled) setProgress(fraction); }, controller.signal),
        ]);
        if (cancelled) return;
        setStage('prepare');
        // Parsing a large model keeps this page busy for a moment: let "Preparing the 3D view" be drawn first, so the wait is explained rather than looking like a freeze.
        await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
        if (cancelled) return;
        const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        viewer = engine.create(canvas, { background: BACKGROUND, reducedMotion: reduced, pickable: editable, markerStyle: MARKERS, onTap, onContextLost: () => fail({ code: 'context-lost' }) });
        viewerRef.current = viewer;
        await viewer.load(bytes);
        if (!cancelled) setPhase('ready');
      } catch (error) {
        if (controller.signal.aborted) return;
        fail(error);
        controller.abort(); // stop the other half (the download or the engine) of a failed attempt
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      release();
      viewer?.dispose();
      viewerRef.current = null;
    };
    // `editable` is fixed for the life of a viewer: a viewer is created for one purpose and a different purpose is a different component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaId, attempt]);

  // The markers follow the data: when the hotspots change, or the model has just become ready, they are handed to the engine again.
  useEffect(() => {
    if (phase === 'ready') viewerRef.current?.setHotspots(hotspots ?? []);
  }, [phase, hotspots]);
  useEffect(() => {
    if (phase === 'ready') viewerRef.current?.setSelected(selectedId);
  }, [phase, selectedId, hotspots]);

  // The file's name and size (shown under the viewer); a missing file is reported by the viewer itself.
  useEffect(() => {
    if (!showFileInfo) return;
    let cancelled = false;
    getMedia(mediaId)
      .then((found) => !cancelled && setAsset(found))
      .catch(() => !cancelled && setAsset('missing'));
    return () => {
      cancelled = true;
    };
  }, [mediaId, showFileInfo]);

  /** The keyboard-friendly way to place: the surface at the middle of the view. */
  const placeAtCentre = () => {
    const canvas = canvasRef.current;
    if (!canvas || !placing) return;
    const rect = canvas.getBoundingClientRect();
    const hit = viewerRef.current?.pick(rect.left + rect.width / 2, rect.top + rect.height / 2) ?? null;
    if (hit) placing.onPlace(hit.position);
    else placing.onMiss();
  };

  const percent = progress === null ? null : Math.round(progress * 100);
  const status = stage === 'prepare' ? 'Preparing the 3D view…' : percent === null ? 'Downloading the model…' : `Downloading the model… ${percent}%`;
  const hasMarkers = Boolean(hotspots && hotspots.length > 0);
  // The hotspot "Focus" applies to: the chosen one, if it is one of the markers.
  const focusId = selectedId && hotspots?.some((h) => h.id === selectedId) ? selectedId : null;

  return (
    <div className="space-y-2">
      <div className={`relative overflow-hidden rounded-lg border bg-slate-900 ${heightClass} ${placing ? 'border-amber-400 ring-2 ring-amber-400' : 'border-slate-300'}`}>
        {/* A new canvas for every attempt: a canvas whose graphics context was released cannot be given a new one. */}
        <canvas
          key={`${mediaId}:${attempt}`}
          ref={canvasRef}
          tabIndex={0}
          role="img"
          aria-label={`${title ? `3D model: ${title}. ` : '3D model. '}Drag to rotate, scroll to zoom. With the keyboard: arrow keys rotate, plus and minus zoom, 0 resets the view.${hasMarkers ? ' Numbered markers show its hotspots; they are also listed next to the model.' : ''}`}
          className={`block h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 ${placing ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        />
        {phase === 'loading' && (
          <div role="status" aria-live="polite" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-slate-100">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
            <span>{status}</span>
            {percent !== null && stage === 'download' && (
              <span className="h-1 w-40 overflow-hidden rounded-full bg-white/20" aria-hidden="true">
                <span className="block h-full bg-amber-400" style={{ width: `${percent}%` }} />
              </span>
            )}
          </div>
        )}
        {phase === 'error' && problem && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/90 p-4 text-center text-sm text-slate-100">
            <p className="max-w-sm">{problem.message}</p>
            {problem.retry && (
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="px-3 py-1.5 text-sm font-medium text-slate-900 bg-white rounded-lg hover:bg-slate-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-400">
                Try again
              </button>
            )}
          </div>
        )}
        {placing && phase === 'ready' && (
          <div role="status" aria-live="polite" className="pointer-events-none absolute inset-x-0 top-2 flex justify-center px-2">
            <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-semibold text-slate-900 shadow">{placing.message}</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BTN} onClick={() => viewerRef.current?.reset()} disabled={phase !== 'ready'}>
          Reset view
        </button>
        {/* Optional: brings the chosen hotspot into view. It only moves the camera; the hotspot's saved position is never touched, and Reset view returns. */}
        {!placing && focusId && (
          <button type="button" className={BTN} onClick={() => viewerRef.current?.focus(focusId, 0)} disabled={phase !== 'ready'}>
            Focus on hotspot
          </button>
        )}
        {placing && (
          <>
            <button type="button" className={BTN} onClick={placeAtCentre} disabled={phase !== 'ready'}>
              Place at the centre of the view
            </button>
            <button type="button" className={BTN} onClick={placing.onCancel}>
              Cancel placing
            </button>
          </>
        )}
        {onClose && (
          <button type="button" className={BTN} onClick={onClose}>
            Close 3D view
          </button>
        )}
        <p className="text-xs text-slate-700">
          {placing
            ? 'Rotate and zoom first if you need to, then click the surface of the model. Dragging never places anything.'
            : `Drag to rotate · scroll or pinch to zoom · Shift-drag or right-drag to pan · double-click to reset${hasMarkers ? ' · click a numbered marker to read it' : ''}`}
        </p>
      </div>
      {showFileInfo && asset && (
        <p className="text-xs text-slate-800 break-all">
          {asset === 'missing' ? (
            <span className="font-medium text-rose-800">The model file is not in the Media Library any more.</span>
          ) : (
            <>
              <span className="font-semibold">{asset.originalFilename}</span> · {formatBytes(asset.sizeBytes)}
            </>
          )}
        </p>
      )}
    </div>
  );
}
