import { useEffect, useState } from 'react';
import { Animated, type ViewProps } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { NATIVE_DRIVER, motion } from '@/theme/motion';

/**
 * Fades its content in (and lifts it a few points, and optionally grows it slightly) once, when it first appears. It changes opacity and
 * position only, never layout size, so it cannot move the text around it or disturb a lesson's scroll position or a measurement made on it
 * (`onLayout` reports the layout, which transforms do not change). The content is already laid out and fully readable underneath. With
 * Reduce Motion on it simply shows the content. `delay` starts it a little later (see `staggerDelay`); `scaleFrom` is its starting scale.
 */
export function Reveal({
  children,
  offset = motion.offset.reveal,
  duration = motion.duration.reveal,
  delay = 0,
  scaleFrom = 1,
  style,
  ...rest
}: ViewProps & { offset?: number; duration?: number; delay?: number; scaleFrom?: number }) {
  const reduce = useReduceMotion();
  const [progress] = useState(() => new Animated.Value(reduce ? 1 : 0));

  useEffect(() => {
    if (reduce) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, { toValue: 1, duration, delay, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER });
    animation.start();
    return () => animation.stop();
  }, [reduce, duration, delay, progress]);

  return (
    <Animated.View
      {...rest}
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [scaleFrom, 1] }) },
          ],
        },
      ]}>
      {children}
    </Animated.View>
  );
}
