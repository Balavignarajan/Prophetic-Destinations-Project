import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { API_BASE_URL } from '@/config/api';
import { canSwitchToSavedWebCopy, reportBrokenAsset, switchToSavedWebCopy, useAssetUri } from '@/features/offline/offline-media';
import type { LearningLevel } from '@/learning/levels';
import { useTheme } from '@/theme';
import { NATIVE_DRIVER, motion } from '@/theme/motion';

/**
 * Published cover images, from the learner routes (no credentials, no admin route):
 *   course: GET /courses/:courseId/media/:mediaId?level=
 *   lesson: GET /lessons/:lessonId/media/:mediaId?level=
 *   Home card: GET /home-entries/:entryId/media/:mediaId?level=
 * The backend serves a cover only while the active published version names it. Covers are saved on the device with the content that
 * lists them (see features/offline/offline-media.ts) and shown from there; without a saved copy and a connection the quiet placeholder is shown.
 */
export function courseCoverUrl(courseId: string, mediaId: string, level: LearningLevel): string | null {
  return API_BASE_URL ? `${API_BASE_URL}/courses/${encodeURIComponent(courseId)}/media/${encodeURIComponent(mediaId)}?level=${level}` : null;
}

/** A Home card's own picture: GET /home-entries/:entryId/media/:mediaId?level= (served only while the card is visible at that level and uses exactly this asset). */
export function homeEntryImageUrl(entryId: string, mediaId: string, level: LearningLevel): string | null {
  return API_BASE_URL ? `${API_BASE_URL}/home-entries/${encodeURIComponent(entryId)}/media/${encodeURIComponent(mediaId)}?level=${level}` : null;
}

export function lessonCoverUrl(lessonId: string, mediaId: string, level: LearningLevel): string | null {
  return API_BASE_URL ? `${API_BASE_URL}/lessons/${encodeURIComponent(lessonId)}/media/${encodeURIComponent(mediaId)}?level=${level}` : null;
}

/**
 * A decorative cover. Renders nothing when there is no cover (older cached lists have none); a failed image shows a quiet placeholder.
 * Give it either a fixed `height` or an `aspectRatio` (then it is as wide as its space and that shape). `flush` squares the corners, for a
 * cover that runs to the edges of a card. The picture fades in once it has loaded (just shown with Reduce Motion), over a calm raised surface.
 */
export function CoverImage({
  mediaId,
  uri: remoteUri,
  width,
  height,
  aspectRatio,
  flush = false,
}: {
  mediaId: string;
  uri: string | null;
  width: number | '100%';
  height?: number;
  aspectRatio?: number;
  flush?: boolean;
}) {
  const { colors, radius } = useTheme();
  const reduce = useReduceMotion();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [fade] = useState(() => new Animated.Value(0));
  // The saved copy (offline-media) when there is one, otherwise the learner URL.
  const uri = useAssetUri(mediaId, remoteUri);

  useEffect(() => {
    if (!loaded) return;
    if (reduce) {
      fade.setValue(1);
      return;
    }
    const animation = Animated.timing(fade, { toValue: 1, duration: motion.duration.selection, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER });
    animation.start();
    return () => animation.stop();
  }, [loaded, reduce, fade]);

  if (!uri) return null;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        aspectRatio ? { width: '100%', aspectRatio } : { width, height },
        { borderRadius: flush ? 0 : radius.md, overflow: 'hidden', backgroundColor: loaded ? colors.surface : colors.surfaceElevated },
      ]}>
      {failed ? null : (
        <Animated.Image
          source={{ uri }}
          style={{ width: '100%', height: '100%', opacity: fade }}
          resizeMode="cover"
          onLoad={() => setLoaded(true)}
          onError={() => {
            // a saved file that cannot be shown is forgotten (and downloaded again later); the placeholder stays quiet
            if (uri !== remoteUri) reportBrokenAsset(mediaId);
            else if (canSwitchToSavedWebCopy(mediaId)) {
              void switchToSavedWebCopy(mediaId).then((shown) => {
                if (!shown) setFailed(true);
              });
            } else setFailed(true);
          }}
        />
      )}
    </View>
  );
}
