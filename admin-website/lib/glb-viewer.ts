import { api } from './api';

/**
 * The Admin's side of the GLB 3D viewer: loading the viewer engine, downloading a model from the Media Library, turning failures into plain words, and keeping to ONE live viewer.
 *
 * THE ENGINE is public/glb-viewer.v4.js: a small, dependency-free WebGL viewer that is part of this site (versioned by its file name, served from our own public folder, not from a CDN).
 * The learner app embeds the very same text in its WebView, so a model looks and turns the same way in both (see the header of that file). It only draws the bytes it is given; the model's
 * contents are never inserted into the page as HTML or run as script.
 *
 * THE DOWNLOAD uses the signed-in admin's credentials (the media routes need them) and reads the response as bytes, so a model never needs a public address.
 */
export interface GlbLoadResult {
  triangles: number;
  warnings: string[];
}

/** A point of the model as the engine takes it: model-space coordinates and the numeral to show on its marker. */
export interface ViewerHotspot {
  id: string;
  position: [number, number, number];
  number: number;
}

export interface GlbViewerInstance {
  load(buffer: ArrayBuffer): Promise<GlbLoadResult>;
  reset(): void;
  resize(): void;
  dispose(): void;
  /** The nearest visible surface point under a point of the screen, in model space (only with the `pickable` option), or null. */
  pick(clientX: number, clientY: number): { position: [number, number, number]; distance: number } | null;
  setHotspots(list: readonly ViewerHotspot[]): void;
  setSelected(id: string | null): void;
  /** Frames a hotspot (the camera's target and distance; the viewing direction stays). `offsetY` puts it that many half-heights above the middle of the view, `offsetX` that many half-widths to its right. Reset view returns. */
  focus(id: string, offsetY?: number, offsetX?: number): void;
  /** Brings a hotspot into the free part of the view only if it is not there already (the learner app uses it for the part a panel covers). */
  reveal(id: string, offsetY?: number, offsetX?: number, freeBottom?: number, freeRight?: number): void;
  /** How much of the view (CSS pixels from its top and bottom) a host covers with its own controls; the model is framed in the space between. */
  setInsets(top: number, bottom: number): void;
  /** The axis the model is shown upright on: 'y' (glTF's own) or 'z' (a Z-up file recognised by the engine). */
  upAxis(): 'y' | 'z';
}

export interface GlbTap {
  clientX: number;
  clientY: number;
  /** The marker the tap was on, or null. */
  hotspotId: string | null;
}

export interface GlbViewerOptions {
  background?: [number, number, number];
  reducedMotion?: boolean;
  /** Keep the triangles on the CPU so `pick` works (the editor only). */
  pickable?: boolean;
  markerStyle?: { fill?: [number, number, number]; ring?: [number, number, number]; ink?: [number, number, number]; selectedFill?: [number, number, number]; selectedRing?: [number, number, number] };
  /** Refuse a model with more triangles than this (the engine's own ceiling is 3,000,000). */
  maxTriangles?: number;
  /** Force the model's up axis instead of letting the engine decide (it decides 'z' only for a Z-up file written by the trimesh library). */
  upAxis?: 'y' | 'z';
  /** A soft backdrop behind the model: `center` in the middle fading to `edge`, as [r,g,b] from 0 to 1 (a flat `background` when absent). */
  stage?: { center: [number, number, number]; edge: [number, number, number] };
  onTap?: (tap: GlbTap) => void;
  onFirstInteraction?: () => void;
  onContextLost?: () => void;
}

/** What the editor hands the viewer while the author is choosing a spot on the model. */
export interface Placement {
  /** Shown over the viewer (the instruction, or why the last click did not work). */
  message: string;
  onPlace(position: [number, number, number]): void;
  /** The click placed nothing: it hit no surface ('surface', the default) or it was on a marker that is already there ('marker'). */
  onMiss(reason?: 'surface' | 'marker'): void;
  onCancel(): void;
}

interface GlbViewerApi {
  version: number;
  create(canvas: HTMLCanvasElement, options?: GlbViewerOptions): GlbViewerInstance;
}

declare global {
  interface Window {
    GlbViewer?: GlbViewerApi;
  }
}

const ENGINE_URL = '/glb-viewer.v4.js';

/** A failure with a code the viewer can explain (the engine's own errors carry the same kind of code). */
export function failure(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}

let enginePromise: Promise<GlbViewerApi> | null = null;

