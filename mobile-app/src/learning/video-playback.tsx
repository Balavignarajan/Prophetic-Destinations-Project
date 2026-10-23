import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/theme';

/**
 * The player of a MEDIA_ANIMATION block of type VIDEO (expo-video, the SDK's maintained video library). It is only ever mounted after the learner pressed Play (the
 * block lazy-loads this file), so a lesson never creates a player, touches the network for a video or starts any sound by itself.
 *
 * The file is STREAMED from the learner media route, which answers byte-range requests (the platform players seek that way). Nothing is cached or downloaded for
 * offline use: no `useCaching`, no background download. The platform's own controls are shown (play and pause, seek, volume, full screen), which are the
 * accessible controls of each platform. A status of `error` is reported to the block, which says so and offers to try again.
 */
export default function VideoPlayback({ uri, onFailed }: { uri: string; onFailed: () => void }) {
  const { colors } = useTheme();
  const player = useVideoPlayer({ uri }, (created) => {
    created.loop = false;
    created.play(); // the learner has just pressed Play
  });
  const [loading, setLoading] = useState(player.status !== 'readyToPlay');

  useEffect(() => {
    if (player.status === 'error') onFailed();
    const subscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') onFailed();
      else setLoading(status !== 'readyToPlay');
    });
    return () => subscription.remove();
  }, [player, onFailed]);

  return (
    <View style={{ flex: 1 }}>
      <VideoView player={player} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} playsInline style={{ width: '100%', height: '100%' }} />
      {loading ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      ) : null}
    </View>
  );
}
