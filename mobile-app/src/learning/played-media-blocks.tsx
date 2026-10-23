import { Suspense, lazy, useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { AppText, BlockNotice, SecondaryButton } from '@/components/ui';
import { lessonImageUrl } from '@/learning/lesson-image';
import type { LearningLevel } from '@/learning/levels';
import { MediaErrorBoundary } from '@/learning/media-error-boundary';
import { FramePlaceholder, MediaFrame, MediaPoster } from '@/learning/media-poster';
import { useTheme } from '@/theme';

/**
 * The MEDIA_ANIMATION blocks of type VIDEO (MP4) and LOTTIE (backend/src/modules/lessons/domain/blocks/scene-media.ts):
 *   { mediaType: 'VIDEO' | 'LOTTIE', mediaId, posterMediaId?, caption?, altText }
 *
 * What is shown, and when:
 *  - Before Play: the poster (a still image saved with the lesson like any picture) or a quiet placeholder, and a Play button. Nothing is fetched for the video or the
 *    animation, no player exists and nothing makes a sound. The player's code is only loaded when Play is pressed (React.lazy), so a lesson without a pressed Play
 *    never touches the video or Lottie libraries.
 *  - After Play: a video plays with the platform's own controls (expo-video); a Lottie animation plays once (lottie-react-native). "Stop" returns to the poster.
 *  - Reduce Motion: a Lottie animation plays only on Play, as an animated image does, and the note below says so; a video never plays by itself either.
 *
 * OFFLINE: a video is streamed from the server only while it plays and is never downloaded in advance; a Lottie file is fetched when Play is pressed. Neither is
 * saved for offline reading (no offline policy for them is approved), and the block says so instead of failing silently. Their posters are saved with the lesson.
 *
 * ISOLATION: a player that fails to load, errors while playing, or throws is contained in this block (MediaErrorBoundary / the failure state): the poster, the
 * message and the rest of the lesson stay as they were.
 */
const VideoPlayback = lazy(() => import('@/learning/video-playback'));
const LottiePlayback = lazy(() => import('@/learning/lottie-playback'));

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

type Phase = 'idle' | 'playing' | 'finished' | 'failed';
type Kind = 'video' | 'animation';

function PlayOverlay({ label, onPress, glyph = '▶' }: { label: string; onPress: () => void; glyph?: string }) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          minWidth: 64,
          minHeight: 64,
          borderRadius: 32,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: spacing.lg,
          borderWidth: 1.5,
          borderColor: colors.borderGold,
          backgroundColor: colors.surface,
        }}>
        <AppText variant="heading" color="primaryHighlight" allowFontScaling={false}>
          {glyph}
        </AppText>
      </View>
    </Pressable>
  );
}

function Loading() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <ActivityIndicator color={colors.textMuted} />
    </View>
  );
}

