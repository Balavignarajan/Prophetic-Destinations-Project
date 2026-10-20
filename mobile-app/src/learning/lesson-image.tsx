import { useState } from 'react';
import { Image, type ImageLoadEventData, type NativeSyntheticEvent, Pressable, View } from 'react-native';

import { API_BASE_URL } from '@/config/api';
import { AppText } from '@/components/ui';
import { reportBrokenAsset, useAssetUri } from '@/features/offline/offline-media';
import type { LearningLevel } from '@/learning/levels';
import { useTheme } from '@/theme';

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
  const { spacing, colors, radius } = useTheme();
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

  return (
    <View style={{ gap: spacing.sm }} accessible={false}>
      {failed ? (
        <View
          style={{
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.borderSubtle,
            backgroundColor: colors.surface,
            padding: spacing.lg,
            gap: spacing.sm,
          }}
        >
          <AppText variant="bodySmall" color="textSecondary" accessibilityRole="text">
            {alt ? `Image: ${alt}` : 'An image belongs here, but it could not be shown.'}
          </AppText>
          <AppText variant="caption" color="textMuted">
            This image is not saved on this device yet. It is saved when you open the lesson with an internet connection.
          </AppText>
          {uri ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Try loading the image again"
              onPress={() => {
                setStatus('loading');
                setAttempt((n) => n + 1);
              }}
              style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}
            >
              <AppText variant="label" color="primaryHighlight">
                Try again
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={{ borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface, aspectRatio: ratio, width: '100%' }}>
          <Image
            key={attempt}
            source={{ uri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="contain"
            accessible
            accessibilityRole="image"
            accessibilityLabel={alt || caption || 'Lesson image'}
            onLoad={onLoad}
            onError={() => {
              // a saved copy that cannot be shown is dropped (it is downloaded again later) and the learner URL is tried instead
              if (uri !== remoteUri) reportBrokenAsset(mediaId);
              else setStatus('failed');
            }}
          />
          {status === 'loading' ? (
            <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <AppText variant="caption" color="textMuted">
                Loading image…
              </AppText>
            </View>
          ) : null}
        </View>
      )}
      {caption ? (
        <AppText variant="bodySmall" color="textSecondary">
          {caption}
        </AppText>
      ) : null}
      {source ? (
        <AppText variant="caption" color="textMuted">
          Source: {source}
        </AppText>
      ) : null}
    </View>
  );
}
