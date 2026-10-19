import { api } from './api';
import type { MediaAsset } from './types';

export interface MediaPage {
  items: MediaAsset[];
  total: number;
  limit: number;
  offset: number;
}

/** One page of the media library, optionally filtered by part of the file name. */
export function listMedia(offset: number, limit: number, search: string): Promise<MediaPage> {
  const q = search.trim() ? `&q=${encodeURIComponent(search.trim())}` : '';
  return api.request<MediaPage>(`/admin/media?limit=${limit}&offset=${offset}${q}`);
}

/**
 * The ONE upload path: the Media Library page and the lesson editor both call this, so every image becomes the same kind of
 * media asset record in the same storage, whichever screen it was added from.
 */
export function uploadMedia(file: File): Promise<MediaAsset> {
  const body = new FormData();
  body.append('file', file);
  return api.request<MediaAsset>('/admin/media', { method: 'POST', body });
}

export function deleteMedia(id: string): Promise<unknown> {
  return api.request(`/admin/media/${id}`, { method: 'DELETE' });
}
