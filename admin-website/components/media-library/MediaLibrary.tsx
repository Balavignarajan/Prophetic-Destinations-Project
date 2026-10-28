'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatBytes, friendlyMediaError } from '../../lib/image-block';
import { listMedia } from '../../lib/media-api';
import type { MediaAsset } from '../../lib/types';
import { EmptyState } from '../ui';
import { CATEGORIES, SORTS, SORT_LIMIT, type MediaCategory, type MediaSort, categoryInfo, categoryOf, dateOf, displayName, sortAssets, typeLabel } from './categories';
import Icon from './icons';
import MediaDetailsDrawer from './MediaDetailsDrawer';
import MediaThumb from './MediaThumb';
import MediaUploadDialog from './MediaUploadDialog';

/**
 * The Media Library page (manage mode). The pickers inside lesson and course editors keep using MediaBrowser, which this does not touch.
 *
 * WHAT THE SERVER GIVES. GET /admin/media lists newest first, pages of at most 100, filtered by an exact content type (or `image/*`) and a text search (file name, title, tag), and reports the total of
 * the filtered set. It has no other order. So:
 *   - The tabs are the server's content-type filter, and the number beside each tab is that filter's real total for the current search (five small requests), never a count of what happens to be loaded.
 *   - "Newest first" is the server's own order, loaded a page at a time ("Show more").
 *   - Every other order is worked out over the WHOLE result set: choosing one loads every matching file first (up to SORT_LIMIT; a category or a search narrows the set on the server), then sorts. A set
 *     larger than that stays newest first and the page says so; it is never sorted page by page, and the page never claims an order it did not apply.
 * A new search, tab or reload cancels what is still loading (a response for an older request is ignored), and switching the sort or the view asks the server for nothing the page already has.
 */
const PAGE = 36;
/** The server's largest page (backend ListMediaQueryDto). */
const MAX_PAGE = 100;

type ViewMode = 'grid' | 'list';
type Counts = { query: string; values: Record<MediaCategory, number> };

const PLURAL: Record<MediaCategory, [string, string]> = {
  all: ['file', 'files'],
  images: ['image', 'images'],
  videos: ['video', 'videos'],
  animations: ['animation', 'animations'],
  models: ['3D model', '3D models'],
};

const EMPTY_COPY: Record<Exclude<MediaCategory, 'all'>, { title: string; description: string }> = {
  images: { title: 'No images yet', description: 'Upload a JPG, PNG or WebP image to use it in lessons, covers and Home Entries.' },
  videos: { title: 'No videos yet', description: 'Upload an MP4 video to use it in a Media / Animation block.' },
  animations: { title: 'No animations yet', description: 'Upload a Lottie animation (a .json file) to use it in lessons. Animated WebP images are listed under Images.' },
  models: { title: 'No 3D models yet', description: 'Upload a GLB model to use interactive 3D content in lessons.' },
};

