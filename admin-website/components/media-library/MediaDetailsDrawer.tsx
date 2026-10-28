'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { formatBytes, friendlyMediaError } from '../../lib/image-block';
import { deleteMedia } from '../../lib/media-api';
import type { MediaAsset } from '../../lib/types';
import MediaDetailsPanel, { UsageSection, type UsageStatus } from '../MediaDetailsPanel';
import MediaImage from '../MediaImage';
import Model3DViewer from '../Model3DViewer';
import { ConfirmDialog, Modal } from '../ui';
import { copyText, downloadOriginal } from './actions';
import { displayName, nounOf, typeLabel } from './categories';
import Icon from './icons';
import { KindTile } from './MediaThumb';

/**
 * "Media Details": the right-hand drawer of the Media Library page. From the top: the file (a picture, or a stand-in with what can safely be done with it), its real facts, copy and download
 * actions, WHERE IT IS USED (asked of the server; a failed check is never read as "not used"), Delete (offered only once the server has confirmed the file is unused, and the server checks again
 * when it is deleted), and the editable details (title, alternative text, caption, source, rights notes, tags: the existing panel). Only what the library really knows is shown: nothing is invented.
 *
 * Escape and the close button close it (asking first if there are unsaved details), Tab stays inside it, and focus goes back to where it was opened. The 3D viewer is the Admin's existing one,
 * started only when "View in 3D" is pressed. A video is downloaded only when "Load video preview" is pressed. Nothing plays by itself.
 */