/** Loads the engine script once. A failed load is not remembered, so Try again can load it again. */
export function loadGlbEngine(): Promise<GlbViewerApi> {
  if (typeof window === 'undefined') return Promise.reject(failure('script'));
  if (window.GlbViewer) return Promise.resolve(window.GlbViewer);
  enginePromise ??= new Promise<GlbViewerApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = ENGINE_URL;
    script.async = true;
    script.onload = () => (window.GlbViewer ? resolve(window.GlbViewer) : reject(failure('script')));
    script.onerror = () => {
      script.remove();
      reject(failure('script'));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    enginePromise = null;
    throw error;
  });
  return enginePromise;
}

/**
 * The last model downloaded, kept for a minute so that closing one viewer and opening another on the same model (the editor, then the preview) does not download it twice. A stored file
 * never changes, so the bytes of an id never go stale; a model over 32 MB is not kept, and nothing is kept for longer, so the memory is given back.
 */
const KEEP_MS = 60_000;
const KEEP_MAX_BYTES = 32 * 1024 * 1024;
let kept: { id: string; bytes: ArrayBuffer } | null = null;
let keptTimer: ReturnType<typeof setTimeout> | null = null;

function keep(id: string, bytes: ArrayBuffer): void {
  if (bytes.byteLength > KEEP_MAX_BYTES) return;
  kept = { id, bytes };
  if (keptTimer) clearTimeout(keptTimer);
  keptTimer = setTimeout(() => {
    kept = null;
    keptTimer = null;
  }, KEEP_MS);
}

/** The model's bytes from the Media Library, with progress (a fraction, or null when the size is not known). */
export async function fetchModelBytes(mediaId: string, onProgress: (fraction: number | null) => void, signal: AbortSignal): Promise<ArrayBuffer> {
  if (kept && kept.id === mediaId) {
    onProgress(1);
    return kept.bytes;
  }
  const bytes = await download(mediaId, onProgress, signal);
  keep(mediaId, bytes);
  return bytes;
}

async function download(mediaId: string, onProgress: (fraction: number | null) => void, signal: AbortSignal): Promise<ArrayBuffer> {
  let response: Response;
  try {
    response = await api.fetchRaw(`/admin/media/${mediaId}/content`, { signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw failure('network');
  }
  if (!response.ok) throw failure(response.status === 404 ? 'missing' : response.status === 401 || response.status === 403 ? 'forbidden' : 'server');
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) return response.arrayBuffer();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(total > 0 ? Math.min(1, received / total) : null);
  }
  const bytes = new Uint8Array(received);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes.buffer as ArrayBuffer;
}

const FAILURES: Record<string, { message: string; retry: boolean }> = {
  network: { message: 'The model could not be downloaded. Check your connection and try again.', retry: true },
  server: { message: 'The server could not provide the model right now. Try again in a moment.', retry: true },
  script: { message: 'The 3D viewer could not start. Reload the page, or try again.', retry: true },
  'context-lost': { message: 'The 3D view was interrupted by the browser. Try again.', retry: true },
  missing: { message: 'This model is not in the Media Library any more.', retry: false },
  forbidden: { message: 'You do not have permission to view this file.', retry: false },
  invalid: { message: 'This file could not be read as a 3D model.', retry: false },
  unsupported: { message: 'This model uses a feature the viewer cannot show yet, such as Draco, Meshopt or KTX2 compression. Export it again without that compression.', retry: false },
  empty: { message: 'This model has nothing to show.', retry: false },
  'too-large': { message: 'This model is too detailed for the viewer.', retry: false },
  memory: { message: 'This model is too large for this browser to show.', retry: false },
  webgl: { message: 'This browser could not start WebGL, which the 3D viewer needs. Check that hardware acceleration is on.', retry: false },
};

/** What to tell the author about a failed attempt, and whether trying again can help. */
export function describeFailure(error: unknown): { message: string; retry: boolean } {
  const code = (error as { code?: unknown } | null)?.code;
  return (typeof code === 'string' && FAILURES[code]) || FAILURES.script;
}

let releaseActive: (() => void) | null = null;

/**
 * Only one live viewer at a time on the page (each holds a WebGL context and a downloaded model). A viewer calls this when it starts: the viewer that was live is told to let go
 * (its `onRelease` closes it), and the returned function says "I am done". Several models in one lesson therefore never all load at once.
 */
export function claimViewer(onRelease: () => void): () => void {
  releaseActive?.();
  releaseActive = onRelease;
  return () => {
    if (releaseActive === onRelease) releaseActive = null;
  };
}
