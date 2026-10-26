import { useEffect, useMemo, useState } from 'react';
import { Animated, type LayoutChangeEvent, useWindowDimensions } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';
import { NATIVE_DRIVER, motion } from '@/theme/motion';

/** The label never grows wider than this (a longer title wraps to a second line, then is shortened with an ellipsis). */
const LABEL_MAX_WIDTH = 200;
/** Clear space between the marker's edge and the label. */
const GAP = 6;
/** The label never comes closer than this to an edge of the picture. */
const EDGE = 4;
const IN_MS = 170;
const OUT_MS = 110;
/** How long past the fade-out the label waits before it changes anyway: a lost animation callback must never leave an old title on the picture. */
const GRACE_MS = 80;
const FROM_SCALE = 0.95;

type Spot = { id: string; title: string; x: number; y: number };

/**
 * Where the label goes, in the picture's own pixels, or null when it cannot go anywhere inside the picture without touching the marker. The marker's centre is (cx, cy) and `reach` is how far from
 * that centre the label must start (the marker's edge plus a gap). In order of preference: to the right of the marker, to its left, above it, below it. Beside the marker the label is centred on
 * it as far as the picture allows; above or below it is centred across it likewise. It is always at least EDGE from every side of the picture, and never on the marker.
 */
function placeLabel(cx: number, cy: number, width: number, height: number, boxWidth: number, boxHeight: number, reach: number): { left: number; top: number } | null {
  const maxLeft = boxWidth - EDGE - width;
  const maxTop = boxHeight - EDGE - height;
  if (maxLeft < EDGE || maxTop < EDGE) return null; // larger than the picture can hold
  const middleTop = Math.min(Math.max(cy - height / 2, EDGE), maxTop);
  const middleLeft = Math.min(Math.max(cx - width / 2, EDGE), maxLeft);
  const right = cx + reach;
  if (right <= maxLeft) return { left: right, top: middleTop };
  const left = cx - reach - width;
  if (left >= EDGE) return { left, top: middleTop };
  const above = cy - reach - height;
  if (above >= EDGE) return { left: middleLeft, top: above };
  const below = cy + reach;
  if (below <= maxTop) return { left: middleLeft, top: below };
  return null;
}

/**
 * The small floating title beside the chosen marker of an interactive image: a rounded pill in the theme's raised surface, with a thin gold border and the hotspot's own title (the CMS label, as
 * it came), like a light tooltip. It shows ONLY the title; the number stays on the marker, and the explanation and Scripture stay in the sheet or panel. It is drawn inside the picture, in the
 * picture's own coordinates, so it is exactly as aligned as the marker is (the saved percentages, the displayed size), follows a rotation or a resize, and is covered together with its marker if
 * the sheet covers that part of the picture. It takes no touches (`pointerEvents="none"`), so it can never block a marker, the lesson's scrolling or the sheet.
 *
 * ONE SOURCE OF TRUTH. `id` is the chosen hotspot (null when none is), straight from the renderer's single selection; this component keeps no selection of its own. What it keeps is only what is
 * DRAWN, which trails the selection by a fade: choosing another hotspot fades the old label out (about 110 ms), then draws the new one and fades it in (about 170 ms, from 95% size); clearing the
 * selection fades it out, and does not hold anything up (the sheet leaves on its own). Choosing again before a fade has finished replaces it, so a hotspot passed over in a quick run is never drawn,
 * and the exit is also finished by a timer, so a title can never be left behind. With Reduce Motion it changes at once, with no fade or scale. There is no looping animation.
 *
 * POSITION. The pill's real size is measured (its own layout, at its maximum width), never guessed from the text, and it is shown only once it has been measured for THIS title at THIS width and
 * text size, so it never appears in a wrong place or with a wrong title. `placeLabel` then picks the side (right, left, above, below), keeping it inside the picture. If it fits nowhere it is not
 * drawn (the title is in the sheet). A long title wraps to two lines and is then shortened; the pill is hidden from screen readers because the marker and the sheet already say the full title.
 */
