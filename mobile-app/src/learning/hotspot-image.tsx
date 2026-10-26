import { type ReactNode, memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Image,
  type ImageLoadEventData,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  View,
  findNodeHandle,
  useWindowDimensions,
} from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { AppText, BlockNotice } from '@/components/ui';
import { canSwitchToSavedWebCopy, reportBrokenAsset, switchToSavedWebCopy, useAssetUri } from '@/features/offline/offline-media';
import { lessonImageUrl } from '@/learning/lesson-image';
import { ScriptureLinks } from '@/learning/scripture-links';
import type { LearningLevel } from '@/learning/levels';
import { useTheme } from '@/theme';
import { NATIVE_DRIVER, motion } from '@/theme/motion';

/**
 * Renders a published INTERACTIVE_IMAGE block (backend/src/modules/lessons/domain/blocks/interactive-image.ts; PROPOSED schema):
 *   { mediaId, altText, caption?, source?, hotspots: [{ id, x, y, label, explanation, scripture? }] }
 * `x`/`y` are fractions of the WHOLE image, and the data format is exactly what it always was (nothing is read or written differently).
 *
 * THE IMAGE. It is shown whole, never cropped, in a box that has exactly the picture's own aspect ratio (taken from the loaded image), so the box IS the displayed image and the
 * percentage positions land on the right spot at any size. A very tall picture (the Daniel 2 statue) would otherwise be taller than the screen, so the box is also limited to a share of
 * the window's height and is made narrower (centred) to keep its ratio: the whole picture, head to feet, fits on screen. Markers are drawn on the box without clipping, only once
 * the image has loaded.
 *
 * THE EXPLANATION. Choosing a marker (or a row of the list) opens one panel with that hotspot's number ("2 of 5"), title, explanation (paragraphs) and Scripture, with Previous / Next /
 * Close. Choosing another hotspot replaces the content of the same panel. Where the block is wide enough (judged from the block's own measured width, not the device) the panel
 * sits to the right of the image; otherwise it opens directly under the image, in the reading flow, and the lesson scrolls to it. Closing it scrolls back to the image if the image
 * had scrolled away, and returns screen-reader focus to the marker.
 *
 * THE LIST under the picture is the accessible equivalent of the markers (and the way to reach hotspots whose markers overlap). If the image cannot be shown (not saved, offline, failed) the list
 * stays and every explanation is read from it, so nothing is lost. The image comes from the saved offline copy when there is one, otherwise from the learner media route.
 * With `variant="map"` the same renderer shows a published MAP block (backend map-explore.ts): the same content plus an optional `title`, the markers are optional (a map may be just the
 * image, with its description and caption as the text equivalent), and the wording says "marker".
 * A hotspot's Scripture (frozen passages) is shown in its panel as part of the explanation, not behind a second tap: opening the hotspot is the choice.
 */
type Hotspot = { id: string; x: number | null; y: number | null; label: string; explanation: string; scripture: unknown };

const asText = (value: unknown) => (typeof value === 'string' ? value : '');
const fraction = (value: unknown) => (typeof value === 'number' && value >= 0 && value <= 1 ? value : null);

function readHotspots(content: Record<string, unknown>): Hotspot[] {
  if (!Array.isArray(content.hotspots)) return [];
  const seen = new Set<string>();
  const out: Hotspot[] = [];
  content.hotspots.forEach((raw, index) => {
    if (typeof raw !== 'object' || raw === null) return;
    const h = raw as Record<string, unknown>;
    const id = asText(h.id) || `h-${index}`;
    if (seen.has(id)) return;
    seen.add(id);
    const x = fraction(h.x);
    const y = fraction(h.y);
    out.push({ id, x: x !== null && y !== null ? x : null, y: x !== null && y !== null ? y : null, label: asText(h.label), explanation: asText(h.explanation), scripture: h.scripture });
  });
  return out;
}

const HIT = 44;
const DOT = 30;
/** The block is laid out in two columns (image, then explanation) when it is at least this wide. It is the block's own measured width, so it works the same on a tablet and on a landscape phone. */
const WIDE_MIN_WIDTH = 480;
/** How much of the window's height the image may take, so the whole picture fits on screen. */
const IMAGE_HEIGHT_SHARE = { stacked: 0.7, wide: 0.82 } as const;
/** The image's share of the block's width when the explanation is beside it. */
const IMAGE_WIDTH_SHARE = 0.55;
const NEWLINE = String.fromCharCode(10);

