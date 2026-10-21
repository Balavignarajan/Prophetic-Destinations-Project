import { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, type GestureResponderEvent } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { NATIVE_DRIVER, motion } from '@/theme/motion';

/** A Pressable whose style may contain animated values (the press scale). */
export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressHandler = (event: GestureResponderEvent) => void;

/**
 * The shared press feedback: the pressed control shrinks slightly and eases back on release. It only drives a transform on the native thread;
 * `pressed` (for colour changes) flips instantly. Nothing waits for the animation: the control's own onPress runs at once. With Reduce Motion on
 * (or when `disabled`) there is no scale at all.
 *
 * Use it with `AnimatedPressable` and put `scaleStyle` LAST in the style array. Pass the control's own `onPressIn` / `onPressOut` here so they
 * still run. `trackPressed: false` skips the `pressed` state, for a control that draws its pressed look with animated values instead, so a
 * press does not re-render it at all.
 */
export function usePressMotion({
  scaleTo,
  pressMs = motion.duration.buttonPress,
  releaseMs = motion.duration.buttonRelease,
  disabled = false,
  trackPressed = true,
  onPressIn,
  onPressOut,
}: {
  scaleTo: number;
  pressMs?: number;
  releaseMs?: number;
  disabled?: boolean;
  trackPressed?: boolean;
  onPressIn?: PressHandler | null;
  onPressOut?: PressHandler | null;
}) {
  const reduce = useReduceMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const [pressed, setPressed] = useState(false);

  const run = useCallback(
    (to: number, duration: number) => {
      scale.stopAnimation();
      Animated.timing(scale, { toValue: to, duration, easing: motion.easing.press, useNativeDriver: NATIVE_DRIVER }).start();
    },
    [scale],
  );
  useEffect(() => () => scale.stopAnimation(), [scale]);

  // one stable style object, so a re-render never asks the native side to rebuild the animation
  const scaleStyle = useMemo(() => ({ transform: [{ scale }] }), [scale]);

  return {
    pressed: pressed && !disabled,
    scaleStyle,
    onPressIn: (event: GestureResponderEvent) => {
      if (!disabled) {
        if (trackPressed) setPressed(true);
        if (!reduce) run(scaleTo, pressMs);
      }
      onPressIn?.(event);
    },
    onPressOut: (event: GestureResponderEvent) => {
      if (trackPressed) setPressed(false);
      if (reduce) scale.setValue(1);
      else run(1, releaseMs);
      onPressOut?.(event);
    },
  };
}
