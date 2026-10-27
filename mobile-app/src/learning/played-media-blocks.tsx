import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';
import { Image } from 'expo-image';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { AppText, BlockNotice, Reveal, SecondaryButton } from '@/components/ui';
import { lessonImageUrl } from '@/learning/lesson-image';
import type { LearningLevel } from '@/learning/levels';
import { MediaErrorBoundary } from '@/learning/media-error-boundary';
import { EmbeddedYoutubePlayer } from '@/learning/embedded-youtube-player';
import { isYouTubeVideoId, mediaPlaybackSettings, youtubeThumbnailUrl, youtubeWatchUrl } from '@/learning/media-settings';
import { FramePlaceholder, MediaFrame, MediaPoster } from '@/learning/media-poster';
import { useTheme } from '@/theme';
import { motion } from '@/theme/motion';

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

function Details({ caption, description, note }: { caption: string; description: string; note: string }) {
  return (
    <>
      {caption ? (
        <AppText variant="bodySmall" color="textSecondary">
          {caption}
        </AppText>
      ) : null}
      {description ? (
        <AppText variant="bodySmall" color="textSecondary">
          {description}
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
    description: isText(content.description) ? content.description.trim() : '',
  };
}

export function VideoBlock({ lessonId, level, content, appActive = true }: Props & { appActive?: boolean }) {
  const { spacing } = useTheme();
  const { mediaId, posterId, alt, caption, description } = read(content);
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
            <VideoPlayback key={attempt} uri={uri} onFailed={onFailed} active={appActive} />
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
    <Reveal offset={motion.offset.subtle} style={{ gap: spacing.sm }} accessible={false}>
      {frame}
      {phase === 'failed' ? <Failure kind="video" alt={alt} onRetry={retry} /> : null}
      {phase === 'playing' ? <SecondaryButton size="small" label="Stop and show the poster" onPress={() => setPhase('idle')} style={{ alignSelf: 'flex-start' }} /> : null}
      <Details caption={caption} description={description} note="This video plays only when you press Play, and needs an internet connection: it is not saved for offline reading." />
    </Reveal>
  );
}

export function LottieBlock({ lessonId, level, content, isVisible = true, appActive = true }: Props & { isVisible?: boolean; appActive?: boolean }) {
  const { spacing } = useTheme();
  const reduceMotion = useReduceMotion();
  const { mediaId, posterId, alt, caption, description } = read(content);
  const [phase, setPhase] = useState<Phase>('idle');
  const [attempt, setAttempt] = useState(0);
  const [ratio, setRatio] = useState(1);
  const [reason, setReason] = useState<'unreachable' | 'unusable'>('unreachable');
  const uri = lessonImageUrl(lessonId, mediaId, level);
  const settings = mediaPlaybackSettings(content, 'LOTTIE');
  const shouldAutoPlay = settings.autoplayWhenVisible && !reduceMotion && isVisible && appActive;
  const onFinished = useCallback(() => setPhase('finished'), []);
  const onFailed = useCallback((why: 'unreachable' | 'unusable') => {
    setReason(why);
    setPhase('failed');
  }, []);

  const play = () => {
    setAttempt((n) => n + 1);
    setPhase('playing');
  };

  // A visible animation begins only when its configured autoplay is on. Leaving the reading area or app stops it cleanly; returning creates a fresh playback.
  useEffect(() => {
    if (shouldAutoPlay && phase === 'idle') {
      setAttempt((n) => n + 1);
      setPhase('playing');
    }
    if (!shouldAutoPlay && phase !== 'idle' && settings.autoplayWhenVisible) setPhase('idle');
  }, [shouldAutoPlay, phase, settings.autoplayWhenVisible]);

  if (!uri) {
    return <BlockNotice variant="offline" title={`Animation: ${alt}`} message="The server address is not set up in this build, so the animation cannot be played." />;
  }

  return (
    <Reveal offset={motion.offset.subtle} style={{ gap: spacing.sm }} accessible={false}>
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
                <LottiePlayback key={attempt} uri={uri} onFinished={onFinished} onFailed={onFailed} onRatio={setRatio} loop={settings.loop} active={appActive && isVisible} />
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
      <Details caption={caption} description={description} note="This animation needs an internet connection and is not saved for offline reading." />
    </Reveal>
  );
}

/** A user-triggered YouTube presentation that embeds when supported and retains the canonical external action as a fallback. */
export function YouTubeBlock({ lessonId, level, content, isVisible = true, appActive = true }: Props & { isVisible?: boolean; appActive?: boolean }) {
  const { spacing, radius, colors } = useTheme();
  const { posterId, alt, caption, description } = read(content);
  const id = isYouTubeVideoId(content.youtubeVideoId) ? content.youtubeVideoId : '';
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const [ratio, setRatio] = useState(16 / 9);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'playing' | 'failed'>('idle');
  const open = useCallback(() => {
    if (!id) return;
    setOpenFailed(false);
    void Linking.openURL(youtubeWatchUrl(id)).catch(() => setOpenFailed(true));
  }, [id]);
  const play = useCallback(() => {
    setOpenFailed(false);
    setPhase('loading');
  }, []);
  const onPlayerReady = useCallback(() => setPhase('playing'), []);
  const onPlayerFailed = useCallback(() => setPhase('failed'), []);
  const onPlayerReleased = useCallback(() => setPhase('idle'), []);
  // YouTube does not provide a robust native pause handle through a raw WebView. Releasing the player is predictable:
  // it prevents background audio, avoids retaining several players in a lesson, and always requires an explicit replay on return.
  useEffect(() => {
    if (!isVisible || !appActive) setPhase((current) => (current === 'loading' || current === 'playing' ? 'idle' : current));
  }, [isVisible, appActive]);
  useEffect(() => {
    if (phase !== 'loading') return;
    const timeout = setTimeout(() => setPhase('failed'), 20_000);
    return () => clearTimeout(timeout);
  }, [phase]);
  if (!id) return <BlockNotice title="YouTube video is incomplete" message="This video cannot be played here." />;
  return (
    <Reveal offset={motion.offset.subtle} style={{ gap: spacing.sm }} accessible={false}>
      <MediaFrame ratio={ratio}>
        {phase === 'loading' || phase === 'playing' ? (
          <EmbeddedYoutubePlayer videoId={id} accessibilityLabel={`YouTube video: ${alt}`} onReady={onPlayerReady} onFailed={onPlayerFailed} onReleased={onPlayerReleased} />
        ) : (
          <>
            {posterId ? <MediaPoster lessonId={lessonId} level={level} mediaId={posterId} onRatio={setRatio} /> : !thumbnailFailed ? <Image source={{ uri: youtubeThumbnailUrl(id) }} style={{ width: '100%', height: '100%' }} contentFit="contain" accessible={false} onError={() => setThumbnailFailed(true)} /> : <FramePlaceholder kind="YouTube video" />}
            <PlayOverlay label={`${phase === 'failed' ? 'Retry YouTube video' : 'Play YouTube video'}: ${alt}`} onPress={play} />
          </>
        )}
      </MediaFrame>
      {phase === 'failed' ? <BlockNotice variant="offline" title="Unable to play this YouTube video here." message="This video can't be played here. Try again or watch it on YouTube." /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {phase === 'failed' ? <Pressable accessibilityRole="button" accessibilityLabel={`Retry ${alt}`} onPress={play} style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderGold, backgroundColor: pressed ? colors.surfaceElevated : colors.surface })}><AppText variant="label" color="primaryHighlight">Retry</AppText></Pressable> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`Watch ${alt} on YouTube`} onPress={open} style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderGold, backgroundColor: pressed ? colors.surfaceElevated : colors.surface })}>
        <AppText variant="label" color="primaryHighlight">Watch on YouTube</AppText>
      </Pressable>
      </View>
      {openFailed ? <BlockNotice variant="offline" title="This video can't be played here." message="Check your connection and try Watch on YouTube again." /> : null}
      <Details caption={caption} description={description} note="Hosted on YouTube. An internet connection is required and this video is not saved for offline reading." />
    </Reveal>
  );
}
