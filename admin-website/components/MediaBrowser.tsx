'use client';

import React, { useEffect, useRef, useState } from 'react';
import { deleteMedia, listMedia } from '../lib/media-api';
import { fileKindLabel, formatBytes, friendlyMediaError } from '../lib/image-block';
import type { MediaAsset } from '../lib/types';
import MediaDetailsPanel from './MediaDetailsPanel';
import MediaFileTile from './MediaFileTile';
import MediaImage from './MediaImage';
import { ConfirmDialog, EmptyState, LoadingSpinner, Modal } from './ui';

const PAGE = 24;
/** The server's largest page (backend ListMediaQueryDto). */
const MAX_PAGE = 100;

interface Props {
  /** `manage`: the Media Library page (preview, delete). `select`: choosing an image for a lesson (click to choose, nothing is deleted). */
  mode: 'manage' | 'select';
  canWrite: boolean;
  /** Change this number to reload the list (for example after an upload). */
  reloadToken?: number;
  /** select mode */
  selectedId?: string | null;
  onSelect?: (asset: MediaAsset) => void;
  /**
   * Only list files of this exact type (pickers for fields that accept one kind of file: animated WebP, MP4 video, Lottie JSON). A picker that does not name one
   * lists images only, so a video or an animation file can never be offered where a picture is needed. The Media Library page (`manage`) lists every file.
   */
  contentType?: 'image/webp' | 'video/mp4' | 'application/json';
}

const dateOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

/**
 * The list of stored images: thumbnails, file name, format, size and upload date, with search by file name. The Media Library
 * page and the image picker in the lesson editor both use it, so they always show the same records.
 */
