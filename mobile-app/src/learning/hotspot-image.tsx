import { useFocusEffect } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
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
  StyleSheet,
  View,
  findNodeHandle,
  useWindowDimensions,
} from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { AppText, BlockNotice } from '@/components/ui';
import { canSwitchToSavedWebCopy, reportBrokenAsset, switchToSavedWebCopy, useAssetUri } from '@/features/offline/offline-media';
import { HotspotContent, HotspotNavigator, HotspotSidePanel, HotspotTopBar } from '@/learning/hotspot-explanation';
import { FloatingHotspotLabel } from '@/learning/hotspot-label';
import { HotspotSheet } from '@/learning/hotspot-sheet';
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
 * THE IMAGE. It is shown whole, never cropped, in a box that has exactly the picture's own aspect ratio (taken from the loaded image), so the box IS the displayed image and the percentage
 * positions land on the right spot at any size. A very tall picture (the Daniel 2 statue) is also limited to a share of the window's height (the box gets narrower, centred) so the whole
 * picture, head to feet, fits on screen. The frame is a hairline that turns gold only while the learner is exploring; it is drawn over the picture, so it takes no room and cannot shift a marker.
 * When the picture first loads it fades in with a very small lift, once. Markers are only drawn once the image has loaded, and are not clipped at the edges.
 *
 * THE EXPLANATION. Choosing a numbered point opens that hotspot's explanation:
 *  - on a PHONE (the block is narrow) in a floating bottom sheet over the lesson (hotspot-sheet.tsx). The lesson itself is not scrolled, resized or interrupted, and closing the sheet puts the learner
 *    back exactly where they were, with screen-reader focus on the marker they chose;
 *  - where the block is WIDE enough (judged from the block's own measured width, not the device) in a panel to the right of the picture (same content, same navigation).
 * Either way there is ONE explanation: choosing another hotspot (its number, Previous / Next) replaces the content in place, and the picture's selected marker follows. The chosen hotspot's title is
 * also floated beside its marker on the picture (hotspot-label.tsx), from the same single selection, and leaves with it.
 * Leaving the screen closes the sheet at once, so it never lingers over another screen.
 *
 * THE LIST under the picture is the accessible equivalent of the markers (and the way to reach hotspots whose markers overlap). If the image cannot be shown (not saved, offline, failed) the list
 * stays and every explanation is read from it, so nothing is lost. The image comes from the saved offline copy when there is one, otherwise from the learner media route.
 * With `variant="map"` the same renderer shows a published MAP block (backend map-explore.ts): the same content plus an optional `title`, the markers are optional (a map may be just the
 * image, with its description and caption as the text equivalent), and the wording says "marker".
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
const HALO = DOT + 8;
/** How much the chosen marker grows, and how far the one-time ring travels (times its own size). */
const SELECTED_SCALE = 1.12;
const RING_TRAVEL = 1.85;
/** The block is laid out in two columns (image, then explanation) when it is at least this wide. It is the block's own measured width, so it works the same on a tablet and on a landscape phone. */
const WIDE_MIN_WIDTH = 480;
/** How much of the window's height the image may take, so the whole picture fits on screen. */
const IMAGE_HEIGHT_SHARE = { stacked: 0.7, wide: 0.82 } as const;
/** The image's share of the block's width when the explanation is beside it. */
const IMAGE_WIDTH_SHARE = 0.55;
/** The picture's first appearance. */
const ENTRANCE_MS = 300;
const ENTRANCE_LIFT = 8;

/**
 * One numbered marker on the picture: a gold dot with a dark outline and number inside a dark halo (so it reads on bright and on dark pictures, in either theme), with a 44-point touch area.
 * Choosing it plays, ONCE: the marker grows about 12%, one thin gold ring expands from it and fades, and it settles into the selected look (a brighter dot, a light border and a thin steady ring,
 * so selection never depends on motion or colour alone). Un-choosing reverses the grow. While another hotspot is open the rest are a little quieter, still plainly tappable. Only opacity and
 * scale on the native driver; the position and touch area are exactly what the saved coordinates say. A new choice replaces a running animation safely, so tapping quickly never leaves a ring
 * half-drawn. With Reduce Motion nothing animates. Memoised: choosing one hotspot does not redraw the others.
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
  const { colors, shadows } = useTheme();
  const reduce = useReduceMotion();
  const [scale] = useState(() => new Animated.Value(selected ? SELECTED_SCALE : 1));
  const [steady] = useState(() => new Animated.Value(selected ? 1 : 0));
  // 0 -> 1 is the one-time ring travelling out; 1 is "finished", where it is invisible.
  const [burst] = useState(() => new Animated.Value(1));
  const mounted = useRef(false);
  const setNode = useCallback((node: View | null) => register(id, node), [id, register]);
  const press = useCallback(() => onPress(id), [id, onPress]);

  useEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    if (reduce) {
      scale.setValue(selected ? SELECTED_SCALE : 1);
      steady.setValue(selected ? 1 : 0);
      burst.setValue(1);
      return;
    }
    if (!selected) burst.setValue(1);
    const settle = Animated.parallel([
      Animated.timing(scale, { toValue: selected ? SELECTED_SCALE : 1, duration: motion.duration.selection, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER }),
      Animated.timing(steady, { toValue: selected ? 1 : 0, duration: motion.duration.selection, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER }),
    ]);
    settle.start();
    let ring: Animated.CompositeAnimation | null = null;
    if (selected && !first) {
      burst.setValue(0);
      ring = Animated.timing(burst, { toValue: 1, duration: motion.duration.halo, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER });
      ring.start();
    }
    return () => {
      settle.stop();
      ring?.stop();
    };
  }, [selected, reduce, scale, steady, burst]);

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
        opacity: dimmed ? 0.8 : 1,
      }}>
      <Animated.View style={{ width: HALO, height: HALO, alignItems: 'center', justifyContent: 'center', transform: [{ scale }] }}>
        {/* the one-time expanding ring */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: HALO,
            height: HALO,
            borderRadius: HALO / 2,
            borderWidth: 1.5,
            borderColor: colors.primaryHighlight,
            opacity: burst.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
            transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [1, RING_TRAVEL] }) }],
          }}
        />
        {/* the dark halo keeps the marker visible on any picture; the selected marker also keeps a thin steady ring */}
        <View style={{ width: HALO, height: HALO, borderRadius: HALO / 2, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            pointerEvents="none"
            style={{ position: 'absolute', width: HALO, height: HALO, borderRadius: HALO / 2, borderWidth: 1.5, borderColor: colors.primaryHighlight, opacity: steady }}
          />
          <View
            style={[
              shadows.card,
              {
                width: DOT,
                height: DOT,
                borderRadius: DOT / 2,
                borderWidth: selected ? 3 : 2,
                borderColor: selected ? colors.textOnImage : colors.onPrimary,
                backgroundColor: selected ? colors.primaryHighlight : colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              },
            ]}>
            <AppText variant="caption" color="onPrimary" style={{ fontWeight: '700' }} allowFontScaling={false}>
              {number}
            </AppText>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
});

