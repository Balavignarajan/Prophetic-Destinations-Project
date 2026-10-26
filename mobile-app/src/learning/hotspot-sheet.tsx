import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { useTheme } from '@/theme';
import { motion } from '@/theme/motion';

/** How long past the exit animation the sheet waits before it removes its window regardless: a lost completion callback must never leave an invisible window over the lesson. */
const EXIT_GRACE_MS = 120;

/**
 * The floating explanation sheet of an interactive image (portrait phones). It is the app's own sheet pattern (see LessonContents): a transparent `Modal`, so it sits above the lesson without
 * touching the lesson's scroll view, scroll position, progress or any other block, and it works the same wherever the block is. A light scrim keeps the lesson (and the picture, where it is not
 * under the sheet) visible behind it.
 *
 * HEIGHT. The sheet is as tall as its content, up to a comfortable share of the screen (55%), or up to nearly the whole screen when expanded; beyond that its body scrolls, so no text is ever
 * cut. The part above the screen's safe areas is never covered: the top inset and a margin stay free, and the bottom inset is added as padding, so the home indicator / Android navigation bar
 * never sits on the text.
 *
 * LEAVING. There is ONE way out: `requestClose`. The close button (the `topBar` is given it), the scrim, Android Back (`onRequestClose`) and a downward swipe on the handle all call it, and it asks
 * the owner (`onClose`) to clear the selection, which is the only thing that closes the sheet (`visible` goes false). It does nothing when the sheet is already closing, so a double tap, a tap on
 * the fading scrim or a Back press during the exit never asks twice. Leaving the screen (Open in Bible, back, any navigation) skips the exit (`immediate`). The swipe is a built-in `PanResponder`
 * on the HANDLE strip only: never on the scrolling body (so it cannot fight the scroll) and never around a button (so it cannot take a tap from the close button, the numbers or the actions). An
 * upward swipe expands, a downward one collapses or, from the normal height, closes. The handle is also a button that expands or collapses the sheet, for people who do not swipe. While it is open
 * the background is not reachable (`Modal`, `accessibilityViewIsModal`).
 *
 * LIFETIME. The window is kept (`shown`) from the moment the sheet opens until its exit is over, and the exit ends in `finish`, which removes the window. The exit does not depend on any single
 * thing going right: it is finished by the animation's completion (whatever its result), or by a timer a little longer than the animation, or by the owner leaving the screen, and a stale callback
 * of an earlier exit is ignored once the sheet has opened again or gone. The window is never unmounted on the commit in which `visible` goes false: unmounting would detach the animated values from
 * their views, and React Native's `AnimatedValue.__detach` stops whatever animation is running on them, which cancelled the exit and left an invisible window that took every touch.
 *
 * MOTION. It slides up (about 280 ms) and down (about 200 ms) with the app's easing; transform and opacity only. The sheet's two values (`progress`, `dragY`) are driven from JavaScript, not the
 * native driver, because the swipe writes `dragY` from JavaScript on every move and the exit must always report its end. With Reduce Motion it appears and disappears at once. `immediate` skips the
 * exit (used when the learner leaves the screen, so the sheet never lingers over the next one).
 */
