'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { formatBytes } from '../lib/image-block';
import { type GlbTap, type GlbViewerInstance, type Placement, type ViewerHotspot, claimViewer, describeFailure, fetchModelBytes, loadGlbEngine } from '../lib/glb-viewer';
import { type ModelAsset, useModelAsset } from '../lib/use-model-asset';
import Icon, { type IconName } from './Model3DIcons';

interface Props {
  /** The GLB file in the Media Library. */
  mediaId: string;
  /** Names the viewer for screen readers. */
  title?: string;
  /** The height of the stage (a Tailwind class) when it is not asked to `fill`. */
  heightClass?: string;
  /** The stage fills the height of its parent (the editor's workspace) instead of having a height of its own. */
  fill?: boolean;
  /** Adds a "Close 3D view" button to the toolbar; it is also called when another viewer on the page takes over (only one is live at a time). */
  onClose?: () => void;
  /** Shows the model's file name and size in the stage's label (default). */
  showFileInfo?: boolean;
  /** The model's file when the caller already has it, so the viewer does not look it up again ('missing' when it is gone). Without it the viewer looks it up itself. */
  asset?: ModelAsset;
  /** The hotspots to draw as numbered markers attached to the model (points in model space). The same markers appear in the editor, the preview and the learner app. */
  hotspots?: readonly ViewerHotspot[];
  /** How many hotspots the block has in all (some may not be placed, so have no marker), for the label; default: the number of markers. */
  hotspotTotal?: number;
  /** The chosen hotspot: its marker is highlighted. */
  selectedId?: string | null;
  /** Called with the id of a marker the author taps. */
  onSelectHotspot?: (id: string) => void;
  /** The EDITOR only: while set, the next tap (not a drag) picks the surface point under it and reports it; the toolbar then offers "Place at centre" and Cancel instead of its usual buttons. */
  placing?: Placement | null;
  /** The EDITOR only: lets the viewer find surface points (it keeps the model's triangles in memory for that, which a read-only preview does not). */
  editable?: boolean;
  /** Extra toolbar buttons (the editor's "Add hotspot"); not shown while a spot is being chosen. Built with `ViewerToolButton`. */
  toolbarExtra?: React.ReactNode;
}

/** The stage's colours in the terms the engine takes (red, green, blue from 0 to 1): a deep navy with a soft light behind the middle. */
const BACKGROUND: [number, number, number] = [0.05, 0.07, 0.12];
const STAGE = { center: [0.14, 0.18, 0.29] as [number, number, number], edge: BACKGROUND };
/** The markers' colours in the same terms: gold with a dark rim, a brighter gold with a light ring when chosen. */
const MARKERS = {
  fill: [0.83, 0.69, 0.22] as [number, number, number],
  ring: [0.04, 0.05, 0.09] as [number, number, number],
  ink: [0.04, 0.05, 0.09] as [number, number, number],
  selectedFill: [0.96, 0.84, 0.42] as [number, number, number],
  selectedRing: [0.97, 0.95, 0.9] as [number, number, number],
};
/** How much of the stage (CSS pixels) the label above and the toolbar below cover: the engine frames and centres the model in the space between. */
const TOP_INSET = 44;
const BOTTOM_INSET = 68;

const TOOL = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-40';

