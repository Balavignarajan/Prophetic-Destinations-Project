import { useCallback, useEffect, useRef, useState } from 'react';
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
 * still run.
 */
export function usePressMotion({
  scaleTo,
  pressMs = motion.duration.buttonPress,
  releaseMs = motion.duration.buttonRelease,
  disabled = false,
  onPressIn,
  onPressOut,
}: {
  scaleTo: number;
  pressMs?: number;
  releaseMs?: number;
  disabled?: boolean;
  onPressIn?: PressHandler | null;
  onPressOut?: PressHandler | null;
}) {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);

  const run = useCallback(
    (to: number, duration: number) => {
      scale.stopAnimation();
      Animated.timing(scale, { toValue: to, duration, easing: motion.easing.press, useNativeDriver: NATIVE_DRIVER }).start();
    },
    [scale],
  );
  useEffect(() => () => scale.stopAnimation(), [scale]);

  return {
    pressed: pressed && !disabled,
    scaleStyle: { transform: [{ scale }] },
    onPressIn: (event: GestureResponderEvent) => {
      if (!disabled) {
        setPressed(true);
        if (!reduce) run(scaleTo, pressMs);
      }
      onPressIn?.(event);
    },
    onPressOut: (event: GestureResponderEvent) => {
      setPressed(false);
      if (reduce) scale.setValue(1);
      else run(1, releaseMs);
      onPressOut?.(event);
    },
  };
}
