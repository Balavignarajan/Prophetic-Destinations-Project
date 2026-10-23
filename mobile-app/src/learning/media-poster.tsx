import { Image } from 'expo-image';
import { type ReactNode, useState } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import { AppText, GoldGlow } from '@/components/ui';
import { canSwitchToSavedWebCopy, reportBrokenAsset, switchToSavedWebCopy, useAssetUri } from '@/features/offline/offline-media';
import { lessonImageUrl } from '@/learning/lesson-image';
import type { LearningLevel } from '@/learning/levels';
import { useTheme } from '@/theme';

/** The shape the frame of a played medium may take: a poster of any shape is shown whole inside it, never stretched. */
export const clampRatio = (ratio: number) => Math.min(2.4, Math.max(0.75, ratio));

/**
 * The poster of a video or a Lottie animation: a still image from the lesson's own image route, shown from the copy saved with the lesson when there is one (a
 * poster is an ordinary image, so it is saved for offline reading like every other picture). A poster that cannot be shown is simply not shown: the frame stays
 * and the Play button still works, because the poster is never what the block depends on.
 */
export function MediaPoster({
  lessonId,
  level,
  mediaId,
  onRatio,
}: {
  lessonId: string;
  level: LearningLevel;
  mediaId: string;
  onRatio: (ratio: number) => void;
}) {
  const remote = mediaId ? lessonImageUrl(lessonId, mediaId, level) : null;
  const uri = useAssetUri(mediaId, remote);
  const [failed, setFailed] = useState(false);
  if (!mediaId || !uri || failed) return null;
  return (
    <Image
      source={{ uri }}
      style={{ width: '100%', height: '100%' }}
      contentFit="contain"
      // The Play button next to it carries the description ("Play video: ..."), so the still is not announced a second time.
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLoad={(event) => {
        const { width, height } = event.source;
        if (width > 0 && height > 0) onRatio(clampRatio(width / height));
      }}
      onError={() => {
        if (uri !== remote) reportBrokenAsset(mediaId);
        else if (canSwitchToSavedWebCopy(mediaId)) {
          void switchToSavedWebCopy(mediaId).then((shown) => {
            if (!shown) setFailed(true);
          });
        } else setFailed(true);
      }}
    />
  );
}

/** The calm surface a poster, a player or a placeholder sits on. */
export function MediaFrame({ ratio, children, style }: { ratio: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, radius } = useTheme();
  return (
    <View style={[{ width: '100%', aspectRatio: ratio, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceElevated }, style]}>
      {children}
    </View>
  );
}

/** What a frame without a poster says it holds, so the block is never an empty box. */
export function FramePlaceholder({ kind }: { kind: string }) {
  const { radius } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      <GoldGlow radius={radius.lg} />
      <AppText variant="label" color="textMuted">
        {kind}
      </AppText>
    </View>
  );
}