/** A button of the stage's toolbar: a line icon and a short name, on the dark bar. `active` is the gold state (a mode that is on). Hover or focus shows `title`, the longer explanation. */
export function ViewerToolButton({
  label,
  icon,
  onClick,
  disabled = false,
  active = false,
  title,
  expanded,
  controls,
}: {
  label: string;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  expanded?: boolean;
  controls?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-expanded={expanded}
      aria-controls={controls}
      className={`${TOOL} ${active ? 'bg-amber-400 text-slate-900 hover:bg-amber-300' : 'text-slate-100 hover:bg-white/10'}`}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

/**
 * The live 3D stage for a GLB model from the Media Library: the real file, drawn by the viewer engine (lib/glb-viewer.ts) on a deep navy backdrop. Drag to rotate, scroll or pinch to zoom,
 * Shift-drag or right-drag to pan, double-click or Reset view to go back to the starting view. It starts when it is shown (not before), shows what it is doing (downloading with a percentage,
 * preparing), says in plain words when it fails and offers Try again where that can help, and frees its graphics, its download and its model when it goes away. Only one viewer is live on a page.
 *
 * ON THE STAGE, and only what is needed: a small label (3D model, its file, the hotspot count) at the top left; a toolbar at the bottom (Reset view, Focus on the chosen hotspot, whatever the
 * editor adds, Help, Close); and, while the editor is choosing a spot, a banner at the top and a gold frame. The engine is told how much those cover and frames the model between them. All the
 * camera work (framing, orientation, lighting) is the engine's; nothing about it is calculated here.
 *
 * HOTSPOTS. Given `hotspots`, it draws their numbered markers on the model (the engine projects them with the camera that draws the model, so they stay on their spot through every rotation,
 * zoom, pan and reset, and a marker behind the model is drawn faint). Tapping a marker calls `onSelectHotspot`. For the editor (`editable` and `placing`), the next TAP picks the surface point
 * under it from the real triangles of the model: a drag only rotates, so rotating the model never places anything by accident, and a tap on an existing marker places nothing either.
 * `placing.onMiss` says why a tap placed nothing.
 *
 * LIFECYCLE. One WebGL viewer per model and per attempt: the effect depends on the model and the attempt only. Everything else the stage is given (the markers, the chosen one, the
 * placement, the callbacks) reaches the running viewer through refs and small effects, so typing in a form beside it never rebuilds the canvas, re-downloads the model or moves the camera.
 */
export default function Model3DViewer({
  mediaId,
  title = '',
  heightClass = 'h-96',
  fill = false,
  onClose,
  showFileInfo = true,
  asset: assetProp,
  hotspots,
  hotspotTotal,
  selectedId = null,
  onSelectHotspot,
  placing = null,
  editable = false,
  toolbarExtra,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<GlbViewerInstance | null>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const placingRef = useRef(placing);
  placingRef.current = placing;
  const selectRef = useRef(onSelectHotspot);
  selectRef.current = onSelectHotspot;
  const helpId = useId();
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [stage, setStage] = useState<'download' | 'prepare'>('download');
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<{ message: string; retry: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  // The file is looked up here only when the caller did not bring it.
  const ownAsset = useModelAsset(showFileInfo && assetProp === undefined ? mediaId : '');
  const asset = assetProp === undefined ? ownAsset : assetProp;

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
        // A tap on a marker that is already there places nothing (it would stack a second hotspot on the same spot).
        if (tap.hotspotId) {
          placement.onMiss('marker');
          return;
        }
        const hit = viewer?.pick(tap.clientX, tap.clientY) ?? null;
        if (hit) placement.onPlace(hit.position);
        else placement.onMiss('surface');
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
        viewer = engine.create(canvas, { background: BACKGROUND, stage: STAGE, reducedMotion: reduced, pickable: editable, markerStyle: MARKERS, onTap, onContextLost: () => fail({ code: 'context-lost' }) });
        viewerRef.current = viewer;
        viewer.setInsets(TOP_INSET, BOTTOM_INSET);
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

  // The help closes when anything else is clicked.
  useEffect(() => {
    if (!helpOpen) return;
    const onDown = (event: PointerEvent) => {
      if (event.target instanceof Node && helpRef.current?.contains(event.target)) return;
      setHelpOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [helpOpen]);

  /** The keyboard-friendly way to place: the surface at the middle of the view. */
  const placeAtCentre = () => {
    const canvas = canvasRef.current;
    if (!canvas || !placing) return;
    const rect = canvas.getBoundingClientRect();
    const hit = viewerRef.current?.pick(rect.left + rect.width / 2, rect.top + rect.height / 2) ?? null;
    if (hit) placing.onPlace(hit.position);
    else placing.onMiss('surface');
  };

  const percent = progress === null ? null : Math.round(progress * 100);
  const status = stage === 'prepare' ? 'Preparing the 3D view…' : percent === null ? 'Downloading the model…' : `Downloading the model… ${percent}%`;
  const markerCount = hotspots ? hotspots.length : 0;
  const total = hotspotTotal ?? markerCount;
  const hasMarkers = markerCount > 0;
  // The hotspot "Focus" applies to: the chosen one, if it is one of the markers.
  const focusId = selectedId && hotspots?.some((h) => h.id === selectedId) ? selectedId : null;
  const fileText = !showFileInfo || !mediaId ? null : asset === 'missing' ? 'file missing' : asset ? `${asset.originalFilename} · ${formatBytes(asset.sizeBytes)}` : null;

  return (
    <div
      className={`relative isolate overflow-hidden bg-[#0d121f] ${fill ? 'h-full min-h-72 w-full' : `rounded-xl border border-slate-700 ${heightClass}`}`}
      onKeyDown={(event) => {
        // Escape closes the help first; the editor's own Escape (stop placing, then close) only sees it when the help is not open.
        if (event.key === 'Escape' && helpOpen) {
          event.preventDefault();
          event.stopPropagation();
          setHelpOpen(false);
        }
      }}
    >
      {/* A new canvas for every attempt: a canvas whose graphics context was released cannot be given a new one. */}
      <canvas
        key={`${mediaId}:${attempt}`}
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label={`${title ? `3D model: ${title}. ` : '3D model. '}Drag to rotate, scroll to zoom. With the keyboard: arrow keys rotate, plus and minus zoom, 0 resets the view.${hasMarkers ? ' Numbered markers show its hotspots; they are also listed next to the model.' : ''}`}
        className={`absolute inset-0 block h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400 ${placing ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
      />

      {/* The label: what this is, the file, how many hotspots. Small, and it never takes a touch. */}
      {(fileText || total > 0) && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)]">
          <p className="inline-flex max-w-full items-center gap-2 rounded-lg bg-slate-900/70 px-2.5 py-1.5 text-[11px] text-slate-200 ring-1 ring-white/10 backdrop-blur-sm">
            <span className="shrink-0 font-semibold uppercase tracking-wider text-amber-300">3D model</span>
            {fileText && <span className="min-w-0 truncate">{fileText}</span>}
            {total > 0 && (
              <span className="shrink-0 text-slate-300">
                {total} {total === 1 ? 'hotspot' : 'hotspots'}
              </span>
            )}
          </p>
        </div>
      )}

      {phase === 'loading' && (
        <div role="status" aria-live="polite" className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-sm text-slate-100">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none" aria-hidden="true" />
          <span>{status}</span>
          {percent !== null && stage === 'download' && (
            <span className="h-1 w-40 overflow-hidden rounded-full bg-white/20" aria-hidden="true">
              <span className="block h-full bg-amber-400" style={{ width: `${percent}%` }} />
            </span>
          )}
        </div>
      )}
      {phase === 'error' && problem && (
        <div role="alert" className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-900/90 p-4 text-center text-sm text-slate-100">
          <p className="max-w-sm">{problem.message}</p>
          {problem.retry && (
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-400">
              Try again
            </button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} className="rounded-lg border border-white/30 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-white/10 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-400">
              Close 3D view
            </button>
          )}
        </div>
      )}

      {/* While a spot is being chosen: a gold frame and a banner that says what to do (or why the last click placed nothing). */}
      {placing && phase === 'ready' && (
        <>
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 ring-2 ring-inset ring-amber-400" />
          <div role="status" aria-live="polite" className="pointer-events-none absolute inset-x-0 top-12 z-10 flex justify-center px-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-3.5 py-1.5 text-xs font-semibold text-slate-900 shadow-lg">
              <Icon name="pin" />
              {placing.message}
            </span>
          </div>
        </>
      )}

      {phase !== 'error' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex flex-col items-center gap-2 px-3">
          {helpOpen && (
            <div ref={helpRef} id={helpId} role="region" aria-label="How to move the model" className="pointer-events-auto w-full max-w-sm rounded-xl bg-slate-900/95 p-3 text-xs text-slate-200 shadow-xl ring-1 ring-white/15">
              <p className="mb-1.5 font-semibold text-white">Moving around the model</p>
              <ul className="space-y-1">
                <li>
                  <span className="font-medium text-amber-300">Drag</span> to rotate
                </li>
                <li>
                  <span className="font-medium text-amber-300">Scroll</span> or pinch to zoom
                </li>
                <li>
                  <span className="font-medium text-amber-300">Shift-drag</span> or right-drag to pan
                </li>
                <li>
                  <span className="font-medium text-amber-300">Double-click</span> to reset the view
                </li>
                <li>
                  <span className="font-medium text-amber-300">Keyboard</span> (with the model focused): arrows rotate, + and − zoom, 0 resets
                </li>
                {editable && (
                  <li>
                    <span className="font-medium text-amber-300">To place a hotspot</span>, choose Add hotspot, then click the surface. Dragging never places anything. Escape stops.
                  </li>
                )}
              </ul>
            </div>
          )}
          <div role="toolbar" aria-label="3D view controls" className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-xl bg-slate-900/85 p-1 shadow-lg ring-1 ring-white/10 backdrop-blur-sm">
            <ViewerToolButton icon="reset" label="Reset view" title="Return to the starting view" onClick={() => viewerRef.current?.reset()} disabled={phase !== 'ready'} />
            {placing ? (
              <>
                <ViewerToolButton icon="pin" label="Place at centre" title="Place the hotspot on the surface at the middle of the view (the keyboard way)" onClick={placeAtCentre} disabled={phase !== 'ready'} />
                <ViewerToolButton icon="close" label="Cancel placing" title="Stop choosing a spot (Escape does the same)" onClick={placing.onCancel} active />
              </>
            ) : (
              <>
                {hasMarkers && (
                  <ViewerToolButton
                    icon="target"
                    label="Focus hotspot"
                    title={focusId ? 'Bring the chosen hotspot into view. Reset view returns.' : 'Choose a hotspot to bring it into view'}
                    onClick={() => focusId && viewerRef.current?.focus(focusId)}
                    disabled={phase !== 'ready' || !focusId}
                  />
                )}
                {toolbarExtra}
              </>
            )}
            <ViewerToolButton icon="help" label="Help" title="How to move the model" onClick={() => setHelpOpen((open) => !open)} expanded={helpOpen} controls={helpOpen ? helpId : undefined} />
            {onClose && <ViewerToolButton icon="close" label="Close 3D view" title="Close the live 3D view" onClick={onClose} />}
          </div>
        </div>
      )}
    </div>
  );
}