export function FloatingHotspotLabel({
  id,
  title,
  x,
  y,
  boxWidth,
  boxHeight,
  markerRadius,
}: {
  /** The chosen hotspot, or null when there is none. */
  id: string | null;
  title: string;
  /** Where the marker is, as fractions of the picture. */
  x: number;
  y: number;
  /** The picture as displayed, in points. */
  boxWidth: number;
  boxHeight: number;
  /** How far the chosen marker reaches from its centre. */
  markerRadius: number;
}) {
  const { colors, radius, spacing, shadows } = useTheme();
  const reduce = useReduceMotion();
  const { fontScale } = useWindowDimensions();
  const [opacity] = useState(() => new Animated.Value(0));
  const scale = useMemo(() => opacity.interpolate({ inputRange: [0, 1], outputRange: [FROM_SCALE, 1] }), [opacity]);
  // What is drawn: follows `id`, a fade behind it.
  const [drawn, setDrawn] = useState<Spot | null>(null);
  const [measured, setMeasured] = useState<{ key: string; width: number; height: number } | null>(null);
  const drawnId = drawn ? drawn.id : null;

  // Which hotspot is drawn. Nothing drawn: the wanted one is drawn at once (invisible until measured). Another one drawn: it fades out first, then the wanted one takes its place.
  useEffect(() => {
    if (id === drawnId) return;
    const next = id === null ? null : { id, title, x, y };
    if (drawnId === null || reduce) {
      opacity.setValue(0);
      setDrawn(next);
      return;
    }
    let current = true;
    const swap = () => {
      if (!current) return;
      current = false;
      opacity.setValue(0);
      setDrawn(next);
    };
    const leave = Animated.timing(opacity, { toValue: 0, duration: OUT_MS, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER });
    leave.start(swap);
    const fallback = setTimeout(swap, OUT_MS + GRACE_MS);
    return () => {
      current = false;
      clearTimeout(fallback);
      leave.stop();
    };
  }, [id, title, x, y, drawnId, reduce, opacity]);

  // What is drawn is what is chosen: its own title, in its own place.
  const view: Spot | null = drawn === null ? null : id === drawn.id ? { id, title, x, y } : drawn;
  const maxWidth = Math.max(0, Math.min(LABEL_MAX_WIDTH, boxWidth - 2 * EDGE));
  const key = view ? `${view.id}|${view.title}|${maxWidth}|${fontScale}` : '';
  const ready = view !== null && measured !== null && measured.key === key;
  const place = view && measured && ready ? placeLabel(view.x * boxWidth, view.y * boxHeight, measured.width, measured.height, boxWidth, boxHeight, markerRadius + GAP) : null;
  const live = ready && id !== null && id === drawnId;

  // Showing: once it is measured and still wanted, it fades in.
  useEffect(() => {
    if (!live) return;
    if (reduce) {
      opacity.setValue(1);
      return;
    }
    const appear = Animated.timing(opacity, { toValue: 1, duration: IN_MS, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER });
    appear.start();
    return () => appear.stop();
  }, [live, id, title, x, y, reduce, opacity]);

  if (!view) return null;

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setMeasured((current) => (current && current.key === key && current.width === width && current.height === height ? current : { key, width, height }));
  };

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
      style={[
        shadows.card,
        {
          position: 'absolute',
          left: place ? place.left : 0,
          top: place ? place.top : 0,
          maxWidth,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: colors.borderGold,
          backgroundColor: colors.surface,
          opacity: place ? opacity : 0,
          transform: [{ scale }],
        },
      ]}>
      <AppText variant="bodySmall" numberOfLines={2} ellipsizeMode="tail" maxFontSizeMultiplier={1.3} style={{ fontWeight: '600' }}>
        {view.title}
      </AppText>
    </Animated.View>
  );
}
