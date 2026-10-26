'use client';

import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

type State = { id: string; url: string | null; failed: boolean } | null;

/**
 * An image from the media library. The media routes need a signed-in admin, so the bytes are fetched with the admin's
 * credentials and shown from a temporary local URL (an <img src> pointing at the API would be refused). A deleted or
 * unavailable asset shows a short message instead of a broken picture.
 */
export default function MediaImage({ mediaId, alt, className = '', fit = 'cover', onStatus, onNaturalSize }: { mediaId: string; alt: string; className?: string; fit?: 'cover' | 'contain'; onStatus?: (status: 'loading' | 'ready' | 'failed') => void; onNaturalSize?: (size: { width: number; height: number }) => void }) {
  const [state, setState] = useState<State>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const res = await api.fetchRaw(`/admin/media/${mediaId}/content`);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ id: mediaId, url: objectUrl, failed: false });
      } catch {
        if (!cancelled) setState({ id: mediaId, url: null, failed: true });
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId]);

  const current = state && state.id === mediaId ? state : null;
  const status = !current ? 'loading' : current.failed || !current.url ? 'failed' : 'ready';
  useEffect(() => {
    onStatus?.(status);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!current) {
    return (
      <div role="status" className={`flex items-center justify-center bg-slate-100 text-xs text-slate-600 ${className}`}>
        Loading image…
      </div>
    );
  }
  if (current.failed || !current.url) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 p-3 text-center text-xs text-slate-700 ${className}`}>
        This image is not available. It may have been deleted from the Media Library.
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current.url}
      alt={alt}
      className={`${className} ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
      onLoad={onNaturalSize ? (e) => onNaturalSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight }) : undefined}
    />
  );
}