export function HotspotSheet({
  visible,
  immediate = false,
  onClose,
  accessibilityLabel,
  contentKey,
  topBar,
  navigator,
  children,
}: {
  visible: boolean;
  immediate?: boolean;
  onClose: () => void;
  accessibilityLabel: string;
  /** Identifies what the body shows; the body scrolls back to its top when it changes. */
  contentKey: string;
  /** The top bar. It is given the sheet's own close, so the close button leaves by the same path as the scrim, Back and the swipe. */
  topBar: (close: () => void) => ReactNode;
  navigator: ReactNode;
  children: ReactNode;
}) {
  const { colors, layout, radius, spacing, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reduce = useReduceMotion();
  // Whether the window exists: from the render that opens the sheet until its exit is over.
  const [shown, setShown] = useState(visible);
  if (visible && !shown) setShown(true);
  const [expanded, setExpanded] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));
  const [dragY] = useState(() => new Animated.Value(0));
  const scroller = useRef<ScrollView>(null);

  // The handlers of the swipe, the scrim and Back are created once, so they read what changes through refs (written after each render, before any effect below).
  const expandedRef = useRef(expanded);
  const visibleRef = useRef(visible);
  const reduceRef = useRef(reduce);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    expandedRef.current = expanded;
    visibleRef.current = visible;
    reduceRef.current = reduce;
    onCloseRef.current = onClose;
  });

  /** The one way out. Does nothing once the sheet is closing (or closed), so it can never ask the owner twice. */
  const requestClose = useCallback(() => {
    if (!visibleRef.current) return;
    onCloseRef.current();
  }, []);

  // Opening: from where it is (a sheet that is still leaving is brought back), up to rest.
  useEffect(() => {
    if (!visible) return;
    setExpanded(false);
    dragY.setValue(0);
    if (reduce) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, { toValue: 1, duration: motion.duration.modal, easing: motion.easing.standard, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [visible, reduce, progress, dragY]);

  // Closing: the exit, then the window goes. `finish` is reached by the animation ending (however it ends), by the timer, or by leaving the screen; whichever is first, and only while this exit is
  // still the current one (the cleanup runs when the sheet opens again, when the screen is left and when the component unmounts, and it silences everything below).
  useEffect(() => {
    if (visible || !shown) return;
    let current = true;
    const finish = () => {
      if (!current) return;
      current = false;
      progress.setValue(0);
      dragY.setValue(0);
      setShown(false);
    };
    if (reduce || immediate) {
      finish();
      return;
    }
    const animation = Animated.timing(progress, { toValue: 0, duration: motion.duration.selection, easing: motion.easing.standard, useNativeDriver: false });
    animation.start(finish);
    const fallback = setTimeout(finish, motion.duration.selection + EXIT_GRACE_MS);
    return () => {
      current = false;
      clearTimeout(fallback);
      animation.stop();
    };
  }, [visible, shown, reduce, immediate, progress, dragY]);

  useEffect(() => {
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, [contentKey]);

  const [pan] = useState(() => {
    const settle = () => {
      if (reduceRef.current) dragY.setValue(0);
      else Animated.spring(dragY, { toValue: 0, bounciness: 0, speed: 18, useNativeDriver: false }).start();
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_event, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2,
      onPanResponderGrant: () => dragY.stopAnimation(),
      onPanResponderMove: (_event, g) => dragY.setValue(Math.max(g.dy, -24)),
      onPanResponderRelease: (_event, g) => {
        if (!expandedRef.current && (g.dy > 90 || g.vy > 1)) {
          // Swiped away: the same way out as the close button. The sheet carries on down from where the finger left it.
          requestClose();
          return;
        }
        if (!expandedRef.current && (g.dy < -40 || g.vy < -0.8)) setExpanded(true);
        else if (expandedRef.current && (g.dy > 60 || g.vy > 0.8)) setExpanded(false);
        settle();
      },
      onPanResponderTerminate: settle,
    });
  });

  // The window stays through the exit; it is gone at once when the screen is left or Reduce Motion is on.
  const open = visible || (shown && !immediate && !reduce);
  const topGap = insets.top + spacing.xl;
  const expandedMax = Math.max(320, windowHeight - topGap);
  const partialMax = Math.min(expandedMax, Math.max(300, Math.round(windowHeight * 0.55)));
  const maxHeight = expanded ? expandedMax : partialMax;
  const dragFade = useMemo(() => dragY.interpolate({ inputRange: [0, windowHeight], outputRange: [1, 0], extrapolate: 'clamp' }), [dragY, windowHeight]);
  const scrimOpacity = useMemo(() => Animated.multiply(progress, dragFade), [progress, dragFade]);
  const sheetY = useMemo(() => Animated.add(progress.interpolate({ inputRange: [0, 1], outputRange: [windowHeight, 0] }), dragY), [progress, dragY, windowHeight]);

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={requestClose} statusBarTranslucent>
      <View style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: scrimOpacity }]}>
          <Pressable accessible={false} importantForAccessibility="no" onPress={requestClose} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <View style={styles.bottom} pointerEvents="box-none">
          <Animated.View
            accessibilityViewIsModal
            accessibilityLabel={accessibilityLabel}
            style={[
              shadows.card,
              {
                width: '100%',
                maxWidth: layout.maxContentWidth,
                maxHeight,
                paddingBottom: insets.bottom + spacing.md,
                marginLeft: insets.left,
                marginRight: insets.right,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
                borderWidth: layout.hairline,
                borderBottomWidth: 0,
                borderColor: colors.borderSubtle,
                backgroundColor: colors.surfaceElevated,
                transform: [{ translateY: sheetY }],
              },
            ]}>
            {/* the handle: the only place a swipe is read, so no button is ever inside a gesture responder */}
            <View {...pan.panHandlers}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={expanded ? 'Show less of the explanation' : 'Show more of the explanation'}
                onPress={() => setExpanded((current) => !current)}
                hitSlop={{ top: 8, bottom: 8 }}
                style={{ alignItems: 'center', justifyContent: 'center', minHeight: 28, paddingTop: spacing.xs }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.textMuted, opacity: 0.55 }} />
              </Pressable>
            </View>
            <View style={{ paddingLeft: spacing.lg, paddingRight: spacing.sm }}>{topBar(requestClose)}</View>
            <View style={{ paddingHorizontal: spacing.sm }}>{navigator}</View>
            <ScrollView
              ref={scroller}
              style={styles.shrink}
              contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg }}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bottom: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  shrink: { flexShrink: 1 },
});
