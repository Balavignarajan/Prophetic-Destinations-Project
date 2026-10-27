const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);

/** Returns a canonical ID only for supported HTTPS YouTube video URLs. No URL is persisted. */
export function youtubeVideoId(value: string): string | null {
  const source = value.trim();
  if (!source) return null;
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === 'youtu.be') {
    const parts = url.pathname.split('/').filter(Boolean);
    id = parts.length === 1 ? parts[0] : null;
  }
  else if (url.pathname === '/watch') id = url.searchParams.get('v');
  else {
    const [, pathId] = url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)\/?$/) ?? [];
    id = pathId ?? null;
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

export const youtubeWatchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;
export const youtubeThumbnailUrl = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