function Tabs({ category, counts, onChange }: { category: MediaCategory; counts: Record<MediaCategory, number> | null; onChange: (category: MediaCategory) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeys = (event: React.KeyboardEvent, index: number) => {
    const count = CATEGORIES.length;
    const next = event.key === 'ArrowRight' ? (index + 1) % count : event.key === 'ArrowLeft' ? (index + count - 1) % count : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(CATEGORIES[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label="Media categories" className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1">
      {CATEGORIES.map((c, index) => {
        const active = c.id === category;
        return (
          <button
            key={c.id}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`media-tab-${c.id}`}
            aria-selected={active}
            aria-controls="media-results"
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(c.id)}
            onKeyDown={(event) => onKeys(event, index)}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium focus:outline-hidden focus-visible:rounded-t-lg focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 ${active ? 'border-amber-600 text-slate-900' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}
          >
            {c.label}
            {counts && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active ? 'bg-amber-100 text-amber-950' : 'bg-slate-100 text-slate-700'}`}>
                <span className="sr-only">, </span>
                {counts[c.id]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Card({ asset, onOpen }: { asset: MediaAsset; onOpen: (asset: MediaAsset) => void }) {
  const name = displayName(asset);
  return (
    <li>
      <button
        type="button"
        data-media-id={asset.id}
        onClick={() => onOpen(asset)}
        aria-label={`Open details of ${name}. ${typeLabel(asset.contentType)}, ${formatBytes(asset.sizeBytes)}, uploaded ${dateOf(asset.createdAt)}`}
        className="group flex h-full w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-xs transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <span className="relative block aspect-4/3 w-full overflow-hidden bg-slate-100">
          <MediaThumb asset={asset} />
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold text-slate-800 shadow-xs ring-1 ring-slate-200">{typeLabel(asset.contentType)}</span>
        </span>
        <span className="flex flex-1 flex-col gap-0.5 p-3">
          <span className="truncate text-sm font-semibold text-slate-900" title={name}>
            {name}
          </span>
          <span className="truncate text-xs text-slate-700">{formatBytes(asset.sizeBytes)}</span>
          <span className="text-xs text-slate-600">{dateOf(asset.createdAt)}</span>
        </span>
      </button>
    </li>
  );
}

const LIST_COLUMNS = 'grid-cols-[3.5rem_minmax(0,1fr)_auto] md:grid-cols-[3.5rem_minmax(0,1fr)_9rem_5.5rem_8rem_1.25rem]';

function Row({ asset, onOpen }: { asset: MediaAsset; onOpen: (asset: MediaAsset) => void }) {
  const name = displayName(asset);
  return (
    <li>
      <button
        type="button"
        data-media-id={asset.id}
        onClick={() => onOpen(asset)}
        aria-label={`Open details of ${name}. ${typeLabel(asset.contentType)}, ${formatBytes(asset.sizeBytes)}, uploaded ${dateOf(asset.createdAt)}`}
        className={`grid w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 text-left shadow-xs transition hover:border-slate-300 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 motion-reduce:transition-none ${LIST_COLUMNS}`}
      >
        <span className="relative block h-14 w-14 overflow-hidden rounded-lg bg-slate-100">
          <MediaThumb asset={asset} compact />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900" title={name}>
            {name}
          </span>
          {asset.title?.trim() && <span className="block truncate text-xs text-slate-600">{asset.originalFilename}</span>}
          <span className="block truncate text-xs text-slate-700 md:hidden">
            {typeLabel(asset.contentType)} · {formatBytes(asset.sizeBytes)} · {dateOf(asset.createdAt)}
          </span>
        </span>
        <span className="hidden text-sm text-slate-800 md:block">{typeLabel(asset.contentType)}</span>
        <span className="hidden text-sm text-slate-800 md:block">{formatBytes(asset.sizeBytes)}</span>
        <span className="hidden text-sm text-slate-800 md:block">{dateOf(asset.createdAt)}</span>
        <span className="flex items-center justify-end gap-1 text-xs font-medium text-amber-900">
          <span className="md:sr-only">Details</span>
          <Icon name="chevron" />
        </span>
      </button>
    </li>
  );
}

export default function MediaLibrary({ canWrite }: { canWrite: boolean }) {
  const searchId = useId();
  const sortId = useId();
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [category, setCategory] = useState<MediaCategory>('all');
  const [sort, setSort] = useState<MediaSort>('newest');
  const [view, setView] = useState<ViewMode>('grid');
  const [reload, setReload] = useState(0);
  const [retry, setRetry] = useState(0);
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortLimited, setSortLimited] = useState(false);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; show?: MediaCategory } | null>(null);
  // Every list request gets a number; an answer for an older number is ignored, also for "Show more".
  const requestId = useRef(0);
  // What the page holds: for which search, tab and reload, and whether it is the WHOLE result set (then any order can be applied without asking the server again).
  const loaded = useRef<{ key: string; set: string; complete: boolean } | null>(null);
  const summary = useRef<HTMLParagraphElement>(null);

  const wantAll = sort !== 'newest';

  // The files of the chosen tab and search: the first page, or (for an order other than newest first) every page up to SORT_LIMIT.
  useEffect(() => {
    const key = `${query}|${category}|${reload}|${retry}`;
    const set = `${query}|${category}`;
    if (loaded.current && loaded.current.key === key && (loaded.current.complete || !wantAll)) return;
    let cancelled = false;
    const mine = ++requestId.current;
    // A different search or tab is a different result set: the old files are not shown under it while the new ones load. A reload of the same set keeps them on screen.
    if (!loaded.current || loaded.current.set !== set) {
      setItems([]);
      setTotal(0);
    }
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const filter = categoryInfo(category).contentType;
        const first = await listMedia(0, wantAll ? MAX_PAGE : PAGE, query, filter);
        if (cancelled || mine !== requestId.current) return;
        let all = first.items;
        let limited = false;
        if (wantAll && first.total > all.length) {
          if (first.total > SORT_LIMIT) limited = true;
          else {
            while (all.length < first.total) {
              const page = await listMedia(all.length, MAX_PAGE, query, filter);
              if (cancelled || mine !== requestId.current) return;
              if (page.items.length === 0) break;
              const seen = new Set(all.map((a) => a.id));
              all = [...all, ...page.items.filter((p) => !seen.has(p.id))];
            }
          }
        }
        setItems(all);
        setTotal(first.total);
        setSortLimited(limited);
        loaded.current = { key, set, complete: all.length >= first.total };
      } catch (e) {
        if (!cancelled && mine === requestId.current) setError(friendlyMediaError(e, 'Could not load the media.'));
      } finally {
        if (!cancelled && mine === requestId.current) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, category, reload, retry, wantAll]);

  // The number beside each tab: the server's own total for that tab and the current search.
  useEffect(() => {
    let cancelled = false;
    Promise.all(CATEGORIES.map((c) => listMedia(0, 1, query, c.contentType)))
      .then((pages) => {
        if (cancelled) return;
        const values = {} as Record<MediaCategory, number>;
        CATEGORIES.forEach((c, index) => {
          values[c.id] = pages[index].total;
        });
        setCounts({ query, values });
      })
      .catch(() => {
        // Not knowing the numbers is better than showing wrong ones: the tabs just have no numbers.
        if (!cancelled) setCounts(null);
      });
    return () => {
      cancelled = true;
    };
  }, [query, reload, retry]);

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
    },
    [],
  );

  const onSearch = (value: string) => {
    setTyped(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setQuery(value.trim()), 300);
  };
  const clearSearch = () => {
    if (debounce.current) clearTimeout(debounce.current);
    setTyped('');
    setQuery('');
  };

  const loadMore = async () => {
    const mine = requestId.current;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await listMedia(items.length, PAGE, query, categoryInfo(category).contentType);
      if (mine !== requestId.current) return; // the search or tab changed meanwhile: these rows belong to the old one
      const merged = [...items, ...page.items.filter((p) => !items.some((c) => c.id === p.id))];
      setItems(merged);
      setTotal(page.total);
      // Once every page has been loaded this way, any order can be applied without asking again.
      if (loaded.current) loaded.current = { ...loaded.current, complete: merged.length >= page.total };
    } catch (e) {
      if (mine === requestId.current) setError(friendlyMediaError(e, 'Could not load more media.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const complete = items.length >= total;
  // The order that is really applied: another order than newest first needs the whole result set; otherwise the server's order stands.
  const applied: MediaSort = sort !== 'newest' && complete && !sortLimited ? sort : 'newest';
  const shown = useMemo(() => sortAssets(items, applied), [items, applied]);
  const tabCounts = counts && counts.query === query ? counts.values : null;
  const [one, many] = PLURAL[category];

  const focusSummary = useCallback(() => summary.current?.focus(), []);

  const handleUploaded = (assets: MediaAsset[]) => {
    setReload((n) => n + 1);
    // When the new files belong to another tab than the one on screen, the message offers to go there; the new files are always the newest.
    const firstCategory = categoryOf(assets[0].contentType);
    const sameKind = assets.every((a) => categoryOf(a.contentType) === firstCategory);
    setNotice({
      text: assets.length === 1 ? `“${displayName(assets[0])}” was added to the library.` : `${assets.length} files were added to the library.`,
      show: firstCategory !== null && sameKind && category !== 'all' && category !== firstCategory ? firstCategory : undefined,
    });
  };

  const handleDeleted = (asset: MediaAsset) => {
    setItems((current) => current.filter((i) => i.id !== asset.id));
    setTotal((t) => Math.max(0, t - 1));
    const own = categoryOf(asset.contentType);
    setCounts((current) =>
      current
        ? {
            ...current,
            values: { ...current.values, all: Math.max(0, current.values.all - 1), ...(own ? { [own]: Math.max(0, current.values[own] - 1) } : {}) },
          }
        : current,
    );
    setSelected(null);
    setNotice({ text: `“${displayName(asset)}” was deleted from the library.` });
  };

  const handleSaved = (next: MediaAsset) => {
    setItems((current) => current.map((i) => (i.id === next.id ? next : i)));
    setSelected(next);
    // A new title or tag can change what a search finds, and the counts: run the current search again (the list stays on screen meanwhile).
    if (query) setReload((n) => n + 1);
  };

  const emptyAction = canWrite ? (
    <button type="button" onClick={() => setUploadOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
      <Icon name="upload" />
      Upload Media
    </button>
  ) : undefined;

  const statusText = error && items.length === 0
    ? 'The media could not be loaded.'
    : loading
      ? items.length > 0 && wantAll
        ? `Loading every file so they can be sorted…`
        : query
          ? `Searching for “${query}”…`
          : 'Loading…'
      : `${total} ${total === 1 ? one : many}${query ? ` matching “${query}”` : ''}`;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-bold text-slate-900">Media Library</h1>
          <p className="mt-0.5 text-sm text-slate-700">Manage images, videos, animations and 3D models used throughout your curriculum.</p>
          <details className="mt-2 text-xs text-slate-700">
            <summary className="inline-flex cursor-pointer items-center gap-1 font-medium text-amber-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
              <Icon name="help" className="h-3.5 w-3.5" />
              How media is used in lessons
            </summary>
            <p className="mt-1.5 max-w-2xl leading-relaxed">
              To put a picture in a lesson, open the lesson and use <strong>Add Image</strong>: you can upload there or pick from this library. Uploading here only adds a file to the library; it never changes a lesson or a course.
            </p>
          </details>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setUploadOpen(true);
            }}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <Icon name="upload" />
            Upload Media
          </button>
        )}
      </header>

      {notice && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">
          <span>{notice.text}</span>
          <span className="flex items-center gap-2">
            {notice.show && (
              <button
                type="button"
                onClick={() => {
                  clearSearch();
                  setCategory(notice.show as MediaCategory);
                  setNotice(null);
                }}
                className="rounded-lg border border-emerald-400 bg-white px-3 py-1 text-sm font-medium hover:bg-emerald-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                Show in {categoryInfo(notice.show).label}
              </button>
            )}
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss this message" className="rounded-lg p-1 hover:bg-emerald-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
              <Icon name="close" />
            </button>
          </span>
        </div>
      )}

      <Tabs category={category} counts={tabCounts} onChange={setCategory} />

      <div role="search" className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-64">
          <label htmlFor={searchId} className="sr-only">
            Search media by file name, title or tag
          </label>
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            id={searchId}
            type="search"
            value={typed}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search media by filename, title or tag..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 placeholder-slate-500 focus:border-amber-600 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 [&::-webkit-search-cancel-button]:hidden"
          />
          {typed && (
            <button type="button" onClick={clearSearch} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
              <Icon name="close" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={sortId} className="text-sm font-medium text-slate-700">
            Sort by
          </label>
          <select
            id={sortId}
            value={sort}
            onChange={(event) => setSort(event.target.value as MediaSort)}
            className="rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm text-slate-900 focus:border-amber-600 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div role="group" aria-label="View" className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5">
          {(['grid', 'list'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={view === mode}
              onClick={() => setView(mode)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${view === mode ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-700 hover:text-slate-900'}`}
            >
              <Icon name={mode === 'grid' ? 'grid' : 'list'} />
              {mode === 'grid' ? 'Grid' : 'List'}
            </button>
          ))}
        </div>
      </div>
      <p className="-mt-2 text-xs text-slate-600">Searches file names, titles and tags. It does not search descriptions, captions, credits or internal notes.</p>

      {category === 'animations' && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          This tab lists Lottie animations. Animated WebP files are stored as WebP images and the library does not record whether a WebP is animated, so they are listed under <strong>Images</strong>.
        </p>
      )}
      {sort !== 'newest' && sortLimited && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          There are {total} files here, more than can be sorted at once ({SORT_LIMIT}), so they stay newest first. Choose a category or search to narrow the list, then sort.
        </p>
      )}

      <div role="tabpanel" id="media-results" aria-labelledby={`media-tab-${category}`} aria-busy={loading} className="space-y-4">
        <p ref={summary} tabIndex={-1} aria-live="polite" className="text-sm text-slate-700 focus:outline-hidden">
          {statusText}
        </p>

        {error && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
            <span>{error}</span>
            <button type="button" onClick={() => setRetry((n) => n + 1)} className="shrink-0 rounded-lg border border-rose-300 bg-white px-3 py-1 text-sm font-medium hover:bg-rose-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
              Try again
            </button>
          </div>
        )}

        {loading && items.length === 0 ? (
          <ul aria-hidden="true" className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-4">
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="aspect-4/3 animate-pulse bg-slate-200/70 motion-reduce:animate-none" />
                <div className="space-y-2 p-3">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200/70 motion-reduce:animate-none" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200/70 motion-reduce:animate-none" />
                </div>
              </li>
            ))}
          </ul>
        ) : items.length === 0 && !error ? (
          query ? (
            <EmptyState
              title="No media matches your search."
              description={`Nothing ${category === 'all' ? 'in the library' : `in ${categoryInfo(category).label}`} has a file name, title or tag containing “${query}”.`}
              action={
                <button type="button" onClick={clearSearch} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                  Clear search
                </button>
              }
            />
          ) : category === 'all' ? (
            <EmptyState title="No media yet" description="Upload images, videos, animations or 3D models to start your library." action={emptyAction} />
          ) : (
            <EmptyState title={EMPTY_COPY[category].title} description={EMPTY_COPY[category].description} action={emptyAction} />
          )
        ) : view === 'grid' ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-4">
            {shown.map((asset) => (
              <Card key={asset.id} asset={asset} onOpen={setSelected} />
            ))}
          </ul>
        ) : (
          <div className="space-y-2">
            <div aria-hidden="true" className={`hidden gap-3 px-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600 md:grid ${LIST_COLUMNS}`}>
              <span>Preview</span>
              <span>Name</span>
              <span>Type</span>
              <span>Size</span>
              <span>Uploaded</span>
              <span />
            </div>
            <ul className="space-y-2">
              {shown.map((asset) => (
                <Row key={asset.id} asset={asset} onOpen={setSelected} />
              ))}
            </ul>
          </div>
        )}

        {!complete && (
          <div className="text-center">
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
              {loadingMore ? 'Loading…' : `Show more (${total - items.length} left)`}
            </button>
          </div>
        )}
      </div>

      {selected && <MediaDetailsDrawer asset={selected} canWrite={canWrite} onClose={() => setSelected(null)} onSaved={handleSaved} onDeleted={handleDeleted} focusFallback={focusSummary} />}

      {uploadOpen && <MediaUploadDialog onClose={() => setUploadOpen(false)} onUploaded={handleUploaded} />}
    </div>
  );
}
