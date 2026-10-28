import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, type ImageLoadEventData, type NativeSyntheticEvent, View } from 'react-native';

import { AppText, PrimaryButton, Reveal } from '@/components/ui';
import { canSwitchToSavedWebCopy, reportBrokenAsset, switchToSavedWebCopy, useAssetUri } from '@/features/offline/offline-media';
import { lessonImageUrl } from '@/learning/lesson-image';
import type { LearningLevel } from '@/learning/levels';
import { type Model3DHotspot, Model3DViewer } from '@/learning/model-3d-viewer';
import { useTheme } from '@/theme';
import { motion } from '@/theme/motion';

/**
 * Renders a published INTERACTIVE_3D_MODEL block (backend/src/modules/lessons/domain/blocks/interactive-3d-model.ts; PROPOSED schema):
 *   { title?, mediaId (the GLB model), posterMediaId?, description?, hotspots?: [{ id, position?: { x, y, z }, label, explanation, scripture?: FROZEN passages }] }
 * The hotspots are the learner's level's: the server leaves out the ones reserved for other levels (and the `levels` field), so the app does no filtering of its own.
 *
 * IN THE LESSON the block is light: the optional poster, a cube, the title, the description and an "Explore in 3D" button. No WebGL scene, WebView or download of the model exists until the
 * learner taps it, so a lesson with several models costs nothing until one is opened. The poster is an ordinary lesson image, shown from its saved copy when there is one.
 *
 * EXPLORING opens the real model in a full-screen viewer (model-3d-viewer.tsx). Only one viewer can be open at a time, and it is closed (and its WebView and graphics released) when the
 * lesson loses focus or the app goes to the background (`appActive` is both), when the learner closes it or presses Back, and when this block goes away. The model is requested from the learner
 * media route, which serves it only while it is in the published lesson at this level; it is online-only and never part of the lesson's saved images (see offline-assets.ts).
 *
 * A block with no title, no description and no poster still shows the cube and the button, so it is never blank. The rest of the lesson is unaffected whatever this block holds.
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

/**
 * A small wireframe cube drawn with views (the app uses no icon font): a back square, a front square that hides the back one's covered edges, and three edges joining them.
 * Decorative: hidden from screen readers.
 */
function CubeIcon({ size, color, fill }: { size: number; color: string; fill: string }) {
  const stroke = 2;
  const depth = Math.round(size * 0.3);
  const side = size - depth;
  const diagonal = Math.round(depth * Math.SQRT2);
  // One edge from the front square to the back square, centred on (x, y), rising to the right.
  const edge = (x: number, y: number) => ({ position: 'absolute' as const, left: x - diagonal / 2, top: y - stroke / 2, width: diagonal, height: stroke, backgroundColor: color, transform: [{ rotate: '-45deg' }] });
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', left: depth, top: 0, width: side, height: side, borderWidth: stroke, borderColor: color }} />
      <View style={edge(depth / 2, depth / 2)} />
      <View style={edge(side + depth / 2, depth / 2)} />
      <View style={edge(side + depth / 2, side + depth / 2)} />
      <View style={{ position: 'absolute', left: 0, top: depth, width: side, height: side, borderWidth: stroke, borderColor: color, backgroundColor: fill }} />
    </View>
  );
}

export function Model3DBlock({ lessonId, level, content, appActive = true }: { lessonId: string; level: LearningLevel; content: Record<string, unknown>; appActive?: boolean }) {
  const { spacing, colors, radius, layout } = useTheme();
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

  return (
    <Reveal offset={motion.offset.subtle} style={{ gap: spacing.md }} accessible={false}>
      {/* The poster is optional: if it is not there or cannot be shown, the card below stands alone. */}
      {posterUri && !posterFailed ? (
        <View style={{ width: '100%', aspectRatio: ratio, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface }}>
          <Image
            source={{ uri: posterUri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="contain"
            accessible
            accessibilityRole="image"
            accessibilityLabel={title ? `Poster of ${title}` : 'Poster of the 3D model'}
            onLoad={onPosterLoad}
            onError={onPosterError}
          />
        </View>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.lg,
          borderRadius: radius.lg,
          borderWidth: layout.hairline,
          borderColor: colors.borderGold,
          backgroundColor: colors.surface,
        }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            borderWidth: layout.hairline,
            borderColor: colors.borderGold,
            backgroundColor: colors.surfaceElevated,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <CubeIcon size={30} color={colors.primaryHighlight} fill={colors.surfaceElevated} />
        </View>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText variant="caption" color="primaryHighlight" style={{ fontWeight: '700', letterSpacing: 1 }}>
            3D MODEL
          </AppText>
          {title ? (
            <AppText variant="heading" accessibilityRole="header">
              {title}
            </AppText>
          ) : null}
          <AppText variant="bodySmall" color="textSecondary">
            {modelUrl
              ? hotspots.length > 0
                ? 'Turn it, zoom in and tap the numbered points to learn more. Needs an internet connection.'
                : 'Turn it, zoom in and look closer. Needs an internet connection.'
              : 'This 3D model is not available right now.'}
          </AppText>
        </View>
      </View>
      {description ? (
        <AppText variant="body" style={{ fontSize: 16, lineHeight: 26 }}>
          {description}
        </AppText>
      ) : null}
      {modelUrl ? (
        <PrimaryButton
          label="Explore in 3D"
          size="medium"
          onPress={explore}
          accessibilityHint="Opens the model in a full-screen 3D view. Drag to rotate and pinch to zoom."
          style={{ alignSelf: 'flex-start' }}
        />
      ) : null}
      {open && modelUrl ? <Model3DViewer title={title} modelUrl={modelUrl} posterUri={posterFailed ? null : posterUri} hotspots={hotspots} onClose={close} /> : null}
    </Reveal>
  );
}
