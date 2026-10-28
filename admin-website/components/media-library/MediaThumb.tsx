'use client';

import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { MediaAsset } from '../../lib/types';
import MediaImage from '../MediaImage';
import { typeLabel } from './categories';
import Icon, { iconForType } from './icons';

/**
 * The small picture of a file in the library (cards and rows). Pictures are fetched through the Media Library with the administrator's credentials, and ONLY when they come near the screen,
 * so a long library does not download every file at once. Videos, Lottie animations and 3D models are never played or started here: they get a clear stand-in with an icon and the name of the
 * kind (so the kind never rests on colour alone). Every WebP is drawn as its first frame, so an animated one does not play in a gallery.
 */

/** Mounts its children only once it is near the viewport (and keeps them). Without IntersectionObserver the children are mounted at once. */
function LazyMount({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || near) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);
  return (
    <span ref={ref} className="absolute inset-0 block">
      {near ? children : fallback}
    </span>
  );
}

const Skeleton = () => <span aria-hidden="true" className="absolute inset-0 block animate-pulse bg-slate-200/70 motion-reduce:animate-none" />;

/** A stand-in for a file that has no picture: the icon of its kind, its name, and (for video) a play mark. */
export function KindTile({ contentType, compact = false }: { contentType: string; compact?: boolean }) {
  const isVideo = contentType === 'video/mp4';
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-linear-to-br from-slate-100 to-slate-200 text-slate-600">
      <span className={`flex items-center justify-center rounded-full bg-white/80 shadow-xs ring-1 ring-slate-300 ${compact ? 'h-7 w-7' : 'h-12 w-12'}`}>
        {isVideo ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" className={compact ? 'h-3.5 w-3.5' : 'h-6 w-6'} fill="currentColor">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        ) : (
          <Icon name={iconForType(contentType)} className={compact ? 'h-3.5 w-3.5' : 'h-6 w-6'} />
        )}
      </span>
      {!compact && <span className="text-xs font-semibold text-slate-700">{typeLabel(contentType)}</span>}
    </span>
  );
}

const Unavailable = ({ compact }: { compact: boolean }) => (
  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-100 text-center text-slate-600">
    <Icon name="image" className={compact ? 'h-4 w-4' : 'h-6 w-6'} />
    {!compact && <span className="text-xs">Preview not available</span>}
  </span>
);

/** The first frame of a WebP, drawn on a canvas, so a still or an animated WebP looks the same in a gallery and never plays there. Falls back to the plain picture if the browser cannot do this. */
function StillWebp({ asset, compact }: { asset: MediaAsset; compact: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed' | 'plain'>('loading');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.fetchRaw(`/admin/media/${asset.id}/content`);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        if (typeof createImageBitmap !== 'function') {
          setState('plain');
          return;
        }
        const bitmap = await createImageBitmap(blob);
        const target = canvas.current;
        if (cancelled || !target) {
          bitmap.close();
          return;
        }
        const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
        target.width = Math.max(1, Math.round(bitmap.width * scale));
        target.height = Math.max(1, Math.round(bitmap.height * scale));
        target.getContext('2d')?.drawImage(bitmap, 0, 0, target.width, target.height);
        bitmap.close();
        setState('ready');
      } catch {
        if (!cancelled) setState('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset.id]);
  if (state === 'plain') return <PlainImage asset={asset} compact={compact} />;
  return (
    <>
      <canvas ref={canvas} aria-hidden="true" className={`absolute inset-0 h-full w-full object-contain ${state === 'ready' ? '' : 'invisible'}`} />
      {state === 'loading' && <Skeleton />}
      {state === 'failed' && <Unavailable compact={compact} />}
    </>
  );
}

function PlainImage({ asset, compact }: { asset: MediaAsset; compact: boolean }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  return (
    <>
      <span className={`absolute inset-0 block ${status === 'ready' ? '' : 'invisible'}`} aria-hidden="true">
        <MediaImage mediaId={asset.id} alt="" fit="contain" className="block h-full w-full text-[0px]" onStatus={setStatus} />
      </span>
      {status === 'loading' && <Skeleton />}
      {status === 'failed' && <Unavailable compact={compact} />}
    </>
  );
}

/** Fills the (positioned) box it is in with the picture or stand-in for this file. */
export default function MediaThumb({ asset, compact = false }: { asset: MediaAsset; compact?: boolean }) {
  if (!asset.contentType.startsWith('image/')) return <KindTile contentType={asset.contentType} compact={compact} />;
  return (
    <LazyMount fallback={<Skeleton />}>{asset.contentType === 'image/webp' ? <StillWebp asset={asset} compact={compact} /> : <PlainImage asset={asset} compact={compact} />}</LazyMount>
  );
}