/**
 * One numbered marker on the picture. It keeps the dark halo, so it is visible on any image. When it becomes the selected one its dot settles from a slightly smaller size and a bright gold
 * ring fades in around it; when it is deselected the ring fades out. The selected state is also carried by the larger, brighter dot, the thicker light border and the accessibility
 * state, so nothing depends on the motion or on colour alone. While another hotspot is open the rest are a little quieter. Opacity and scale only; the position and the size of the touch
 * area are exactly as the saved coordinates say. It is memoised: choosing one hotspot does not redraw the others' animations.
 */
const HotspotMarker = memo(function HotspotMarker({
  id,
  x,
  y,
  number,
  label,
  selected,
  dimmed,
  onPress,
  register,
}: {
  id: string;
  x: number;
  y: number;
  number: number;
  label: string;
  selected: boolean;
  dimmed: boolean;
  onPress: (id: string) => void;
  register: (id: string, node: View | null) => void;
}) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const [ring] = useState(() => new Animated.Value(selected ? 1 : 0));
  const [settle] = useState(() => new Animated.Value(1));
  const mounted = useRef(false);
  const setNode = useCallback((node: View | null) => register(id, node), [id, register]);
  const press = useCallback(() => onPress(id), [id, onPress]);

  useEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    if (reduce) {
      ring.setValue(selected ? 1 : 0);
      settle.setValue(1);
      return;
    }
    settle.setValue(selected && !first ? 0.94 : 1);
    const animation = Animated.parallel([
      Animated.timing(ring, { toValue: selected ? 1 : 0, duration: motion.duration.selection, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER }),
      Animated.timing(settle, { toValue: 1, duration: motion.duration.selection, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [selected, reduce, ring, settle]);

  const dot = selected ? DOT + 4 : DOT;
  return (
    <Pressable
      ref={setNode}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={press}
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: HIT,
        height: HIT,
        marginLeft: -HIT / 2,
        marginTop: -HIT / 2,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: dimmed ? 0.82 : 1,
      }}>
      {/* a dark halo keeps the marker visible on any picture; the selected marker is larger, brighter and ringed */}
      <View style={{ width: DOT + 10, height: DOT + 10, borderRadius: (DOT + 10) / 2, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={{
            position: 'absolute',
            width: DOT + 10,
            height: DOT + 10,
            borderRadius: (DOT + 10) / 2,
            borderWidth: 2,
            borderColor: colors.primaryHighlight,
            opacity: ring,
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
          }}
        />
        <Animated.View
          style={{
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            borderWidth: selected ? 3 : 2,
            borderColor: selected ? colors.textOnImage : colors.borderGold,
            backgroundColor: selected ? colors.primaryHighlight : colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: settle }],
          }}>
          <AppText variant="caption" color="onPrimary" style={{ fontWeight: '700' }} allowFontScaling={false}>
            {number}
          </AppText>
        </Animated.View>
      </View>
    </Pressable>
  );
});

/** A small round button of the panel (previous, next, close): a 44-point touch target, named for screen readers, quieter when it cannot be used. */
function PanelButton({ glyph, label, disabled = false, onPress }: { glyph: string; label: string; disabled?: boolean; onPress: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: HIT,
        height: HIT,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: disabled ? colors.borderSubtle : colors.borderGold,
        backgroundColor: pressed ? colors.surfaceElevated : colors.transparent,
        opacity: disabled ? 0.4 : 1,
      })}>
      <AppText variant="heading" color={disabled ? 'textMuted' : 'primaryHighlight'} allowFontScaling={false} style={{ lineHeight: 26 }}>
        {glyph}
      </AppText>
    </Pressable>
  );
}

/**
 * The explanation of the chosen hotspot. Its parts are plain and readable at any text size: nothing here has a fixed height, so a long explanation simply makes the panel taller
 * (the lesson, not the panel, scrolls).
 */
function HotspotPanelBody({
  noun,
  hotspot,
  index,
  total,
  onPrevious,
  onNext,
  onClose,
}: {
  noun: string;
  hotspot: Hotspot;
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const { spacing, colors, radius } = useTheme();
  const paragraphs = hotspot.explanation
    .split(NEWLINE)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return (
    <View
      style={{
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.borderGold,
        backgroundColor: colors.surfaceElevated,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 }}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant="caption" color="onPrimary" style={{ fontWeight: '700' }} allowFontScaling={false}>
              {index + 1}
            </AppText>
          </View>
          <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700', flexShrink: 1 }}>
            {noun} {index + 1} of {total}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <PanelButton glyph="‹" label={`Previous ${noun.toLowerCase()}`} disabled={index === 0} onPress={onPrevious} />
          <PanelButton glyph="›" label={`Next ${noun.toLowerCase()}`} disabled={index >= total - 1} onPress={onNext} />
          <PanelButton glyph="✕" label={`Close ${noun.toLowerCase()} details`} onPress={onClose} />
        </View>
      </View>

      <AppText variant="heading" accessibilityRole="header">
        {hotspot.label || noun}
      </AppText>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 40, height: 2, backgroundColor: colors.primary }} />

      {paragraphs.map((paragraph, i) => (
        <AppText key={i} variant="body" style={{ fontSize: 16, lineHeight: 26 }}>
          {paragraph}
        </AppText>
      ))}

      <ScriptureLinks entries={hotspot.scripture} presentation="inline" />
    </View>
  );
}

