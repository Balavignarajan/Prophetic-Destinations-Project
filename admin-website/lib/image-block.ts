/**
 * The IMAGE lesson block (feature register BLK-006): a reference to a stored media asset plus alternative text, an optional
 * caption and an optional source/rights line. The block never holds file bytes or a URL, only the id of an existing media asset,
 * so choosing an image from the library and uploading a new one both end in the same kind of reference.
 * No imports: usable anywhere.
 */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const ALT_TEXT_MAX = 500;
export const CAPTION_MAX = 500;
export const SOURCE_MAX = 300;

export interface ImageContent {
  mediaId: string;
  altText: string;
  caption: string;
  source: string;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The fields of a stored IMAGE block's content (missing fields become empty text). */
export function readImageContent(content: unknown): ImageContent {
  const c = isObject(content) ? content : {};
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  return { mediaId: text(c.mediaId), altText: text(c.altText), caption: text(c.caption), source: text(c.source) };
}

/** The content to save. Empty optional fields are left out rather than stored as empty text. */
export function buildImageContent(draft: ImageContent): Record<string, string> {
  const out: Record<string, string> = { mediaId: draft.mediaId, altText: draft.altText.trim() };
  if (draft.caption.trim()) out.caption = draft.caption.trim();
  if (draft.source.trim()) out.source = draft.source.trim();
  return out;
}

/** A sentence describing why the file will not be accepted, or null when it looks fine (the server still checks the real bytes). */
export function checkImageFile(file: { type: string; size: number }): string | null {
  if (file.size <= 0) return 'This file is empty.';
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return 'Only PNG, JPEG and WEBP images can be used.';
  if (file.size > IMAGE_MAX_BYTES) return 'This image is larger than 5 MB. Choose a smaller one.';
  return null;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const fileKindLabel = (contentType: string): string => (contentType.split('/')[1] ?? contentType).toUpperCase();

/** What the server said, in plain words, for the errors an author can act on. */
export function friendlyMediaError(error: unknown, fallback: string): string {
  const e = error as { payload?: { message?: string; code?: string; details?: { code?: string } }; message?: string; status?: number } | null;
  const code = e?.payload?.details?.code ?? e?.payload?.code;
  switch (code) {
    case 'UNSUPPORTED_TYPE':
      return 'This file type is not accepted by this server. Images (PNG, JPEG, WEBP) are; MP4 video and Lottie animations only when the server has been set up for them.';
    case 'FILE_TOO_LARGE': {
      const limit = (e?.payload?.details as { maxBytes?: unknown } | undefined)?.maxBytes;
      return typeof limit === 'number' ? `This file is larger than the ${formatBytes(limit)} this server accepts. Choose a smaller one.` : 'This file is larger than the server accepts. Choose a smaller one.';
    }
    case 'LOTTIE_INVALID':
      return e?.payload?.message ?? 'This is not an acceptable Lottie animation.';
    case 'MEDIA_NOT_A_VIDEO':
      return 'The selected file is not an MP4 video. Choose an MP4 video from the Media Library.';
    case 'MEDIA_NOT_LOTTIE':
      return 'The selected file is not a Lottie animation. Choose a Lottie JSON file from the Media Library.';
    case 'EMPTY_FILE':
      return 'This file is empty.';
    case 'MEDIA_NOT_FOUND':
      return 'That image no longer exists in the library. Choose another one.';
    case 'MEDIA_IN_USE':
      return e?.payload?.message ?? 'This image is used by a lesson, so it cannot be deleted.';
  }
  if (e?.status === 413) return 'This file is larger than the server accepts. Choose a smaller one.';
  if (e?.status === 403) return 'You do not have permission to do that.';
  return e?.payload?.message || e?.message || fallback;
}
