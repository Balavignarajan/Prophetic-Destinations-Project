import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { isYouTubeVideoId } from '@/learning/media-settings';
import { useTheme } from '@/theme';

const YOUTUBE_NAVIGATION_HOSTS = new Set([
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'www.youtube.com',
  'youtube.com',
  'm.youtube.com',
]);

let nextPlayer = 0;
const activePlayers = new Map<string, () => void>();

function claimPlayer(id: string, release: () => void): () => void {
  for (const [otherId, stop] of activePlayers) if (otherId !== id) stop();
  activePlayers.set(id, release);
  return () => {
    if (activePlayers.get(id) === release) activePlayers.delete(id);
  };
}

function isAllowedNavigation(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && YOUTUBE_NAVIGATION_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return value === 'about:blank';
  }
}

/**
 * A user-triggered, privacy-enhanced YouTube embed. The source URL is built only from the already validated video id;
 * no CMS URL, HTML, or injected player script is ever accepted. A second player claims ownership by releasing this one.
 */
export function EmbeddedYoutubePlayer({
  videoId,
  accessibilityLabel,
  onReady,
  onFailed,
  onReleased,
}: {
  videoId: string;
  accessibilityLabel: string;
  onReady: () => void;
  onFailed: () => void;
  onReleased: () => void;
}) {
  const { colors } = useTheme();
  const playerId = useRef<string | null>(null);
  if (playerId.current === null) playerId.current = `youtube-${++nextPlayer}`;

  useEffect(() => claimPlayer(playerId.current as string, onReleased), [onReleased]);

  if (!isYouTubeVideoId(videoId)) return null;
  const uri = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`;

  return (
    <WebView
      source={{ uri }}
      style={{ flex: 1, backgroundColor: colors.surfaceElevated }}
      accessibilityLabel={accessibilityLabel}
      originWhitelist={['https://www.youtube-nocookie.com', 'https://www.youtube.com']}
      javaScriptEnabled
      domStorageEnabled
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback
      allowsFullscreenVideo
      allowsPictureInPictureMediaPlayback={false}
      setSupportMultipleWindows={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      bounces={false}
      overScrollMode="never"
      startInLoadingState
      renderLoading={() => (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Loading YouTube video">
          <ActivityIndicator color={colors.textMuted} />
        </View>
      )}
      onLoadEnd={onReady}
      onError={onFailed}
      onHttpError={onFailed}
      onShouldStartLoadWithRequest={(request) => isAllowedNavigation(request.url)}
    />
  );
}
