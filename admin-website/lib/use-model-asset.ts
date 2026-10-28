import { useEffect, useState } from 'react';
import { formatBytes } from './image-block';
import { getMedia } from './media-api';
import { GLB_CONTENT_TYPE } from './model-3d';
import type { MediaAsset } from './types';

/** The chosen model file: loaded from the Media Library; null while it loads (or when no file is chosen), 'missing' when it is gone. */
export type ModelAsset = MediaAsset | 'missing' | null;

/**
 * Looks the chosen model file up in the Media Library once per id, for the editor's header, the Model panel, the viewer's file label and the read-only preview. A result that belongs to an
 * earlier id is never returned for a later one, so switching models never shows the old file's name.
 */
export function useModelAsset(mediaId: string): ModelAsset {
  const [asset, setAsset] = useState<{ id: string; value: MediaAsset | 'missing' } | null>(null);
  useEffect(() => {
    if (!mediaId) return;
    let cancelled = false;
    getMedia(mediaId)
      .then((found) => !cancelled && setAsset({ id: mediaId, value: found }))
      .catch(() => !cancelled && setAsset({ id: mediaId, value: 'missing' }));
    return () => {
      cancelled = true;
    };
  }, [mediaId]);
  return mediaId && asset && asset.id === mediaId ? asset.value : null;
}

/** How a model file is described to the author: one line, and whether it is a problem (a missing file, or a file that is not a GLB model). */
export function describeModelFile(mediaId: string, asset: ModelAsset): { text: string; problem: boolean } {
  if (!mediaId) return { text: 'No model chosen yet', problem: false };
  if (asset === null) return { text: 'Checking the model file…', problem: false };
  if (asset === 'missing') return { text: 'The model file is not in the Media Library any more.', problem: true };
  if (asset.contentType !== GLB_CONTENT_TYPE) return { text: `${asset.originalFilename} is not a 3D model. Choose a GLB model.`, problem: true };
  return { text: `${asset.originalFilename} · ${formatBytes(asset.sizeBytes)}`, problem: false };
}