function VideoPreview({ asset, onMeta }: { asset: MediaAsset; onMeta: (meta: { duration: number; width: number; height: number }) => void }) {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (state !== 'loading') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.fetchRaw(`/admin/media/${asset.id}/content`);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        setSrc(URL.createObjectURL(blob));
        setState('ready');
      } catch {
        if (!cancelled) setState('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, asset.id]);
  // The temporary local copy is released when the video is left, replaced or the drawer closes.
  useEffect(() => {
    if (!src) return;
    return () => URL.revokeObjectURL(src);
  }, [src]);

  if (state === 'ready' && src) {
    return (
      <video
        src={src}
        controls
        preload="metadata"
        playsInline
        aria-label={`Preview of ${displayName(asset)}`}
        className="block max-h-80 w-full rounded-xl bg-slate-900"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          onMeta({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
        }}
      />
    );
  }
  return (
    <div className="relative h-52 overflow-hidden rounded-xl border border-slate-200">
      <KindTile contentType={asset.contentType} />
      <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-1 px-4 text-center">
        <button
          type="button"
          onClick={() => setState('loading')}
          disabled={state === 'loading'}
          aria-busy={state === 'loading'}
          className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          {state === 'loading' ? 'Loading video…' : state === 'failed' ? 'Try loading the video again' : 'Load video preview'}
        </button>
        <p className={`text-xs ${state === 'failed' ? 'font-medium text-rose-800' : 'text-slate-700'}`} role={state === 'failed' ? 'alert' : undefined}>
          {state === 'failed' ? 'The video could not be loaded.' : 'Downloads the file to preview it here. It does not play on its own.'}
        </p>
      </div>
    </div>
  );
}

function Preview({ asset, onSize, onDuration, onView3d }: { asset: MediaAsset; onSize: (size: { width: number; height: number }) => void; onDuration: (seconds: number) => void; onView3d: () => void }) {
  if (asset.contentType.startsWith('image/')) {
    return (
      <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-2">
        <MediaImage mediaId={asset.id} alt={asset.altText?.trim() || displayName(asset)} fit="contain" className="max-h-80 max-w-full" onNaturalSize={onSize} />
      </div>
    );
  }
  if (asset.contentType === 'video/mp4') {
    return (
      <VideoPreview
        asset={asset}
        onMeta={(meta) => {
          if (Number.isFinite(meta.duration)) onDuration(meta.duration);
          if (meta.width > 0 && meta.height > 0) onSize({ width: meta.width, height: meta.height });
        }}
      />
    );
  }
  if (asset.contentType === 'model/gltf-binary') {
    return (
      <div className="relative h-52 overflow-hidden rounded-xl border border-slate-200">
        <KindTile contentType={asset.contentType} />
        <div className="absolute inset-x-0 bottom-3 flex justify-center">
          <button type="button" onClick={onView3d} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            <Icon name="cube" />
            View in 3D
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="relative h-52 overflow-hidden rounded-xl border border-slate-200">
      <KindTile contentType={asset.contentType} />
      {asset.contentType === 'application/json' && <p className="absolute inset-x-0 bottom-3 px-4 text-center text-xs text-slate-700">Lottie animations are played by the mobile app. See one in a lesson with Preview Lesson.</p>}
    </div>
  );
}

const durationText = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const ACTION = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

export default function MediaDetailsDrawer({
  asset,
  canWrite,
  onClose,
  onSaved,
  onDeleted,
  focusFallback,
}: {
  asset: MediaAsset;
  canWrite: boolean;
  onClose: () => void;
  /** The details were saved: the library updates its list. */
  onSaved: (asset: MediaAsset) => void;
  /** The server deleted the file (or it was already gone): the library removes it and closes the drawer. */
  onDeleted: (asset: MediaAsset) => void;
  /** Where focus goes when the control that opened the drawer no longer exists (the file was deleted). */
  focusFallback: () => void;
}) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dirty = useRef(false);
  const busy = useRef(false);
  const nested = useRef(false);
  const mounted = useRef(true);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const fallbackRef = useRef(focusFallback);
  fallbackRef.current = focusFallback;

  const [entered, setEntered] = useState(false);
  const [usage, setUsage] = useState<UsageStatus>('loading');
  const [usageKey, setUsageKey] = useState(0);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [view3d, setView3d] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  const [downloading, setDownloading] = useState(false);

  const noun = nounOf(asset.contentType);
  const name = displayName(asset);
  const isModel = asset.contentType === 'model/gltf-binary';
  nested.current = confirming || view3d;

  const deletingRef = useRef(false);
  deletingRef.current = deleting;
  // Stable on purpose: the effect below holds the keyboard handling and the focus bookkeeping, and must run once per opening, not once per change of state.
  const requestClose = useCallback(() => {
    if (busy.current || deletingRef.current) return;
    if (dirty.current && !window.confirm('Discard your unsaved changes?')) return;
    dirty.current = false;
    onCloseRef.current();
  }, []);

  useEffect(() => {
    mounted.current = true;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      setEntered(true);
      closeButton.current?.focus();
    });
    const onKey = (event: KeyboardEvent) => {
      // The confirmation and the 3D window above the drawer have their own Escape and Tab; the drawer leaves those keys to them.
      if (nested.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      mounted.current = false;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
      // Focus goes back to the card or row that opened the drawer; if that no longer exists (the file was deleted) to the results.
      if (opener && opener.isConnected) opener.focus();
      else fallbackRef.current();
    };
  }, [requestClose]);

  const say = (text: string, ok = true) => setFeedback({ text, ok });

  const copy = async (text: string, what: string) => {
    const ok = await copyText(text);
    say(ok ? `${what} copied.` : `Could not copy the ${what.toLowerCase()}. Select it and copy it yourself.`, ok);
  };

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    setFeedback(null);
    try {
      await downloadOriginal(asset);
      if (mounted.current) say('Download started.');
    } catch {
      if (mounted.current) say('The file could not be downloaded.', false);
    } finally {
      if (mounted.current) setDownloading(false);
    }
  };

  const confirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteMedia(asset.id);
      onDeleted(asset);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) {
        // Already gone (deleted elsewhere): the list should agree.
        onDeleted(asset);
        return;
      }
      if (!mounted.current) return;
      // The file stays in the library, exactly as it was. The server may have refused because it is in use: the usage is asked again.
      setDeleteError(friendlyMediaError(e, 'Could not delete this file.'));
      setConfirming(false);
      setUsageKey((n) => n + 1);
    } finally {
      if (mounted.current) setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-900/50" onClick={requestClose} aria-hidden="true" />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 motion-reduce:transition-none ${entered ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">{typeLabel(asset.contentType)}</p>
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              Media Details
            </h2>
          </div>
          <button ref={closeButton} type="button" onClick={requestClose} aria-label="Close media details" title="Close (Escape)" className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <Preview asset={asset} onSize={setSize} onDuration={setDuration} onView3d={() => setView3d(true)} />

          <section aria-label="File information" className="space-y-3">
            <h3 className="wrap-break-word text-base font-semibold text-slate-900">{name}</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <dt className="font-semibold text-slate-800">File name</dt>
              <dd className="break-all text-slate-900">{asset.originalFilename}</dd>
              <dt className="font-semibold text-slate-800">Type</dt>
              <dd className="text-slate-900">{typeLabel(asset.contentType)}</dd>
              <dt className="font-semibold text-slate-800">Size</dt>
              <dd className="text-slate-900">{formatBytes(asset.sizeBytes)}</dd>
              <dt className="font-semibold text-slate-800">Uploaded</dt>
              <dd className="text-slate-900">{new Date(asset.createdAt).toLocaleString()}</dd>
              {asset.title?.trim() && (
                <>
                  <dt className="font-semibold text-slate-800">Title</dt>
                  <dd className="wrap-break-word text-slate-900">{asset.title.trim()}</dd>
                </>
              )}
              {asset.tags && asset.tags.length > 0 && (
                <>
                  <dt className="font-semibold text-slate-800">Tags</dt>
                  <dd className="flex flex-wrap gap-1">
                    {asset.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-800">
                        {tag}
                      </span>
                    ))}
                  </dd>
                </>
              )}
              {size && (
                <>
                  <dt className="font-semibold text-slate-800">Dimensions</dt>
                  <dd className="text-slate-900">
                    {size.width} × {size.height} px
                  </dd>
                </>
              )}
              {duration !== null && (
                <>
                  <dt className="font-semibold text-slate-800">Duration</dt>
                  <dd className="text-slate-900">{durationText(duration)}</dd>
                </>
              )}
              <dt className="font-semibold text-slate-800">Media ID</dt>
              <dd className="break-all font-mono text-xs text-slate-900">{asset.id}</dd>
            </dl>
            {asset.contentType === 'image/webp' && <p className="text-xs text-slate-700">A WebP file can be a still picture or an animation. The library does not record which, so it is listed under Images.</p>}
            {(size === null || duration === null) && asset.contentType === 'video/mp4' && <p className="text-xs text-slate-700">Dimensions and duration appear once the video preview is loaded.</p>}
          </section>

          <section aria-label="Actions" className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <button type="button" className={ACTION} onClick={() => void copy(asset.originalFilename, 'File name')}>
                <Icon name="copy" />
                Copy file name
              </button>
              <button type="button" className={ACTION} onClick={() => void copy(asset.id, 'Media ID')}>
                <Icon name="copy" />
                Copy media ID
              </button>
              <button type="button" className={ACTION} onClick={() => void download()} disabled={downloading} aria-busy={downloading}>
                <Icon name="download" />
                {downloading ? 'Downloading…' : 'Download original'}
              </button>
              {isModel && (
                <button type="button" className={ACTION} onClick={() => setView3d(true)}>
                  <Icon name="cube" />
                  View in 3D
                </button>
              )}
            </div>
            <p role="status" aria-live="polite" className={`min-h-4 text-xs ${feedback && !feedback.ok ? 'font-medium text-rose-800' : 'text-emerald-900'}`}>
              {feedback?.text ?? ''}
            </p>
          </section>

          <section aria-labelledby={`${titleId}-used`} className="space-y-3">
            <h3 id={`${titleId}-used`} className="text-base font-semibold text-slate-900">
              Used in
            </h3>
            <UsageSection key={usageKey} asset={asset} noun={noun} onStatus={setUsage} />
          </section>

          {canWrite && (
            <section aria-labelledby={`${titleId}-delete`} className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/50 p-4">
              <h3 id={`${titleId}-delete`} className="text-base font-semibold text-slate-900">
                Delete
              </h3>
              {deleteError && (
                <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
                  {deleteError} The file is still in your library.
                </p>
              )}
              <p className="text-sm text-slate-800">
                {usage === 'unused'
                  ? `This ${noun} is not used in any content, so it can be deleted. This cannot be undone.`
                  : usage === 'used'
                    ? `This ${noun} is currently used, so it cannot be deleted. Remove it from the places listed above first. Nothing is removed for you.`
                    : usage === 'error'
                      ? 'Delete is unavailable until the usage check works. Try the check again above.'
                      : 'Checking where this file is used before Delete is offered…'}
              </p>
              <button
                type="button"
                disabled={usage !== 'unused' || deleting}
                onClick={() => {
                  setDeleteError(null);
                  setConfirming(true);
                }}
                className="rounded-lg border border-rose-300 bg-white px-3.5 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-50 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                Delete media
              </button>
            </section>
          )}

          <MediaDetailsPanel key={asset.id} asset={asset} canWrite={canWrite} dirtyRef={dirty} busyRef={busy} onSaved={onSaved} showPreview={false} showFacts={false} showUsage={false} />
        </div>
      </aside>

      <ConfirmDialog
        isOpen={confirming}
        onClose={() => !deleting && setConfirming(false)}
        onConfirm={() => void confirmDelete()}
        title="Delete this media file?"
        message="This permanently removes the file from your Media Library."
        confirmLabel="Delete Media"
        isDestructive
        isLoading={deleting}
      />

      <Modal isOpen={view3d} onClose={() => setView3d(false)} title={name} description="A live preview of the model. It is loaded only while this window is open." maxWidth="4xl">
        {view3d && (
          <div className="space-y-4">
            <Model3DViewer mediaId={asset.id} title={name} heightClass="h-[55vh]" />
            <div className="flex justify-end">
              <button type="button" onClick={() => setView3d(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
