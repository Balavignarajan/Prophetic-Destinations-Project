import { formatBytes } from './image-block';
import type { UploadKind } from './media-kinds';

/**
 * Large media file warnings (CMS-030). A WARNING shown before an upload starts, so the author can choose to continue or pick a smaller file. It is not a restriction: the server's
 * limits (MEDIA_MAX_BYTES, the 2 MB Lottie limit, the type checks) are unchanged and still decide what is accepted, and nothing here compresses, resizes or alters a file.
 *
 * THE THRESHOLDS ARE PROVISIONAL. Neither the requirements nor the existing code give recommended file sizes, so these are conservative placeholders chosen so that a file that
 * is large for a phone lesson is mentioned, not a client-approved policy. They are the only place the numbers are written: change them here. A file strictly LARGER than the
 * threshold of its kind triggers the warning. A threshold at or above the server's limit for that kind would simply never fire.
 */
export const MEDIA_SIZE_WARNING_BYTES: Readonly<Record<UploadKind, number>> = {
  /** A picture (PNG, JPEG, WEBP, animated WEBP). The server accepts up to 5 MB. */
  image: 1.5 * 1024 * 1024,
  /** An MP4 video. The limit is the server's MEDIA_MAX_BYTES (up to 100 MB). */
  video: 20 * 1024 * 1024,
  /** A Lottie animation (JSON). The server accepts up to 2 MB. */
  lottie: 512 * 1024,
  /** A GLB 3D model. The server accepts up to 20 MB, but an optimized model is far smaller and loads much faster on a phone. */
  model: 5 * 1024 * 1024,
};

export interface LargeFileWarning {
  kind: UploadKind;
  fileName: string;
  sizeBytes: number;
  /** The provisional threshold that was passed. */
  thresholdBytes: number;
}

/** The warning for this file, or null when it is not larger than the threshold of its kind (or has no size to judge). */
export function largeFileWarning(kind: UploadKind, file: { name: string; size: number }): LargeFileWarning | null {
  const thresholdBytes = MEDIA_SIZE_WARNING_BYTES[kind];
  if (!Number.isFinite(file.size) || file.size <= thresholdBytes) return null;
  return { kind, fileName: file.name, sizeBytes: file.size, thresholdBytes };
}

/** The readable size, e.g. "14.2 MB". */
export const warningSizeText = (warning: LargeFileWarning): string => formatBytes(warning.sizeBytes);

/** Why a large file matters for this kind of media, in plain words (the file name and size are shown separately). */
export function largeFileAdvice(kind: UploadKind): string {
  if (kind === 'video') {
    return 'A large video can be slow to start on a weak connection. Videos are played over the internet and are not saved for offline reading.';
  }
  if (kind === 'lottie') {
    return 'A large animation can take longer to load. Lottie animations are played over the internet and are not saved for offline reading.';
  }
  if (kind === 'model') {
    return 'A large 3D model can be slow to load on a phone. Models are loaded over the internet and are not saved for offline reading. Reducing the polygon count and texture sizes before exporting makes a model much smaller.';
  }
  return 'Large media files may take longer to load and to save for offline reading.';
}