function Failure({ kind, alt, reason, onRetry }: { kind: Kind; alt: string; reason?: 'unreachable' | 'unusable'; onRetry: () => void }) {
  const { spacing } = useTheme();
  const noun = kind === 'video' ? 'video' : 'animation';
  return (
    <View style={{ gap: spacing.sm }}>
      <BlockNotice
        variant="offline"
        title={`${kind === 'video' ? 'Video' : 'Animation'}: ${alt}`}
        message={
          reason === 'unusable'
            ? `This ${noun} could not be played. The rest of the lesson is not affected.`
            : `This ${noun} could not be played. A ${noun} needs an internet connection: it is not saved for offline reading. Check your connection and try again.`
        }
      />
      <SecondaryButton size="small" label="Try again" onPress={onRetry} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}

function Details({ caption, note }: { caption: string; note: string }) {
  return (
    <>
      {caption ? (
        <AppText variant="bodySmall" color="textSecondary">
          {caption}
        </AppText>
      ) : null}
      <AppText variant="bodySmall" color="textMuted">
        {note}
      </AppText>
    </>
  );
}

type Props = { lessonId: string; level: LearningLevel; content: Record<string, unknown> };

function read(content: Record<string, unknown>) {
  return {
    mediaId: isText(content.mediaId) ? content.mediaId.trim() : '',
    posterId: isText(content.posterMediaId) ? content.posterMediaId.trim() : '',
    alt: isText(content.altText) ? content.altText.trim() : '',
    caption: isText(content.caption) ? content.caption.trim() : '',
  };
}

export function VideoBlock({ lessonId, level, content }: Props) {
  const { spacing } = useTheme();
  const { mediaId, posterId, alt, caption } = read(content);
  const [phase, setPhase] = useState<Phase>('idle');
  const [attempt, setAttempt] = useState(0);
  const [ratio, setRatio] = useState(16 / 9);
  const uri = lessonImageUrl(lessonId, mediaId, level);
  const onFailed = useCallback(() => setPhase('failed'), []);

  if (!uri) {
    return <BlockNotice variant="offline" title={`Video: ${alt}`} message="The server address is not set up in this build, so the video cannot be played." />;
  }
  const retry = () => {
    setAttempt((n) => n + 1);
    setPhase('playing');
  };
  const frame = (
    <MediaFrame ratio={ratio}>
      {phase === 'playing' ? (
        <MediaErrorBoundary
          fallback={(reset) => (
            <View style={{ flex: 1, padding: spacing.md, justifyContent: 'center' }}>
              <Failure kind="video" alt={alt} onRetry={reset} />
            </View>
          )}>
          <Suspense fallback={<Loading />}>
            <VideoPlayback key={attempt} uri={uri} onFailed={onFailed} />
          </Suspense>
        </MediaErrorBoundary>
      ) : (
        <>
          {posterId ? <MediaPoster lessonId={lessonId} level={level} mediaId={posterId} onRatio={setRatio} /> : <FramePlaceholder kind="Video" />}
          <PlayOverlay label={`Play video: ${alt}`} onPress={() => setPhase('playing')} />
        </>
      )}
    </MediaFrame>
  );

  return (
    <View style={{ gap: spacing.sm }} accessible={false}>
      {frame}
      {phase === 'failed' ? <Failure kind="video" alt={alt} onRetry={retry} /> : null}
      {phase === 'playing' ? <SecondaryButton size="small" label="Stop and show the poster" onPress={() => setPhase('idle')} style={{ alignSelf: 'flex-start' }} /> : null}
      <Details caption={caption} note="This video plays only when you press Play, and needs an internet connection: it is not saved for offline reading." />
    </View>
  );
}

export function LottieBlock({ lessonId, level, content }: Props) {
  const { spacing } = useTheme();
  const reduceMotion = useReduceMotion();
  const { mediaId, posterId, alt, caption } = read(content);
  const [phase, setPhase] = useState<Phase>('idle');
  const [attempt, setAttempt] = useState(0);
  const [ratio, setRatio] = useState(1);
  const [reason, setReason] = useState<'unreachable' | 'unusable'>('unreachable');
  const uri = lessonImageUrl(lessonId, mediaId, level);
  const onFinished = useCallback(() => setPhase('finished'), []);
  const onFailed = useCallback((why: 'unreachable' | 'unusable') => {
    setReason(why);
    setPhase('failed');
  }, []);

  if (!uri) {
    return <BlockNotice variant="offline" title={`Animation: ${alt}`} message="The server address is not set up in this build, so the animation cannot be played." />;
  }
  const play = () => {
    setAttempt((n) => n + 1);
    setPhase('playing');
  };

  return (
    <View style={{ gap: spacing.sm }} accessible={false}>
      <MediaFrame ratio={ratio}>
        {phase === 'playing' ? (
          <View accessible accessibilityRole="image" accessibilityLabel={`Animation: ${alt}`} style={{ flex: 1 }}>
            <MediaErrorBoundary
              fallback={(reset) => (
                <View style={{ flex: 1, padding: spacing.md, justifyContent: 'center' }}>
                  <Failure kind="animation" alt={alt} onRetry={reset} />
                </View>
              )}>
              <Suspense fallback={<Loading />}>
                <LottiePlayback key={attempt} uri={uri} onFinished={onFinished} onFailed={onFailed} onRatio={setRatio} />
              </Suspense>
            </MediaErrorBoundary>
          </View>
        ) : (
          <>
            {posterId ? <MediaPoster lessonId={lessonId} level={level} mediaId={posterId} onRatio={setRatio} /> : <FramePlaceholder kind="Animation" />}
            <PlayOverlay label={`${phase === 'finished' ? 'Play again' : 'Play animation'}: ${alt}`} onPress={play} glyph={phase === 'finished' ? '↻' : '▶'} />
          </>
        )}
      </MediaFrame>
      {phase === 'failed' ? <Failure kind="animation" alt={alt} reason={reason} onRetry={play} /> : null}
      {phase === 'playing' ? <SecondaryButton size="small" label="Stop and show the poster" onPress={() => setPhase('idle')} style={{ alignSelf: 'flex-start' }} /> : null}
      {reduceMotion ? (
        <AppText variant="bodySmall" color="textMuted">
          Your device is set to reduce motion. This animation plays only when you press Play.
        </AppText>
      ) : null}
      <Details caption={caption} note="This animation plays once, only when you press Play, and needs an internet connection: it is not saved for offline reading." />
    </View>
  );
}