export default function MediaBrowser({ mode, canWrite, reloadToken = 0, selectedId = null, onSelect, contentType: wanted }: Props) {
  const contentType = wanted ?? (mode === 'select' ? 'image/*' : undefined);
  const noun = wanted === 'video/mp4' ? 'video' : wanted === 'application/json' ? 'animation' : mode === 'manage' ? 'file' : 'image';
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  // Every new first-page request (a changed search, a reload, a retry) gets a number; a response for an older number is ignored, also for "Show more".
  const requestId = useRef(0);
  // After the details of an image were SAVED, the current search is run again so titles/tags changes can change membership. This is separate from
  // a load error: the save itself succeeded.
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);

  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  // The details dialog asks before closing with unsaved changes, and never closes mid-save.
  const detailsDirty = useRef(false);
  const detailsBusy = useRef(false);
  const closeDetails = () => {
    if (detailsBusy.current) return;
    if (detailsDirty.current && !window.confirm('Discard your unsaved changes?')) return;
    detailsDirty.current = false;
    setPreviewAsset(null);
  };
  const [deleteAsset, setDeleteAsset] = useState<MediaAsset | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // First page, again whenever the search, a reload request or a retry changes.
  useEffect(() => {
    let cancelled = false;
    const mine = ++requestId.current;
    (async () => {
      setLoading(true);
      setError(null);
      setRefreshing(false);
      setRefreshFailed(false);
      try {
        const page = await listMedia(0, PAGE, query, contentType);
        if (cancelled || mine !== requestId.current) return;
        setItems(page.items);
        setTotal(page.total);
      } catch (e) {
        if (!cancelled && mine === requestId.current) setError(friendlyMediaError(e, 'Could not load the images.'));
      } finally {
        if (!cancelled && mine === requestId.current) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, reloadToken, retry, contentType]);

  const onSearch = (value: string) => {
    setTyped(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setQuery(value), 300);
  };

  const loadMore = async () => {
    const mine = requestId.current;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await listMedia(items.length, PAGE, query, contentType);
      if (mine !== requestId.current) return; // the search changed meanwhile: these rows belong to the old search
      setItems((current) => [...current, ...page.items.filter((p) => !current.some((c) => c.id === p.id))]);
      setTotal(page.total);
    } catch (e) {
      if (mine === requestId.current) setError(friendlyMediaError(e, 'Could not load more images.'));
    } finally {
      setLoadingMore(false);
    }
  };

  /**
   * Runs the CURRENT server-side search again from the first row, for as many rows as are already loaded (up to the server's page limit), in ONE request,
   * so the refreshed rows replace the old ones as a whole: a refreshed first page is never appended to stale later pages. The search term is kept. The
   * request takes a new number, so an older response can no longer replace this one and this one is dropped if a newer search starts meanwhile. If it fails,
   * the list stays as it is (with the saved item updated in place) and the author is told the list could not refresh; the save is not reported as failed.
   */
  const refreshAfterSave = async (saved: MediaAsset) => {
    const mine = ++requestId.current;
    setRefreshing(true);
    setRefreshFailed(false);
    try {
      const page = await listMedia(0, Math.min(MAX_PAGE, Math.max(PAGE, items.length)), query, contentType);
      if (mine !== requestId.current) return;
      setItems(page.items);
      setTotal(page.total);
      // The open details window follows the refreshed row; if the saved image no longer matches the search it stays open on what was saved.
      const fresh = page.items.find((i) => i.id === saved.id);
      setPreviewAsset((current) => (current && current.id === saved.id ? (fresh ?? saved) : current));
    } catch {
      if (mine === requestId.current) setRefreshFailed(true);
    } finally {
      if (mine === requestId.current) {
        setRefreshing(false);
        setLoading(false);
      }
    }
  };

  const confirmDelete = async () => {
    if (!deleteAsset) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteMedia(deleteAsset.id);
      setItems((current) => current.filter((i) => i.id !== deleteAsset.id));
      setTotal((t) => Math.max(0, t - 1));
      if (previewAsset?.id === deleteAsset.id) setPreviewAsset(null);
      setDeleteAsset(null);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) {
        // Already gone (deleted elsewhere): the list should agree.
        setItems((current) => current.filter((i) => i.id !== deleteAsset.id));
        setDeleteAsset(null);
      } else {
        setDeleteError(friendlyMediaError(e, 'Could not delete this image.'));
      }
    } finally {
      setDeleting(false);
    }
  };

  const selected = mode === 'select' ? items.find((i) => i.id === selectedId) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full sm:max-w-sm">
          <label htmlFor={`media-search-${mode}`} className="sr-only">
            Search images by file name, title or tag
          </label>
          <input
            id={`media-search-${mode}`}
            type="search"
            value={typed}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search by file name, title or tag" aria-describedby={`media-search-help-${mode}`}
            className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600"
          />
        </div>
        <p id={`media-search-help-${mode}`} className="w-full text-xs text-slate-700 order-last sm:order-none">
          Searches the file name, the title and the tags. It does not search descriptions, captions, credits or internal notes.
        </p>
        <p className="text-sm text-slate-700" aria-live="polite">
          {loading ? (query ? `Searching for “${query}”…` : 'Loading…') : refreshing ? 'Updating the list…' : error && items.length === 0 ? 'The search could not be completed.' : `${total} ${total === 1 ? noun : `${noun}s`}${query ? ` matching “${query}”` : ''}`}
        </p>
      </div>

      {refreshFailed && (
        <div role="alert" className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-sm text-amber-950 flex items-center justify-between gap-3">
          <span>The details were saved, but the list could not be refreshed, so it may not match your search yet.</span>
          <button type="button" onClick={() => setRetry((n) => n + 1)} className="shrink-0 px-3 py-1 text-sm font-medium bg-white border border-amber-300 rounded-lg hover:bg-amber-100">
            Refresh the list
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => setRetry((n) => n + 1)} className="shrink-0 px-3 py-1 text-sm font-medium bg-white border border-rose-300 rounded-lg hover:bg-rose-100">
            Try again
          </button>
        </div>
      )}

      {loading && items.length === 0 ? (
        <LoadingSpinner text="Loading images…" />
      ) : items.length === 0 && !error ? (
        <EmptyState
          title={query ? 'No images match' : 'No images yet'}
          description={query ? 'No file name, title or tag contains that text. Clear the search to see every image.' : 'Upload a PNG, JPEG or WEBP image to start the library.'}
        />
      ) : (
        <ul className={`grid gap-4 ${mode === 'select' ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
          {items.map((asset) => {
            const isSelected = mode === 'select' && asset.id === selectedId;
            return (
              <li key={asset.id} className={`bg-white border rounded-xl overflow-hidden flex flex-col ${isSelected ? 'border-amber-600 ring-2 ring-amber-500' : 'border-slate-200'}`}>
                <button
                  type="button"
                  onClick={() => (mode === 'select' ? onSelect?.(asset) : setPreviewAsset(asset))}
                  aria-label={mode === 'select' ? `Choose ${asset.originalFilename}` : `Details of ${asset.originalFilename}`}
                  aria-pressed={mode === 'select' ? isSelected : undefined}
                  className="block h-36 w-full bg-slate-100 overflow-hidden focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500"
                >
                  {asset.contentType.startsWith('image/') ? <MediaImage mediaId={asset.id} alt="" className="h-full w-full" /> : <MediaFileTile contentType={asset.contentType} className="h-full w-full" />}
                </button>
                <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 break-all">{asset.title?.trim() || asset.originalFilename}</p>
                    {asset.title?.trim() && <p className="text-xs text-slate-600 break-all">{asset.originalFilename}</p>}
                    <p className="text-xs text-slate-700 mt-0.5">
                      {fileKindLabel(asset.contentType)} · {formatBytes(asset.sizeBytes)} · {dateOf(asset.createdAt)}
                    </p>
                  </div>
                  {mode === 'manage' && (
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <button type="button" onClick={() => setPreviewAsset(asset)} className="text-sm font-medium text-amber-900 underline min-h-6" aria-label={`Details and where ${asset.originalFilename} is used`}>
                        Details and usage
                      </button>
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteAsset(asset);
                          }}
                          className="text-sm font-medium text-rose-700 hover:text-rose-900 underline min-h-6"
                          aria-label={`Delete ${asset.originalFilename}`}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                  {mode === 'select' && isSelected && <p className="text-xs font-semibold text-amber-900 pt-2 border-t border-slate-100">Selected</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {items.length < total && (
        <div className="text-center">
          <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="px-4 py-2 text-sm font-medium bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-60">
            {loadingMore ? 'Loading…' : `Show more (${total - items.length} left)`}
          </button>
        </div>
      )}

      {selected && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-slate-900">
          <p className="font-semibold">Selected: {selected.originalFilename}</p>
          <p className="text-xs text-slate-700">
            {fileKindLabel(selected.contentType)} · {formatBytes(selected.sizeBytes)} · uploaded {dateOf(selected.createdAt)}
          </p>
        </div>
      )}

      <Modal isOpen={Boolean(previewAsset)} onClose={closeDetails} title={previewAsset?.title?.trim() || previewAsset?.originalFilename || 'Image'} maxWidth="2xl">
        {previewAsset && (
          <div className="space-y-4">
            <MediaDetailsPanel
              key={previewAsset.id}
              asset={previewAsset}
              canWrite={canWrite}
              dirtyRef={detailsDirty}
              busyRef={detailsBusy}
              onSaved={(next) => {
                setItems((current) => current.map((i) => (i.id === next.id ? next : i)));
                setPreviewAsset(next);
                void refreshAfterSave(next);
              }}
            />
            <div className="flex justify-end">
              <button type="button" onClick={closeDetails} className="px-4 py-2 text-sm font-medium bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteAsset)}
        onClose={() => !deleting && setDeleteAsset(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete this image?"
        message={
          deleteError
            ? deleteError
            : `“${deleteAsset?.originalFilename ?? ''}” will be permanently deleted from storage. An image that a lesson or course still uses cannot be deleted: open "Details and usage" to see where, and change it there first.`
        }
        confirmLabel="Delete image"
        isDestructive
        isLoading={deleting}
      />
    </div>
  );
}
