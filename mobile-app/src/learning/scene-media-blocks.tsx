import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, BlockNotice } from '@/components/ui';
import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { reportBrokenAsset, useAssetUri } from '@/features/offline/offline-media';
import { LessonImage, lessonImageUrl } from '@/learning/lesson-image';
import type { LearningLevel } from '@/learning/levels';
import { ScriptureLinks } from '@/learning/scripture-links';
import { useTheme } from '@/theme';

/**
 * Renders published NARRATIVE_SCENE and MEDIA_ANIMATION blocks (backend/src/modules/lessons/domain/blocks/scene-media.ts; PROPOSED schemas):
 *   NARRATIVE_SCENE: { title?, image?: { mediaId, altText }, narrative, scripture?: FROZEN passages }
 *   MEDIA_ANIMATION: { mediaType: 'ANIMATED_IMAGE', mediaId, posterMediaId?, caption?, altText }
 *
 * NARRATIVE_SCENE is a still composition: the visual (the shared image component, saved copy first), the title as a heading, the author's narrative and
 * the frozen Scripture apart from it. The workbook's "predefined transition/effect" has no defined values (D8), so no motion is applied.
 *
 * MEDIA_ANIMATION plays ONLY animated WebP, with expo-image (already installed). Video and Lottie have no player installed and are shown as
 * "not supported in this version" instead of a placeholder that pretends to play. Nothing autoplays and there is no audio: the learner presses Play
 * (also when the device asks to reduce motion). Before Play the poster is shown, or the first frame if there is none; Stop returns to that. The animated
 * file and the poster are saved for offline use through the normal lesson asset list (a lesson is not "saved" while either is missing). If a block is
 * incomplete or malformed only that block says so; the rest of the lesson is unaffected.
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
      <View style={{ gap: spacing.md, paddingHorizontal: spacing.xs }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 40, height: 2, backgroundColor: colors.primary }} />
        {isText(content.title) ? (
          <AppText variant="sectionHeading" accessibilityRole="header">
            {content.title}
          </AppText>
        ) : null}
        <AppText variant="body" style={{ fontSize: 17, lineHeight: 28 }}>
          {content.narrative}
        </AppText>
      </View>
      <ScriptureLinks entries={content.scripture} />
    </View>
  );
}

export function AnimatedImageBlock({ lessonId, level, content }: { lessonId: string; level: LearningLevel; content: Record<string, unknown> }) {
  const { spacing, colors, radius } = useTheme();
  const reduceMotion = useReduceMotion();
  const [playing, setPlaying] = useState(false);
  const [ratio, setRatio] = useState(16 / 9);
  const [failed, setFailed] = useState(false);

  const mediaId = isText(content.mediaId) ? content.mediaId.trim() : '';
  const posterId = isText(content.posterMediaId) ? content.posterMediaId.trim() : '';
  const remote = mediaId ? lessonImageUrl(lessonId, mediaId, level) : null;
  const posterRemote = posterId ? lessonImageUrl(lessonId, posterId, level) : null;
  const uri = useAssetUri(mediaId, remote);
  const posterUri = useAssetUri(posterId, posterRemote);

  if (content.mediaType !== undefined && content.mediaType !== 'ANIMATED_IMAGE') {
    return <Note variant="unsupported" title="Animation not supported" message="This kind of animation (video or Lottie) cannot be played in this version of the app. The rest of the lesson is not affected." />;
  }
  if (content.mediaType !== 'ANIMATED_IMAGE' || !mediaId || !isText(content.altText) || (content.caption !== undefined && typeof content.caption !== 'string')) {
    return <Note title="Animation is incomplete" message="Part of this block could not be read, so it is not shown. The rest of the lesson is not affected." />;
  }
  const alt = content.altText;
  const caption = typeof content.caption === 'string' && content.caption.trim() ? content.caption.trim() : '';

  if (!uri || failed) {
    return (
      <View style={{ gap: spacing.sm }}>
        <BlockNotice
          variant="offline"
          title={`Animation: ${alt}`}
          message="This animation is not saved on this device yet, or could not be loaded. It is saved when you open the lesson with an internet connection."
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
    <View style={{ gap: spacing.sm }} accessible={false}>
      <View style={{ borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface, aspectRatio: ratio, width: '100%' }}>
        <Image
          key={`${playing ? 'play' : 'still'}:${showPoster ? 'poster' : 'file'}`}
          source={{ uri: shownUri ?? undefined }}
          style={{ width: '100%', height: '100%' }}
          contentFit="contain"
          autoplay={playing}
          accessible
          accessibilityRole="image"
          accessibilityLabel={alt}
          onLoad={(event) => {
            const { width, height } = event.source;
            if (width > 0 && height > 0) setRatio(width / height);
          }}
          onError={() => {
            if (shownUri !== remote && shownUri !== posterRemote) reportBrokenAsset(showPoster ? posterId : mediaId);
            else setFailed(true);
          }}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Stop the animation' : 'Play the animation'}
        accessibilityState={{ selected: playing }}
        onPress={() => setPlaying((p) => !p)}
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
          {playing ? 'Stop animation' : 'Play animation'}
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
    </View>
  );
}
