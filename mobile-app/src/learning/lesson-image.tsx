import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Image, Modal, type ImageLoadEventData, type NativeSyntheticEvent, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_BASE_URL } from '@/config/api';
import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { AppText, BlockNotice, IconButton, Reveal } from '@/components/ui';
import { reportBrokenAsset, useAssetUri } from '@/features/offline/offline-media';
import type { LearningLevel } from '@/learning/levels';
import { useTheme } from '@/theme';
import { NATIVE_DRIVER, motion } from '@/theme/motion';

/**
 * Renders a published IMAGE block (backend/src/modules/lessons/domain/blocks/image.ts):
 *   { mediaId, altText, caption?, source? }
 * The image is fetched from the learner route `GET /lessons/:lessonId/media/:mediaId?level=`, which serves an image only when the
 * lesson's active published snapshot contains it. No credentials are involved and no admin route is used.
 *
 * Shown at the full width of the column with its own aspect ratio (so tall, wide and square images all fit a narrow phone). If it
 * cannot be loaded the lesson carries on: the description (alt text) is shown with a Try again button. The image is shown from its saved copy on
 * the device when there is one (features/offline/offline-media.ts, saved with the lesson), otherwise from the learner URL; with neither
 * the fallback below is shown.
 */
type ImageContent = { mediaId?: unknown; altText?: unknown; caption?: unknown; source?: unknown };

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export function lessonImageUrl(lessonId: string, mediaId: string, level: LearningLevel): string | null {
  return API_BASE_URL ? `${API_BASE_URL}/lessons/${encodeURIComponent(lessonId)}/media/${encodeURIComponent(mediaId)}?level=${level}` : null;
}

export function LessonImage({ lessonId, level, content }: { lessonId: string; level: LearningLevel; content: Record<string, unknown> }) {
  const { spacing, colors, radius, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [zoomed, setZoomed] = useState(false);
  const c = content as ImageContent;
  const mediaId = text(c.mediaId);
  const alt = text(c.altText);
  const caption = text(c.caption);
  const source = text(c.source);
  const remoteUri = mediaId ? lessonImageUrl(lessonId, mediaId, level) : null;
  const uri = useAssetUri(mediaId, remoteUri);

  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [ratio, setRatio] = useState(16 / 9);
  const [attempt, setAttempt] = useState(0);

  const onLoad = (event: NativeSyntheticEvent<ImageLoadEventData>) => {
    const { width, height } = event.nativeEvent.source;
    if (width > 0 && height > 0) setRatio(width / height);
    setStatus('ready');
  };

  const failed = !uri || status === 'failed';

  // The picture fades in when it has loaded (a loaded picture is never hidden by this: it only changes opacity, and Reduce Motion skips it).
  const [fade] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (status !== 'ready') {
      fade.setValue(0);
      return;
    }
    if (reduceMotion) {
      fade.setValue(1);
      return;
    }
    const animation = Animated.timing(fade, { toValue: 1, duration: motion.duration.selection, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER });
    animation.start();
    return () => animation.stop();
  }, [status, reduceMotion, fade]);

  return (
    <View style={{ gap: spacing.sm }} accessible={false}>
      {failed ? (
        <View style={{ gap: spacing.sm }}>
          <BlockNotice
            variant="offline"
            title={alt ? `Image: ${alt}` : 'An image belongs here, but it could not be shown.'}
            message="This image is not saved on this device yet. It is saved when you open the lesson with an internet connection."
          />
          {uri ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Try loading the image again"
              onPress={() => {
                setStatus('loading');
                setAttempt((n) => n + 1);
              }}
              style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs }}
            >
              <AppText variant="label" color="primaryHighlight">
                Try again
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Enlarge image: ${alt || caption || 'Lesson image'}`}
          disabled={status !== 'ready'}
          onPress={() => setZoomed(true)}
          style={{ borderRadius: radius.lg, overflow: 'hidden', backgroundColor: status === 'ready' ? colors.surface : colors.surfaceElevated, aspectRatio: ratio, width: '100%' }}>
          <Animated.Image
            key={attempt}
            source={{ uri }}
            style={{ width: '100%', height: '100%', opacity: fade }}
            resizeMode="contain"
            onLoad={onLoad}
            onError={() => {
              // a saved copy that cannot be shown is dropped (it is downloaded again later) and the learner URL is tried instead
              if (uri !== remoteUri) reportBrokenAsset(mediaId);
              else setStatus('failed');
            }}
          />
          {status === 'loading' ? (
            <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <ActivityIndicator color={colors.textMuted} />
            </View>
          ) : null}
        </Pressable>
      )}
      {caption ? (
        <AppText variant="bodySmall" color="textSecondary">
          {caption}
        </AppText>
      ) : null}
      {source ? (
        <AppText variant="bodySmall" color="textMuted">
          Source: {source}
        </AppText>
      ) : null}

      {/* Enlarged view: the same picture at its own aspect ratio. Android back and the close button both dismiss it. */}
      <Modal visible={zoomed} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setZoomed(false)} statusBarTranslucent>
        <View
          accessibilityViewIsModal
          style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg }}>
          <View style={{ alignItems: 'flex-end', paddingHorizontal: spacing.lg }}>
            <IconButton accessibilityLabel="Close enlarged image" tone="ghost" onPress={() => setZoomed(false)}>
              <AppText variant="heading" color="textPrimary">
                ✕
              </AppText>
            </IconButton>
          </View>
          {/* tapping the picture also closes it; screen readers use the close button above, so this area is not announced as a second one */}
          <Pressable accessible={false} onPress={() => setZoomed(false)} style={{ flex: 1, width: '100%', maxWidth: layout.maxContentWidth * 2, alignSelf: 'center', padding: spacing.lg }}>
            {uri ? (
              <Reveal offset={0} scaleFrom={0.97} duration={motion.duration.modal} style={{ flex: 1 }}>
                <Image source={{ uri }} resizeMode="contain" accessible accessibilityRole="image" accessibilityLabel={alt || caption || 'Lesson image'} style={{ flex: 1 }} />
              </Reveal>
            ) : null}
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}