/**
 * Holds the panel's place and animates it: it eases in when a hotspot is first chosen, gives a soft pulse when another one replaces its content (the same panel, never a second one), and eases
 * out when it is closed before it leaves. Opacity and a small lift only, on the native driver; with Reduce Motion it just appears and disappears. `fallback` is what stands in while
 * nothing is open (the side-by-side layout keeps the column filled; the stacked layout passes nothing).
 */
function PanelPresence({
  item,
  render,
  onLayout,
  fallback = null,
}: {
  item: Hotspot | null;
  render: (item: Hotspot, closing: boolean) => ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
  fallback?: ReactNode;
}) {
  const reduce = useReduceMotion();
  const [shown, setShown] = useState<Hotspot | null>(item);
  const [progress] = useState(() => new Animated.Value(item ? 1 : 0));
  const lastId = useRef<string | null>(item ? item.id : null);
  const itemId = item ? item.id : null;

  useEffect(() => {
    if (item) {
      const opening = lastId.current === null;
      const switching = lastId.current !== null && lastId.current !== item.id;
      lastId.current = item.id;
      setShown(item);
      if (reduce) {
        progress.setValue(1);
        return;
      }
      if (opening) progress.setValue(0);
      else if (switching) progress.setValue(0.45);
      const animation = Animated.timing(progress, {
        toValue: 1,
        duration: opening ? motion.duration.reveal : motion.duration.selection,
        easing: motion.easing.standard,
        useNativeDriver: NATIVE_DRIVER,
      });
      animation.start();
      return () => animation.stop();
    }
    lastId.current = null;
    if (reduce || shown === null) {
      progress.setValue(0);
      setShown(null);
      return;
    }
    const animation = Animated.timing(progress, { toValue: 0, duration: motion.duration.buttonRelease, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER });
    animation.start(({ finished }) => {
      if (finished) setShown(null);
    });
    return () => animation.stop();
    // `item` is read only to show it; the animation follows which hotspot is chosen, not the object's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, reduce, progress]);

  const display = item ?? shown;
  if (!display) return <>{fallback}</>;
  return (
    <Animated.View
      onLayout={onLayout}
      accessibilityLiveRegion={item ? 'polite' : 'none'}
      accessibilityElementsHidden={!item}
      importantForAccessibility={item ? 'auto' : 'no-hide-descendants'}
      style={{ opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [motion.offset.reveal, 0] }) }] }}>
      {render(display, item === null)}
    </Animated.View>
  );
}

