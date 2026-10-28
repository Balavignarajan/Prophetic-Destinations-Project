import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, type ImageLoadEventData, type NativeSyntheticEvent, StyleSheet, View } from 'react-native';

import { AppText, PrimaryButton, Reveal } from '@/components/ui';
import { canSwitchToSavedWebCopy, reportBrokenAsset, switchToSavedWebCopy, useAssetUri } from '@/features/offline/offline-media';
import { lessonImageUrl } from '@/learning/lesson-image';
import type { LearningLevel } from '@/learning/levels';
import { CubeIcon } from '@/learning/model-3d-ui';
import { type Model3DHotspot, Model3DViewer } from '@/learning/model-3d-viewer';
import { useTheme, withAlpha } from '@/theme';
import { motion } from '@/theme/motion';

/**
 * Renders a published INTERACTIVE_3D_MODEL block (backend/src/modules/lessons/domain/blocks/interactive-3d-model.ts; PROPOSED schema):
 *   { title?, mediaId (the GLB model), posterMediaId?, description?, hotspots?: [{ id, position?: { x, y, z }, label, explanation, scripture?: FROZEN passages }] }
 * The hotspots are the learner's level's: the server leaves out the ones reserved for other levels (and the `levels` field), so the app does no filtering of its own.
 *
 * IN THE LESSON the block is a discovery card: a dark, softly lit surface with a thin gold edge; at the top the optional poster (shown whole, on the card's own dark stage, fading into the card)
 * or, without one, a quiet emblem of a cube; then the small label "INTERACTIVE 3D EXPERIENCE", the title, one line of what to do, a note that it needs the internet, and the "Explore in 3D" button.
 * No WebGL scene, WebView or download of the model exists until the learner taps the button, so a lesson with several models costs nothing until one is opened. The poster is an ordinary lesson
 * image, shown from its saved copy when there is one. The author's description follows the card as lesson text.
 *
 * EXPLORING opens the real model in a full-screen viewer (model-3d-viewer.tsx). Only one viewer can be open at a time, and it is closed (and its WebView and graphics released) when the
 * lesson loses focus or the app goes to the background (`appActive` is both), when the learner closes it or presses Back, and when this block goes away. The model is requested from the learner
 * media route, which serves it only while it is in the published lesson at this level; it is online-only and never part of the lesson's saved images (see offline-assets.ts).
 *
 * A block with no title, no description and no poster still shows the emblem, the label and the button, so it is never blank. The rest of the lesson is unaffected whatever this block holds.
 */
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const MAX_HOTSPOTS = 30;

/** A point of the model from its published form, or null when it is missing or not a finite {x, y, z}. */
function readPosition(value: unknown): [number, number, number] | null {
  if (!isRecord(value)) return null;
  const { x, y, z } = value;
  return typeof x === 'number' && typeof y === 'number' && typeof z === 'number' && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? [x, y, z] : null;
}

/**
 * The hotspots of the published content, in the author's order, read defensively: an entry that is not an object, or repeats an id, is left out; a missing position leaves the hotspot in the
 * list (it can still be read) but without a marker. Text that is not text becomes empty. A block without hotspots, or with malformed ones, simply has none: the model is usable without them.
 */
