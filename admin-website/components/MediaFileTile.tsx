'use client';

import React, { useEffect, useState } from 'react';
import { formatBytes } from '../lib/image-block';
import { getMedia } from '../lib/media-api';
import { kindLabel } from '../lib/media-kinds';
import type { MediaAsset } from '../lib/types';
import CubeIcon from './CubeIcon';

/**
 * A stand-in for a library file that is not a picture (an MP4 video, a Lottie animation or a GLB 3D model), where a picture would be. The admin tool does not play these
 * files: the learner app does. With a `mediaId` it also names the file; if the file is gone it says so. A 3D model shows a cube; if the chosen file is not a model it says that.
 */
export default function MediaFileTile({ contentType, mediaId, className = '' }: { contentType?: string; mediaId?: string; className?: string }) {
  const [asset, setAsset] = useState<MediaAsset | 'missing' | null>(null);

  useEffect(() => {
    if (!mediaId) return;
    let cancelled = false;
    getMedia(mediaId)
      .then((found) => !cancelled && setAsset(found))
      .catch(() => !cancelled && setAsset('missing'));
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  const known = asset && asset !== 'missing' ? asset : null;
  const type = known?.contentType ?? contentType ?? '';
  const isModel = type === 'model/gltf-binary';
  // The caller said what it expects (for example a model); a different kind of file is reported instead of being shown as if it fitted.
  const wrongKind = Boolean(known && contentType && known.contentType !== contentType);
  return (
    <div className={`flex flex-col items-center justify-center gap-0.5 bg-slate-100 p-3 text-center ${className}`}>
      {isModel ? (
        <span className="text-slate-600">
          <CubeIcon className="h-6 w-6" />
        </span>
      ) : (
        <span aria-hidden="true" className="text-lg text-slate-600">
          {type === 'video/mp4' ? '▶' : '◌'}
        </span>
      )}
      <span className="text-xs font-semibold text-slate-800">{type ? kindLabel(type) : 'File'}</span>
      {asset === 'missing' ? (
        <span className="text-xs text-rose-800">This file is not in the Media Library any more.</span>
      ) : known ? (
        <>
          <span className="text-xs text-slate-700 break-all">
            {known.title?.trim() || known.originalFilename} · {formatBytes(known.sizeBytes)}
          </span>
          {wrongKind && <span className="text-xs font-medium text-rose-800">This is not the kind of file this field needs. Choose another.</span>}
          {isModel && !wrongKind && <span className="text-xs text-emerald-800">A valid 3D model, checked when it was uploaded.</span>}
        </>
      ) : null}
    </div>
  );
}
