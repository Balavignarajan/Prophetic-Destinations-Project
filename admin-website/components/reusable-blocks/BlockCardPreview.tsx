'use client';

import React from 'react';
import { cardPreview } from '../../lib/reusable-library';
import MediaImage from '../MediaImage';
import BlockTypeIcon from './BlockTypeIcon';
import type { BlockContentState } from './useBlockContent';

/**
 * The small preview on a library card: the block's own content in a few lines (an excerpt, a reference, a headline with its first events), its picture as a thumbnail, and a count or two. It is
 * built from the content the card asked for when it came into view (see useBlockContent) and is deliberately light: a picture is a thumbnail, a 3D model is its poster or a plain placeholder (no 3D
 * viewer is started inside a card), and a block that cannot be previewed meaningfully gets a clean fallback instead of invented text.
 */
function Skeleton() {
  return (
    <div aria-hidden="true" className="flex gap-3">
      <div className="h-16 w-16 shrink-0 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
        <div className="h-3 w-full animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
      </div>
    </div>
  );
}

function Fallback({ type, message }: { type: string; message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-slate-700">
      <BlockTypeIcon type={type} className="h-6 w-6 text-slate-500" />
      <p className="text-xs">{message}</p>
    </div>
  );
}

export default function BlockCardPreview({ type, state, bookNames, onRetry }: { type: string; state: BlockContentState; bookNames: Record<string, string>; onRetry: () => void }) {
  if (state.status === 'idle' || state.status === 'loading') return <Skeleton />;
  if (state.status === 'error') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4">
        <p className="text-xs text-slate-700">The preview could not be loaded.</p>
        <button type="button" onClick={onRetry} className="relative z-10 shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
          Try again
        </button>
      </div>
    );
  }

  const preview = cardPreview(type, state.block.sharedContent, bookNames);
  if (!preview) return <Fallback type={type} message="This block has nothing to preview in a card. Open the preview to see it in full." />;

  const hasPicture = Boolean(preview.imageId) || Boolean(preview.placeholder);
  return (
    <div className="flex gap-3">
      {hasPicture && (
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-slate-500" aria-hidden="true">
          {preview.imageId ? (
            <MediaImage mediaId={preview.imageId} alt="" className="h-16 w-16 text-[0px]" />
          ) : (
            <BlockTypeIcon type={preview.placeholder === 'cube' ? 'INTERACTIVE_3D_MODEL' : preview.placeholder === 'video' ? 'MEDIA_ANIMATION' : 'IMAGE'} className="h-7 w-7" />
          )}
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        {preview.eyebrow && <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">{preview.eyebrow}</p>}
        {preview.title && <p className="line-clamp-2 text-sm font-semibold text-slate-900 wrap-break-word">{preview.title}</p>}
        {preview.body && <p className="line-clamp-3 text-xs leading-relaxed text-slate-700 wrap-break-word">{preview.body}</p>}
        {preview.items && preview.items.length > 0 && (
          <ul className="space-y-0.5">
            {preview.items.map((item, index) => (
              <li key={`${index}-${item}`} className="flex gap-1.5 text-xs text-slate-700">
                <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-600" />
                <span className="line-clamp-1 wrap-break-word">{item}</span>
              </li>
            ))}
          </ul>
        )}
        {preview.stats && preview.stats.length > 0 && (
          <p className="flex flex-wrap gap-1.5 pt-0.5">
            {preview.stats.map((stat) => (
              <span key={stat} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                {stat}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
