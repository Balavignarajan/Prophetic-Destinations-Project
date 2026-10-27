/**
 * The kinds of file a Media / Animation block (feature register BLK-016) can play, and the checks an author's file gets before it is sent to the server
 * (the server still checks the real bytes; these only save a failed upload and say why in plain words). No imports: usable anywhere.
 *
 *   ANIMATED_IMAGE  an animated WebP        VIDEO  an MP4 file          LOTTIE  a Lottie animation in its plain JSON form
 *
 * Whether the server accepts video and Lottie uploads at all, and the largest file, is the server's configuration (MEDIA_ALLOWED_TYPES, MEDIA_MAX_BYTES): the
 * rules it reports are passed in as `rules`, so the messages below quote the real limits and never a guess.
 */
export type AnimationKind = 'ANIMATED_IMAGE' | 'VIDEO' | 'LOTTIE' | 'YOUTUBE';
export type UploadKind = 'image' | 'video' | 'lottie';

export interface UploadRules {
  maxBytes: number;
  allowedTypes: string[];
}

export const ANIMATION_KINDS: { value: AnimationKind; label: string; contentType?: 'image/webp' | 'video/mp4' | 'application/json'; upload?: UploadKind }[] = [
  { value: 'ANIMATED_IMAGE', label: 'Animated image (WebP)', contentType: 'image/webp', upload: 'image' },
  { value: 'VIDEO', label: 'Video (MP4)', contentType: 'video/mp4', upload: 'video' },
  { value: 'LOTTIE', label: 'Lottie animation (JSON)', contentType: 'application/json', upload: 'lottie' },
  { value: 'YOUTUBE', label: 'YouTube video (URL)' },
];

/** A Lottie file is plain JSON data; the server refuses larger ones (backend LOTTIE_LIMITS.maxBytes). */
export const LOTTIE_MAX_BYTES = 2 * 1024 * 1024;

const megabytes = (bytes: number) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

/** The MIME type this kind of upload must have once stored. */
export const uploadContentType = (kind: UploadKind): string => (kind === 'video' ? 'video/mp4' : kind === 'lottie' ? 'application/json' : 'image/*');

/** What a file picker should offer for this kind. */
export const acceptFor = (kind: UploadKind): string => (kind === 'video' ? 'video/mp4,.mp4' : kind === 'lottie' ? 'application/json,.json' : 'image/png,image/jpeg,image/webp');

/** A sentence describing why a VIDEO or LOTTIE file will not be accepted, or null when it looks fine. Images use `checkImageFile`. */
export function checkMediaFile(kind: 'video' | 'lottie', file: { name: string; type: string; size: number }, rules: UploadRules | null): string | null {
  if (file.size <= 0) return 'This file is empty.';
  const mime = uploadContentType(kind);
  const lower = file.name.toLowerCase();
  if (kind === 'video' && !(file.type === 'video/mp4' || (file.type === '' && lower.endsWith('.mp4')))) return 'Only MP4 video can be used.';
  if (kind === 'lottie' && !(file.type === 'application/json' || lower.endsWith('.json'))) return 'Only a Lottie animation saved as a .json file can be used.';
  if (rules && !rules.allowedTypes.includes(mime)) {
    return kind === 'video'
      ? 'This server is not set up to accept MP4 video yet. The people who run it turn it on in the server settings (MEDIA_ALLOWED_TYPES).'
      : 'This server is not set up to accept Lottie animations yet. The people who run it turn it on in the server settings (MEDIA_ALLOWED_TYPES).';
  }
  if (kind === 'lottie' && file.size > LOTTIE_MAX_BYTES) return `A Lottie file can be at most ${megabytes(LOTTIE_MAX_BYTES)}.`;
  if (rules && file.size > rules.maxBytes) return `This file is larger than the ${megabytes(rules.maxBytes)} this server accepts. Choose a smaller one, or ask for the server limit to be raised.`;
  return null;
}

export const kindLabel = (contentType: string): string =>
  contentType === 'video/mp4' ? 'MP4 video' : contentType === 'application/json' ? 'Lottie animation' : (contentType.split('/')[1] ?? contentType).toUpperCase();
