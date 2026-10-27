/** Safe defaults for older snapshots that predate media playback preferences. */
export function mediaPlaybackSettings(content: Record<string, unknown>, mediaType: string) {
  const animation = mediaType === 'ANIMATED_IMAGE' || mediaType === 'LOTTIE';
  return {
    autoplayWhenVisible: typeof content.autoplayWhenVisible === 'boolean' ? content.autoplayWhenVisible : animation,
    loop: typeof content.loop === 'boolean' ? content.loop : animation,
    showControls: typeof content.showControls === 'boolean' ? content.showControls : true,
  };
}

export const isYouTubeVideoId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{11}$/.test(value);
export const youtubeWatchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;
export const youtubeThumbnailUrl = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
