import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, BlockNotice, Reveal } from '@/components/ui';
import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { canSaveImages, canSwitchToSavedWebCopy, reportBrokenAsset, switchToSavedWebCopy, useAssetUri } from '@/features/offline/offline-media';
import { LessonImage, lessonImageUrl } from '@/learning/lesson-image';
import type { LearningLevel } from '@/learning/levels';
import { LottieBlock, VideoBlock, YouTubeBlock } from '@/learning/played-media-blocks';
import { isYouTubeVideoId, mediaPlaybackSettings } from '@/learning/media-settings';
import { ScriptureLinks } from '@/learning/scripture-links';
import { useTheme } from '@/theme';
import { motion } from '@/theme/motion';

/**
 * Renders published NARRATIVE_SCENE and MEDIA_ANIMATION blocks (backend/src/modules/lessons/domain/blocks/scene-media.ts; PROPOSED schemas):
 *   NARRATIVE_SCENE: { title?, image?: { mediaId, altText }, narrative, scripture?: FROZEN passages }
 *   MEDIA_ANIMATION: { mediaType: 'ANIMATED_IMAGE' | 'VIDEO' | 'LOTTIE', mediaId, posterMediaId?, caption?, altText }
 *
 * NARRATIVE_SCENE is a still composition: the visual (the shared image component, saved copy first), the title as a heading, the author's narrative and
 * the frozen Scripture apart from it. The workbook's "predefined transition/effect" has no defined values (D8), so no effect and no sequence is applied:
 * the only motion is the quiet fade-in every educational block already has, which Reduce Motion switches off. The narrative is set for reading: a blank line in
 * the author's text starts a new paragraph, and each paragraph has room around it.
 *
 * MEDIA_ANIMATION: an animated WebP plays with expo-image (below); a VIDEO (MP4) and a LOTTIE animation are played by played-media-blocks.tsx. Nothing autoplays and
 * there is no sound until the learner presses Play (also when the device asks to reduce motion). Before Play the poster is shown, or for an animated WebP the first
 * frame if there is none; Stop returns to that. An animated WebP and the poster are saved for offline use through the normal lesson asset list (a lesson is not
 * "saved" while either is missing); a video and a Lottie file are not (see played-media-blocks.tsx). If a block is incomplete or malformed only that block says
 * so; the rest of the lesson is unaffected.
 */
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function Note({ title, message, variant }: { title: string; message: string; variant?: 'unsupported' }) {
  return <BlockNotice title={title} message={message} variant={variant} />;
}

export function NarrativeSceneBlock({ lessonId, level, content }: { lessonId: string; level: LearningLevel; content: Record<string, unknown> }) {
  const { spacing, colors } = useTheme();
  const imageOk = content.image === undefined || (isRecord(content.image) && isText(content.image.mediaId));
  if (!isText(content.narrative) || !imageOk || (content.scripture !== undefined && !Array.isArray(content.scripture))) {
    return <Note title="Scene is incomplete" message="Part of this scene could not be read, so none of it is shown rather than a shortened version. The rest of the lesson is not affected." />;
  }
  const image = isRecord(content.image) ? { mediaId: String(content.image.mediaId).trim(), altText: typeof content.image.altText === 'string' ? content.image.altText : '' } : null;

  return (
    <View style={{ gap: spacing.lg }}>
      {image ? <LessonImage lessonId={lessonId} level={level} content={image} /> : null}
      <Reveal offset={motion.offset.subtle} style={{ gap: spacing.md, paddingHorizontal: spacing.xs }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 40, height: 2, backgroundColor: colors.primary }} />
        {isText(content.title) ? (
          <AppText variant="sectionHeading" accessibilityRole="header">
            {content.title}
          </AppText>
        ) : null}
        {/* The author's text, a blank line starting a new paragraph (as the lesson introduction does), so a longer scene reads as paragraphs, not one block. */}
        <View style={{ gap: spacing.lg }}>
          {content.narrative
            .split(/\n\s*\n/)
            .map((paragraph) => paragraph.trim())
            .filter((paragraph) => paragraph.length > 0)
            .map((paragraph, index) => (
              <AppText key={index} variant="body" style={{ fontSize: 17, lineHeight: 28 }}>
                {paragraph}
              </AppText>
            ))}
        </View>
      </Reveal>
      <ScriptureLinks entries={content.scripture} presentation="standalone" />
    </View>
  );
}

/**
 * A MEDIA_ANIMATION block: an animated WebP, an MP4 video or a Lottie animation, by its `mediaType`. A block that is missing what it needs says so (only itself);
 * a type this version does not know is said plainly, never shown as a placeholder that pretends to play.
 */
export function AnimatedImageBlock({ lessonId, level, content, isVisible = true, appActive = true }: { lessonId: string; level: LearningLevel; content: Record<string, unknown>; isVisible?: boolean; appActive?: boolean }) {
  if (content.mediaType === 'YOUTUBE') {
    if (!isYouTubeVideoId(content.youtubeVideoId) || !isText(content.altText)) return <Note title="YouTube video is incomplete" message="Part of this block could not be read, so it is not shown. The rest of the lesson is not affected." />;
    return <YouTubeBlock lessonId={lessonId} level={level} content={content} isVisible={isVisible} appActive={appActive} />;
  }
  if (content.mediaType === 'VIDEO' || content.mediaType === 'LOTTIE') {
    if (!isText(content.mediaId) || !isText(content.altText) || (content.caption !== undefined && typeof content.caption !== 'string') || (content.description !== undefined && typeof content.description !== 'string') || (content.posterMediaId !== undefined && typeof content.posterMediaId !== 'string')) {
      return <Note title="Media is incomplete" message="Part of this block could not be read, so it is not shown. The rest of the lesson is not affected." />;
    }
    return content.mediaType === 'VIDEO' ? <VideoBlock lessonId={lessonId} level={level} content={content} appActive={appActive} /> : <LottieBlock lessonId={lessonId} level={level} content={content} isVisible={isVisible} appActive={appActive} />;
  }
  return <AnimatedWebpBlock lessonId={lessonId} level={level} content={content} isVisible={isVisible} appActive={appActive} />;
}