export function HotspotImage({
  lessonId,
  level,
  content,
  variant = 'interactive',
  onReveal,
}: {
  lessonId: string;
  level: LearningLevel;
  content: Record<string, unknown>;
  variant?: 'interactive' | 'map';
  /** Asks the lesson reader to scroll so a part of this block (at `localY`, `height`, measured inside this block) is on screen. Only called when an item is chosen or closed, and only when the panel sits under the image. */
  onReveal?: (localY: number, height: number) => void;
}) {
  const { spacing, colors, radius } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const isMap = variant === 'map';
  const noun = isMap ? 'Marker' : 'Hotspot';
  const title = isMap ? asText(content.title).trim() : '';
  const mediaId = asText(content.mediaId);
  const alt = asText(content.altText);
  const caption = asText(content.caption);
  const source = asText(content.source);
  const hotspots = readHotspots(content);

  const remoteUri = mediaId ? lessonImageUrl(lessonId, mediaId, level) : null;
  const uri = useAssetUri(mediaId, remoteUri);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [ratio, setRatio] = useState(16 / 9);
  const [selected, setSelected] = useState<string | null>(null);
  const [blockWidth, setBlockWidth] = useState(0);

  const onLoad = (event: NativeSyntheticEvent<ImageLoadEventData>) => {
    const { width, height } = event.nativeEvent.source;
    if (width > 0 && height > 0) setRatio(width / height);
    setStatus('ready');
  };

  const imageFailed = !uri || status === 'failed';
  const wide = blockWidth >= WIDE_MIN_WIDTH;
  // The picture's box: its own aspect ratio, as wide as the space allows but never taller than its share of the window, so the whole picture is on screen.
  const available = blockWidth > 0 ? (wide ? Math.floor((blockWidth - spacing.lg) * IMAGE_WIDTH_SHARE) : blockWidth) : 0;
  const maxHeight = Math.max(240, windowHeight * (wide ? IMAGE_HEIGHT_SHARE.wide : IMAGE_HEIGHT_SHARE.stacked));
  const boxWidth = available > 0 ? Math.min(available, Math.floor(maxHeight * ratio)) : 0;

  // Selection is read through refs by the stable handlers below, so the markers (memoised) do not redraw when only the panel changes.
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;
  const wideRef = useRef(wide);
  wideRef.current = wide;
  const imageFailedRef = useRef(imageFailed);
  imageFailedRef.current = imageFailed;
  const panelBox = useRef<{ y: number; height: number } | null>(null);
  const imageBox = useRef<{ y: number; height: number } | null>(null);
  const revealPending = useRef(false);
  const markerNodes = useRef(new Map<string, View>());

  const registerMarker = useCallback((id: string, node: View | null) => {
    if (node) markerNodes.current.set(id, node);
    else markerNodes.current.delete(id);
  }, []);
  const focusMarker = useCallback((id: string | null) => {
    if (!id || Platform.OS === 'web') return;
    try {
      const node = markerNodes.current.get(id);
      const tag = node ? findNodeHandle(node) : null;
      if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
    } catch {
      // moving screen-reader focus is a courtesy; failing to do so never matters
    }
  }, []);

  const choose = useCallback(
    (id: string) => {
      const selecting = selectedRef.current !== id;
      setSelected(selecting ? id : null);
      if (wideRef.current || imageFailedRef.current) return; // beside the picture (or listed in the rows): nothing to scroll to
      if (!selecting) {
        revealPending.current = false;
        return;
      }
      revealPending.current = true; // the panel is about to appear, or to change height: reveal it once it has been laid out
      const box = panelBox.current;
      if (box) requestAnimationFrame(() => onReveal?.(box.y, box.height));
      setTimeout(() => {
        revealPending.current = false;
      }, 400);
    },
    [onReveal],
  );
  const close = useCallback(() => {
    const id = selectedRef.current;
    setSelected(null);
    revealPending.current = false;
    const image = imageBox.current;
    // The learner may have scrolled down to read: bring the picture back into view (nothing moves when it already is).
    if (!wideRef.current && image) requestAnimationFrame(() => onReveal?.(image.y, image.height));
    setTimeout(() => focusMarker(id), 60);
  }, [onReveal, focusMarker]);

  // The picture and the list share ONE selection. With the picture shown, the chosen item opens in the panel; when the picture cannot be shown, every explanation is read straight from the list.
  const active = imageFailed ? null : (hotspots.find((h) => h.id === selected) ?? null);
  const hasMarkers = hotspots.some((h) => h.x !== null && h.y !== null);
  const hasActive = active !== null;
  useEffect(() => {
    if (!hasActive) {
      panelBox.current = null;
      revealPending.current = false;
    }
  }, [hasActive]);

  const go = useCallback(
    (delta: -1 | 1) => {
      const index = hotspots.findIndex((h) => h.id === selectedRef.current);
      const next = index >= 0 ? hotspots[index + delta] : undefined;
      if (next) choose(next.id);
    },
    [hotspots, choose],
  );

  const onPanelLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { y, height } = event.nativeEvent.layout;
      panelBox.current = { y, height };
      if (revealPending.current && !wideRef.current) {
        revealPending.current = false;
        onReveal?.(y, height);
      }
    },
    [onReveal],
  );

  const renderPanel = (item: Hotspot) => (
    <HotspotPanelBody noun={noun} hotspot={item} index={hotspots.indexOf(item)} total={hotspots.length} onPrevious={() => go(-1)} onNext={() => go(1)} onClose={close} />
  );

  const hint =
    !imageFailed && hasMarkers ? (
      <AppText variant="bodySmall" color="textMuted">
        Tap a numbered {noun.toLowerCase()} on the image, or choose one from the list.
      </AppText>
    ) : null;

  const picture = (
    <View
      onLayout={(event) => {
        const { y, height } = event.nativeEvent.layout;
        imageBox.current = { y, height };
      }}
      style={{ width: boxWidth > 0 ? boxWidth : '100%', alignSelf: wide ? 'flex-start' : 'center' }}>
      <View style={{ width: '100%', aspectRatio: ratio, borderRadius: radius.lg, backgroundColor: status === 'ready' ? colors.surface : colors.surfaceElevated }}>
        <Image
          source={{ uri }}
          style={{ width: '100%', height: '100%', borderRadius: radius.lg }}
          resizeMode="contain"
          accessible
          accessibilityRole="image"
          accessibilityLabel={alt || caption || (isMap ? 'Map or diagram' : 'Interactive image')}
          onLoad={onLoad}
          onError={() => {
            if (uri !== remoteUri) reportBrokenAsset(mediaId);
            else if (canSwitchToSavedWebCopy(mediaId)) {
              void switchToSavedWebCopy(mediaId).then((shown) => {
                if (!shown) setStatus('failed');
              });
            } else setStatus('failed');
          }}
        />
        {status === 'ready'
          ? hotspots.map((h, index) =>
              h.x === null || h.y === null ? null : (
                <HotspotMarker
                  key={h.id}
                  id={h.id}
                  x={h.x}
                  y={h.y}
                  number={index + 1}
                  label={`${noun} ${index + 1}: ${h.label || 'no label'}`}
                  selected={selected === h.id}
                  dimmed={selected !== null && selected !== h.id}
                  onPress={choose}
                  register={registerMarker}
                />
              ),
            )
          : null}
        {status === 'loading' ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <ActivityIndicator color={colors.textMuted} />
          </View>
        ) : null}
      </View>
    </View>
  );

  // Side by side, the column next to the picture is never empty: it invites a tap until a hotspot is open.
  const prompt = (
    <View style={{ gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface }}>
      <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700' }}>
        {isMap ? 'Explore the map' : 'Explore the image'}
      </AppText>
      <AppText variant="body" color="textSecondary">
        {hasMarkers ? `Tap a numbered ${noun.toLowerCase()} on the image to read about it here.` : `Choose a ${noun.toLowerCase()} from the list below.`}
      </AppText>
    </View>
  );

  return (
    <View style={{ gap: spacing.md }} accessible={false} onLayout={(event: LayoutChangeEvent) => setBlockWidth(Math.round(event.nativeEvent.layout.width))}>
      {title ? (
        <AppText variant="sectionHeading" accessibilityRole="header">
          {title}
        </AppText>
      ) : null}
      {imageFailed ? (
        <BlockNotice
          variant="offline"
          title={alt ? `${isMap ? 'Map or diagram' : 'Image'}: ${alt}` : `${isMap ? 'A map or diagram' : 'An image'} belongs here, but it could not be shown.`}
          message={`${hotspots.length > 0 ? `The ${noun.toLowerCase()}s are listed below. ` : ''}The image is shown when it is saved on this device or you are online.`}
        />
      ) : wide ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg }}>
          {picture}
          <View style={{ flex: 1, minWidth: 0 }}>
            <PanelPresence item={active} render={renderPanel} fallback={prompt} />
          </View>
        </View>
      ) : (
        <>
          {picture}
          {hint}
          <PanelPresence item={active} render={renderPanel} onLayout={onPanelLayout} />
        </>
      )}

      {/* The hotspots are the ones the server resolved for this level; if none is meant for it the picture stands alone, and says so (a map may simply be an image). */}
      {!isMap && hotspots.length === 0 ? (
        <AppText variant="bodySmall" color="textMuted">
          There are no hotspots on this image at your level.
        </AppText>
      ) : null}

      {hotspots.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          {hotspots.map((h, index) => {
            const open = imageFailed || selected === h.id;
            return (
              <View
                key={h.id}
                style={{
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: open ? colors.borderGold : colors.borderSubtle,
                  backgroundColor: selected === h.id ? colors.surfaceElevated : colors.surface,
                }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${noun} ${index + 1}: ${h.label || 'no label'}`}
                  accessibilityState={{ expanded: open, selected: selected === h.id }}
                  onPress={() => choose(h.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: 52 }}>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: colors.borderGold,
                      backgroundColor: selected === h.id ? colors.primary : colors.transparent,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <AppText variant="caption" color={selected === h.id ? 'onPrimary' : 'primaryHighlight'} style={{ fontWeight: '700' }} allowFontScaling={false}>
                      {index + 1}
                    </AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="body" style={{ fontWeight: selected === h.id ? '700' : '500' }}>
                      {h.label || noun}
                    </AppText>
                  </View>
                </Pressable>
                {imageFailed && (h.explanation || h.scripture) ? (
                  <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm }} accessibilityLiveRegion="polite">
                    <AppText variant="body" color="textSecondary" style={{ fontSize: 16, lineHeight: 25 }}>
                      {h.explanation}
                    </AppText>
                    <ScriptureLinks entries={h.scripture} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

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
    </View>
  );
}
