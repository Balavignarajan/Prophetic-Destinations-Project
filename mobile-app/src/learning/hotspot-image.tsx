import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, type ImageLoadEventData, type NativeSyntheticEvent, Pressable, View } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { AppText, BlockNotice, Reveal } from '@/components/ui';
import { canSwitchToSavedWebCopy, reportBrokenAsset, switchToSavedWebCopy, useAssetUri } from '@/features/offline/offline-media';
import { lessonImageUrl } from '@/learning/lesson-image';
import { ScriptureLinks } from '@/learning/scripture-links';
import type { LearningLevel } from '@/learning/levels';
import { useTheme } from '@/theme';
import { NATIVE_DRIVER, motion } from '@/theme/motion';

/**
 * Renders a published INTERACTIVE_IMAGE block (backend/src/modules/lessons/domain/blocks/interactive-image.ts; PROPOSED schema):
 *   { mediaId, altText, caption?, source?, hotspots: [{ id, x, y, label, explanation }] }
 * `x`/`y` are fractions of the WHOLE image. The image is shown uncropped in a box that has exactly the picture's own aspect ratio
 * (taken from the loaded image), so the box IS the displayed image and percentage positions land on the right spot on any phone,
 * with no empty bars around it. Markers are only drawn once the image has loaded. The numbered list below is the accessible
 * equivalent of the markers: choosing a marker or a row opens that hotspot's explanation. If the image cannot be shown (not saved,
 * offline, failed) the list stays and every explanation is shown, so nothing is lost. The image comes from the saved offline copy
 * when there is one, otherwise from the learner media route.
 * With `variant="map"` the same renderer shows a published MAP block (backend map-explore.ts): the same content plus an optional `title`, the
 * markers are optional (a map may be just the image, with its description and caption as the text equivalent), and the wording says "marker".
 * A hotspot's Scripture (frozen passages) is shown in its panel as part of the explanation, not behind a second tap: opening the hotspot is the choice.
 * (In the list that replaces the panels when the image cannot be shown, the passages stay expandable to keep that list short.)
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

/**
 * One numbered marker on the picture. It keeps the dark halo, so it is visible on any image. When it becomes the selected one its dot settles
 * from a slightly smaller size and a bright gold ring fades in around it; when it is deselected the ring fades out. The selected state is
 * also carried by the larger, brighter dot and by the accessibility state, so nothing depends on the motion. Opacity and scale only; the
 * position, size of the touch area and coordinates are exactly as before.
 */
function HotspotMarker({
  x,
  y,
  number,
  label,
  selected,
  onPress,
}: {
  x: number;
  y: number;
  number: number;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const [ring] = useState(() => new Animated.Value(selected ? 1 : 0));
  const [settle] = useState(() => new Animated.Value(1));
  const mounted = useRef(false);

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
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
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
  /** Asks the lesson reader to scroll so the detail panel (at `localY`, `height`, measured inside this block) is on screen. Only called when an item is chosen. */
  onReveal?: (localY: number, height: number) => void;
}) {
  const { spacing, colors, radius } = useTheme();
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

  const onLoad = (event: NativeSyntheticEvent<ImageLoadEventData>) => {
    const { width, height } = event.nativeEvent.source;
    if (width > 0 && height > 0) setRatio(width / height);
    setStatus('ready');
  };

  const imageFailed = !uri || status === 'failed';
  const panelBox = useRef<{ y: number; height: number } | null>(null);
  const revealPending = useRef(false);
  const toggle = (id: string) => {
    const selecting = selected !== id;
    setSelected(selecting ? id : null);
    if (!selecting) {
      revealPending.current = false;
    } else if (!imageFailed) {
      if (panelBox.current) {
        // The panel is already showing another item: bring the new text into view if it is not.
        const box = panelBox.current;
        requestAnimationFrame(() => onReveal?.(box.y, box.height));
      } else {
        revealPending.current = true; // the panel is about to appear: reveal it once it has been laid out
      }
    }
  };
  // The picture and the list share ONE selection. With the picture shown, the chosen item opens in a detail panel under it; when the picture
  // cannot be shown, every explanation is read straight from the list, as before.
  const active = imageFailed ? null : (hotspots.find((h) => h.id === selected) ?? null);
  const activeIndex = active ? hotspots.indexOf(active) : -1;
  const hasMarkers = hotspots.some((h) => h.x !== null && h.y !== null);
  const hasActive = active !== null;
  useEffect(() => {
    if (!hasActive) {
      panelBox.current = null;
      revealPending.current = false;
    }
  }, [hasActive]);

  return (
    <View style={{ gap: spacing.md }} accessible={false}>
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
      ) : (
        <View style={{ width: '100%', aspectRatio: ratio, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: status === 'ready' ? colors.surface : colors.surfaceElevated }}>
          <Image
            source={{ uri }}
            style={{ width: '100%', height: '100%' }}
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
                    x={h.x}
                    y={h.y}
                    number={index + 1}
                    label={`${noun} ${index + 1}: ${h.label || 'no label'}`}
                    selected={selected === h.id}
                    onPress={() => toggle(h.id)}
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
      )}

      {!imageFailed && hasMarkers ? (
        <AppText variant="bodySmall" color="textMuted">
          Tap a numbered {noun.toLowerCase()} on the image, or choose one from the list.
        </AppText>
      ) : null}

      {/* The hotspots are the ones the server resolved for this level; if none is meant for it the picture stands alone, and says so (a map may simply be an image). */}
      {!isMap && hotspots.length === 0 ? (
        <AppText variant="bodySmall" color="textMuted">
          There are no hotspots on this image at your level.
        </AppText>
      ) : null}

      {active ? (
        <Reveal
          key={active.id}
          accessibilityLiveRegion="polite"
          onLayout={(event) => {
            const { y, height } = event.nativeEvent.layout;
            panelBox.current = { y, height };
            if (revealPending.current) {
              revealPending.current = false;
              onReveal?.(y, height);
            }
          }}
          style={{ gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderLeftWidth: 3, borderLeftColor: colors.primary, backgroundColor: colors.surfaceElevated }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
            <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700' }}>
              {noun} {activeIndex + 1} of {hotspots.length}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Close ${noun.toLowerCase()} details`}
              onPress={() => setSelected(null)}
              style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm }}>
              <AppText variant="bodySmall" color="textSecondary" style={{ fontWeight: '600' }}>
                Close ✕
              </AppText>
            </Pressable>
          </View>
          <AppText variant="heading" accessibilityRole="header">
            {active.label || noun}
          </AppText>
          {active.explanation ? (
            <AppText variant="body" color="textSecondary" style={{ fontSize: 16, lineHeight: 25 }}>
              {active.explanation}
            </AppText>
          ) : null}
          <ScriptureLinks entries={active.scripture} presentation="inline" />
        </Reveal>
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
                  onPress={() => toggle(h.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: 52 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.borderGold, alignItems: 'center', justifyContent: 'center' }}>
                    <AppText variant="caption" color="primaryHighlight" style={{ fontWeight: '700' }} allowFontScaling={false}>
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
