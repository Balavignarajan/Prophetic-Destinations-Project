import { kindLabel } from '../../lib/media-kinds';
import type { MediaAsset } from '../../lib/types';

/**
 * How the Media Library page groups and orders what the server returns. Everything here works from the metadata the library really has: the stored content type, the size and the upload time.
 *
 * CATEGORIES. The server stores one content type per file, decided from the file's own bytes:
 *   Images      image/png, image/jpeg, image/webp (and any other image type the server was set up to accept)  -> the `image/*` filter
 *   Videos      video/mp4
 *   Animations  application/json (a Lottie animation: the only JSON the server accepts, and only after it has verified it)
 *   3D Models   model/gltf-binary (GLB)
 *
 * KNOWN LIMITATION: a still WebP and an ANIMATED WebP are both stored as `image/webp`, the library keeps no "animated" flag, and the file cannot be inspected without downloading it (the content
 * route has no byte ranges). The page does not guess from file names or sizes. So every WebP is listed under Images, and the Animations tab lists Lottie animations and says where animated WebP
 * files are. Telling them apart for real needs the server to record it when the file is uploaded (a backend change), which this screen does not invent.
 */
export type MediaCategory = 'all' | 'images' | 'videos' | 'animations' | 'models';

export interface CategoryInfo {
  id: MediaCategory;
  label: string;
  /** The server's `contentType` filter for this tab; none means every file. */
  contentType?: string;
}

export const CATEGORIES: readonly CategoryInfo[] = [
  { id: 'all', label: 'All' },
  { id: 'images', label: 'Images', contentType: 'image/*' },
  { id: 'videos', label: 'Videos', contentType: 'video/mp4' },
  { id: 'animations', label: 'Animations', contentType: 'application/json' },
  { id: 'models', label: '3D Models', contentType: 'model/gltf-binary' },
];

export const categoryInfo = (id: MediaCategory): CategoryInfo => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];

/** The tab a stored file belongs to, or null for a type none of the tabs names (it is still listed under All). */
export function categoryOf(contentType: string): Exclude<MediaCategory, 'all'> | null {
  if (contentType.startsWith('image/')) return 'images';
  if (contentType === 'video/mp4') return 'videos';
  if (contentType === 'application/json') return 'animations';
  if (contentType === 'model/gltf-binary') return 'models';
  return null;
}

/** What one file of this type is called in a sentence ("image", "video", "animation", "3D model"). */
export const nounOf = (contentType: string): string => {
  const category = categoryOf(contentType);
  return category === 'images' ? 'image' : category === 'videos' ? 'video' : category === 'animations' ? 'animation' : category === 'models' ? '3D model' : 'file';
};

export const typeLabel = kindLabel;

export type MediaSort = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc';

export const SORTS: readonly { id: MediaSort; label: string }[] = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'name-asc', label: 'Name A–Z' },
  { id: 'name-desc', label: 'Name Z–A' },
  { id: 'size-desc', label: 'Largest file first' },
  { id: 'size-asc', label: 'Smallest file first' },
];

/**
 * The server lists newest first and has no other order, so any other order is worked out here, over the WHOLE result set: the page loads every matching file first (a category and a search narrow
 * it on the server) and only offers the other orders for a result set up to this size. A larger set stays newest first and says so; it is never sorted page by page.
 */
export const SORT_LIMIT = 1000;

/** The name a file goes by on the page: its title when it has one, otherwise the file name. */
export const displayName = (asset: MediaAsset): string => asset.title?.trim() || asset.originalFilename;

const byId = (a: MediaAsset, b: MediaAsset) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const NAMES = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** A new list in the chosen order. Ties always fall back to the id, so the order never changes between renders. `newest` is the server's own order and is returned as it came. */
export function sortAssets(items: readonly MediaAsset[], sort: MediaSort): MediaAsset[] {
  const list = [...items];
  switch (sort) {
    case 'newest':
      return list;
    case 'oldest':
      return list.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || byId(a, b));
    case 'name-asc':
      return list.sort((a, b) => NAMES.compare(displayName(a), displayName(b)) || byId(a, b));
    case 'name-desc':
      return list.sort((a, b) => NAMES.compare(displayName(b), displayName(a)) || byId(a, b));
    case 'size-desc':
      return list.sort((a, b) => b.sizeBytes - a.sizeBytes || byId(a, b));
    case 'size-asc':
      return list.sort((a, b) => a.sizeBytes - b.sizeBytes || byId(a, b));
  }
}

export const dateOf = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