export function HotspotImage({
  lessonId,
  level,
  content,
  variant = 'interactive',
}: {
  lessonId: string;
  level: LearningLevel;
  content: Record<string, unknown>;
  variant?: 'interactive' | 'map';
  /**
   * The reader's scroll-to-reveal hook, which this block no longer uses: the explanation now opens in a sheet (or beside the picture), so the lesson is never scrolled for it. The reader's
   * existing call still passes it; it is accepted and ignored.
   */
  onReveal?: (localY: number, height: number) => void;
}) {
  const { spacing, colors, radius } = useTheme();
  const reduce = useReduceMotion();
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
  const [entrance] = useState(() => new Animated.Value(0));
  const entrancePlayed = useRef(false);

  const onLoad = (event: NativeSyntheticEvent<ImageLoadEventData>) => {
    const { width, height } = event.nativeEvent.source;
    if (width > 0 && height > 0) setRatio(width / height);
    setStatus('ready');
  };

  // The picture's first appearance: a fade with a very small lift, once per mount (never again while the lesson is scrolled, or if the same picture is reloaded). Nothing waits for it:
  // the markers can be used from the moment the picture is there.
  useEffect(() => {
    if (status !== 'ready') return;
    if (reduce || entrancePlayed.current) {
      entrance.setValue(1);
      return;
    }
    entrancePlayed.current = true;
    const animation = Animated.timing(entrance, { toValue: 1, duration: ENTRANCE_MS, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER });
    animation.start();
    return () => {
      animation.stop();
      entrance.setValue(1);
    };
  }, [status, reduce, entrance]);

  const imageFailed = !uri || status === 'failed';
  const wide = blockWidth >= WIDE_MIN_WIDTH;
  // The picture's box: its own aspect ratio, as wide as the space allows but never taller than its share of the window, so the whole picture is on screen.
  const available = blockWidth > 0 ? (wide ? Math.floor((blockWidth - spacing.lg) * IMAGE_WIDTH_SHARE) : blockWidth) : 0;
  const maxHeight = Math.max(240, windowHeight * (wide ? IMAGE_HEIGHT_SHARE.wide : IMAGE_HEIGHT_SHARE.stacked));
  const boxWidth = available > 0 ? Math.min(available, Math.floor(maxHeight * ratio)) : 0;
  const boxHeight = boxWidth > 0 ? Math.round(boxWidth / ratio) : 0;

  // Selection is read through refs by the stable handlers below, so the markers (memoised) do not redraw when only the explanation changes.
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;
  const markerNodes = useRef(new Map<string, View>());
  const leavingRef = useRef(false);

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

  /** Choosing a marker (or a row): the same one again closes it. */
  const choose = useCallback((id: string) => {
    setSelected((current) => (current === id ? null : id));
  }, []);
  /** Going to a hotspot from the explanation's numbers or Previous / Next: always shows it, never closes. */
  const goTo = useCallback((id: string) => setSelected(id), []);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
    },
    [],
  );
  /** The one place the selection is cleared by the learner (the sheet's close button, scrim, Back and swipe, and the side panel's Close all come here). A second call before it has rendered does nothing. */
  const close = useCallback(() => {
    const id = selectedRef.current;
    if (id === null) return;
    selectedRef.current = null;
    setSelected(null);
    // after the sheet has left (or at once beside the picture), screen-reader focus goes back to the marker that was chosen, unless something else has been opened since
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => {
      focusTimer.current = null;
      if (selectedRef.current === null) focusMarker(id);
    }, motion.duration.modal);
  }, [focusMarker]);

  // Leaving the screen (Open in Bible, back, any navigation) closes the sheet at once; coming back finds the lesson as it was left, with nothing open.
  useFocusEffect(
    useCallback(() => {
      leavingRef.current = false;
      return () => {
        leavingRef.current = true;
        setSelected(null);
      };
    }, []),
  );

  // The picture and the list share ONE selection. With the picture shown, the chosen item opens in the sheet / panel; when the picture cannot be shown, every explanation is read straight from the list.
  const active = imageFailed ? null : (hotspots.find((h) => h.id === selected) ?? null);
  const hasMarkers = hotspots.some((h) => h.x !== null && h.y !== null);
  // The chosen hotspot, if it is on the picture and has a title: its title is floated beside its marker. It is the same selection as the sheet's and the marker's, never a second one.
  const labelled = active && active.x !== null && active.y !== null && active.label.trim() !== '' ? active : null;
  // What the sheet shows while it is leaving: the hotspot that was open, so it never empties before it is gone.
  const lastShown = useRef<Hotspot | null>(null);
  if (active) lastShown.current = active;
  const display = active ?? lastShown.current;
  const displayIndex = display ? hotspots.findIndex((h) => h.id === display.id) : -1;
  const goToIndex = useCallback(
    (index: number) => {
      const target = hotspots[index];
      if (target) goTo(target.id);
    },
    [hotspots, goTo],
  );

  const picture = (
    <View style={{ width: boxWidth > 0 ? boxWidth : '100%', alignSelf: wide ? 'flex-start' : 'center' }}>
      <View style={{ width: '100%', aspectRatio: ratio, borderRadius: radius.lg, backgroundColor: status === 'ready' ? colors.surface : colors.surfaceElevated }}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [ENTRANCE_LIFT, 0] }) }] }]}>
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
          {/* the chosen marker's title, beside it; it follows the one selection and takes no touches */}
          {status === 'ready' && boxWidth > 0 ? (
            <FloatingHotspotLabel
              id={labelled ? labelled.id : null}
              title={labelled ? labelled.label.trim() : ''}
              x={labelled?.x ?? 0}
              y={labelled?.y ?? 0}
              boxWidth={boxWidth}
              boxHeight={boxWidth / ratio}
              markerRadius={(HALO / 2) * SELECTED_SCALE}
            />
          ) : null}
        </Animated.View>
        {/* the frame is drawn over the picture, so it takes no room and cannot move a marker; it turns gold only while the learner is exploring */}
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: radius.lg, borderWidth: 1, borderColor: selected !== null ? colors.borderGold : colors.borderSubtle }]}
        />
        {status === 'loading' ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <ActivityIndicator color={colors.textMuted} />
          </View>
        ) : null}
      </View>
    </View>
  );

  const hintText = 'Tap a numbered point to explore its meaning.';
  // Under the picture on a phone: a small, quiet invitation.
  const hint =
    !imageFailed && hasMarkers ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
        <AppText variant="bodySmall" color="textMuted" style={{ flexShrink: 1 }}>
          {hintText}
        </AppText>
      </View>
    ) : null;

  // Side by side, the column next to the picture is never empty: it invites a tap until a hotspot is open.
  const prompt = (
    <View style={{ gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface }}>
      <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700' }}>
        {isMap ? 'Explore the map' : 'Explore the image'}
      </AppText>
      <AppText variant="body" color="textSecondary">
        {hasMarkers ? hintText : `Choose a ${noun.toLowerCase()} from the list below.`}
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
            {active ? (
              <HotspotSidePanel
                noun={noun}
                hotspots={hotspots}
                index={hotspots.findIndex((h) => h.id === active.id)}
                maxBodyHeight={Math.max(280, boxHeight)}
                onSelect={goToIndex}
                onClose={close}
              />
            ) : (
              prompt
            )}
          </View>
        </View>
      ) : (
        <>
          {picture}
          {hint}
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

      {/* The floating explanation on a phone. A sheet is a Modal, so it takes no room in the lesson. */}
      {!wide && !imageFailed ? (
        <HotspotSheet
          visible={active !== null}
          immediate={leavingRef.current}
          onClose={close}
          accessibilityLabel={`${noun} details`}
          contentKey={display ? display.id : ''}
          topBar={(requestClose) => (display && displayIndex >= 0 ? <HotspotTopBar noun={noun} index={displayIndex} total={hotspots.length} onClose={requestClose} /> : null)}
          navigator={display && displayIndex >= 0 ? <HotspotNavigator noun={noun} hotspots={hotspots} index={displayIndex} onSelect={goToIndex} /> : null}>
          {display ? <HotspotContent noun={noun} hotspot={display} /> : null}
        </HotspotSheet>
      ) : null}
    </View>
  );
}