function readHotspots(content: Record<string, unknown>): Model3DHotspot[] {
  if (!Array.isArray(content.hotspots)) return [];
  const seen = new Set<string>();
  const out: Model3DHotspot[] = [];
  content.hotspots.forEach((raw, index) => {
    if (!isRecord(raw) || out.length >= MAX_HOTSPOTS) return;
    const id = isText(raw.id) ? raw.id : `h-${index}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({
      id,
      label: typeof raw.label === 'string' ? raw.label : '',
      explanation: typeof raw.explanation === 'string' ? raw.explanation : '',
      scripture: raw.scripture,
      position: readPosition(raw.position),
    });
  });
  return out;
}

/** The block whose viewer is open, if any: opening another one closes it first, so there is never more than one 3D view alive. */
let closeActiveViewer: (() => void) | null = null;

export function Model3DBlock({ lessonId, level, content, appActive = true }: { lessonId: string; level: LearningLevel; content: Record<string, unknown>; appActive?: boolean }) {
  const { spacing, colors, radius, layout, shadows, gradients } = useTheme();
  const title = isText(content.title) ? content.title.trim() : '';
  const description = isText(content.description) ? content.description.trim() : '';
  const modelId = isText(content.mediaId) ? content.mediaId.trim() : '';
  const posterId = isText(content.posterMediaId) ? content.posterMediaId.trim() : '';
  const modelUrl = modelId ? lessonImageUrl(lessonId, modelId, level) : null;
  const posterRemote = posterId ? lessonImageUrl(lessonId, posterId, level) : null;
  const posterUri = useAssetUri(posterId, posterRemote);
  const [ratio, setRatio] = useState(16 / 9);
  const [posterFailed, setPosterFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const hotspots = useMemo(() => readHotspots(content), [content]);

  const close = useCallback(() => setOpen(false), []);
  const explore = useCallback(() => {
    closeActiveViewer?.();
    closeActiveViewer = close;
    setOpen(true);
  }, [close]);

  // The viewer does not outlive the lesson being in front: losing focus or leaving the foreground closes it.
  useEffect(() => {
    if (!appActive) setOpen(false);
  }, [appActive]);
  // And it does not outlive this block.
  useEffect(
    () => () => {
      if (closeActiveViewer === close) closeActiveViewer = null;
    },
    [close],
  );

  const onPosterLoad = (event: NativeSyntheticEvent<ImageLoadEventData>) => {
    const { width, height } = event.nativeEvent.source;
    if (width > 0 && height > 0) setRatio(width / height);
  };
  const onPosterError = () => {
    if (posterUri !== posterRemote) reportBrokenAsset(posterId);
    else if (canSwitchToSavedWebCopy(posterId)) {
      void switchToSavedWebCopy(posterId).then((shown) => {
        if (!shown) setPosterFailed(true);
      });
    } else setPosterFailed(true);
  };

  const showPoster = Boolean(posterUri) && !posterFailed;
  // The poster is shown whole; a very tall or very wide one is given a stage of a comfortable shape (it sits centred in it) rather than stretching the card.
  const stageRatio = Math.min(1.9, Math.max(1.15, ratio));
  const line = !modelUrl ? 'This 3D model is not available right now.' : hotspots.length > 0 ? 'Rotate, zoom and tap the numbered points to discover more.' : 'Rotate and zoom to look closer.';

  return (
    <Reveal offset={motion.offset.subtle} style={{ gap: spacing.md }} accessible={false}>
      <View style={[shadows.card, { borderRadius: radius.xl, borderWidth: layout.hairline, borderColor: colors.borderGold, backgroundColor: colors.surface }]}>
        <View style={{ borderRadius: radius.xl - layout.hairline, overflow: 'hidden' }}>
          <LinearGradient colors={[colors.surfaceElevated, colors.surface, colors.background]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />

          {/* The visual: the poster on the card's own dark stage, or a quiet emblem. Decorative apart from the poster's description. */}
          {showPoster ? (
            <View style={{ width: '100%', aspectRatio: stageRatio, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
              <Image
                source={{ uri: posterUri ?? undefined }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
                accessible
                accessibilityRole="image"
                accessibilityLabel={title ? `Poster of ${title}` : 'Poster of the 3D model'}
                onLoad={onPosterLoad}
                onError={onPosterError}
              />
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { top: '55%' }]}>
                <LinearGradient colors={[withAlpha(colors.surface, 0), colors.surface]} style={StyleSheet.absoluteFill} />
              </View>
              <View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  position: 'absolute',
                  top: spacing.md,
                  left: spacing.md,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.xs + 2,
                  paddingVertical: spacing.xs,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.pill,
                  borderWidth: layout.hairline,
                  borderColor: colors.borderGold,
                  backgroundColor: colors.scrim,
                }}>
                <CubeIcon size={14} color={colors.textOnImage} fill={colors.scrim} />
                <AppText variant="caption" color="textOnImage" style={{ fontWeight: '700', letterSpacing: 1 }}>
                  3D
                </AppText>
              </View>
            </View>
          ) : (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ height: 136, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
              <LinearGradient colors={gradients.goldGlow} style={StyleSheet.absoluteFill} />
              <View style={{ width: 104, height: 104, borderRadius: 52, borderWidth: layout.hairline, borderColor: colors.borderSubtle, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 80, height: 80, borderRadius: 40, borderWidth: layout.hairline, borderColor: colors.borderGold, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
                    <CubeIcon size={28} color={colors.primaryHighlight} fill={colors.surfaceElevated} />
                  </View>
                </View>
              </View>
            </View>
          )}

          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm }}>
            <AppText variant="caption" color="primaryHighlight" style={{ fontWeight: '700', letterSpacing: 1.6 }}>
              INTERACTIVE 3D EXPERIENCE
            </AppText>
            {title ? (
              <AppText variant="sectionHeading" accessibilityRole="header" style={{ fontSize: 22, lineHeight: 30 }}>
                {title}
              </AppText>
            ) : null}
            <AppText variant="bodySmall" color="textSecondary">
              {line}
            </AppText>
            {modelUrl ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
                <AppText variant="caption" color="textMuted">
                  Needs an internet connection
                </AppText>
              </View>
            ) : null}
            {modelUrl ? (
              <PrimaryButton
                label="Explore in 3D"
                size="large"
                onPress={explore}
                accessibilityHint="Opens the model in a full-screen 3D view. Drag to rotate and pinch to zoom."
                style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
              />
            ) : null}
          </View>
        </View>
      </View>
      {description ? (
        <AppText variant="body" style={{ fontSize: 16, lineHeight: 26 }}>
          {description}
        </AppText>
      ) : null}
      {open && modelUrl ? <Model3DViewer title={title} modelUrl={modelUrl} posterUri={posterFailed ? null : posterUri} hotspots={hotspots} onClose={close} /> : null}
    </Reveal>
  );
}