function AnimatedWebpBlock({ lessonId, level, content, isVisible, appActive }: { lessonId: string; level: LearningLevel; content: Record<string, unknown>; isVisible: boolean; appActive: boolean }) {
  const { spacing, colors, radius } = useTheme();
  const reduceMotion = useReduceMotion();
  // `null` means follow the visibility preference; an explicit Play or Pause temporarily overrides it until the block leaves view.
  const [manualPlaying, setManualPlaying] = useState<boolean | null>(null);
  const [ratio, setRatio] = useState(16 / 9);
  const [failed, setFailed] = useState(false);

  const mediaId = isText(content.mediaId) ? content.mediaId.trim() : '';
  const posterId = isText(content.posterMediaId) ? content.posterMediaId.trim() : '';
  const remote = mediaId ? lessonImageUrl(lessonId, mediaId, level) : null;
  const posterRemote = posterId ? lessonImageUrl(lessonId, posterId, level) : null;
  const uri = useAssetUri(mediaId, remote);
  const posterUri = useAssetUri(posterId, posterRemote);
  useEffect(() => {
    if (!appActive || !isVisible) setManualPlaying(null);
  }, [appActive, isVisible]);

  if (content.mediaType !== undefined && content.mediaType !== 'ANIMATED_IMAGE') {
    // A type this version of the app does not know (a newer one may): said plainly and without pretending, nothing is shown in its place and nothing is downloaded.
    return <Note variant="unsupported" title="Media not supported" message="This kind of media cannot be played in this version of the app yet. The rest of the lesson is not affected." />;
  }
  if ((content.mediaType !== undefined && content.mediaType !== 'ANIMATED_IMAGE') || !mediaId || !isText(content.altText) || (content.caption !== undefined && typeof content.caption !== 'string') || (content.description !== undefined && typeof content.description !== 'string')) {
    return <Note title="Animation is incomplete" message="Part of this block could not be read, so it is not shown. The rest of the lesson is not affected." />;
  }
  const alt = content.altText;
  const caption = typeof content.caption === 'string' && content.caption.trim() ? content.caption.trim() : '';
  const description = typeof content.description === 'string' && content.description.trim() ? content.description.trim() : '';
  const settings = mediaPlaybackSettings(content, 'ANIMATED_IMAGE');
  const playing = appActive && (manualPlaying ?? (!reduceMotion && settings.autoplayWhenVisible && isVisible));

  if (!uri || failed) {
    return (
      <View style={{ gap: spacing.sm }}>
        <BlockNotice
          variant="offline"
          title={`Animation: ${alt}`}
          message={
            canSaveImages()
              ? 'This animation is not saved on this device yet, or could not be loaded. It is saved when you open the lesson with an internet connection.'
              : 'This animation could not be loaded. Check your internet connection and try again. This browser cannot keep animations for offline use.'
          }
        />
        {uri ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Try loading the animation again" onPress={() => setFailed(false)} style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs }}>
            <AppText variant="label" color="primaryHighlight">
              Try again
            </AppText>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const showPoster = !playing && Boolean(posterUri);
  const shownUri = showPoster ? posterUri : uri;

  return (
    <Reveal offset={motion.offset.subtle} style={{ gap: spacing.sm }} accessible={false}>
      <View style={{ borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface, aspectRatio: ratio, width: '100%' }}>
        <Image
          key={showPoster ? `poster:${posterId}` : `file:${mediaId}`}
          source={{ uri: shownUri ?? undefined }}
          style={{ width: '100%', height: '100%' }}
          contentFit="contain"
          transition={reduceMotion ? 0 : motion.duration.selection}
          autoplay={playing}
          accessible
          accessibilityRole="image"
          accessibilityLabel={alt}
          onLoad={(event) => {
            const { width, height } = event.source;
            if (width > 0 && height > 0) setRatio(width / height);
          }}
          onError={() => {
            const shownId = showPoster ? posterId : mediaId;
            if (shownUri !== remote && shownUri !== posterRemote) reportBrokenAsset(shownId);
            else if (canSwitchToSavedWebCopy(shownId)) {
              void switchToSavedWebCopy(shownId).then((shown) => {
                if (!shown) setFailed(true);
              });
            } else setFailed(true);
          }}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause the animation' : 'Play the animation'}
        accessibilityState={{ selected: playing }}
        onPress={() => setManualPlaying(playing ? false : true)}
        style={({ pressed }) => ({
          alignSelf: 'flex-start',
          minHeight: 44,
          justifyContent: 'center',
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.borderGold,
          backgroundColor: pressed ? colors.surfaceElevated : colors.surface,
        })}>
        <AppText variant="label" color="primaryHighlight">
          {playing ? 'Pause animation' : 'Play animation'}
        </AppText>
      </Pressable>
      {reduceMotion ? (
        <AppText variant="bodySmall" color="textMuted">
          Your device is set to reduce motion. This animation plays only when you press Play.
        </AppText>
      ) : null}
      {caption ? (
        <AppText variant="bodySmall" color="textSecondary">
          {caption}
        </AppText>
      ) : null}
      {description ? <AppText variant="bodySmall" color="textSecondary">{description}</AppText> : null}
    </Reveal>
  );
}
