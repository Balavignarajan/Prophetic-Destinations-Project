import { useEffect, useState } from 'react';
import { Animated } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { useTheme } from '@/theme';
import { NATIVE_DRIVER, motion } from '@/theme/motion';

/**
 * A short antique-gold rule under a heading that draws itself in from the left, once, when it first appears (just shown with Reduce Motion).
 * Decorative: hidden from screen readers.
 */
export function AccentRule({ width = 40, delay = 120 }: { width?: number; delay?: number }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const [grow] = useState(() => new Animated.Value(reduce ? 1 : 0));

  useEffect(() => {
    if (reduce) {
      grow.setValue(1);
      return;
    }
    const animation = Animated.timing(grow, { toValue: 1, duration: motion.duration.reveal + 40, delay, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER });
    animation.start();
    return () => animation.stop();
  }, [reduce, delay, grow]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width,
        height: 2,
        backgroundColor: colors.primary,
        opacity: grow,
        // scaling grows it about its centre, so it is slid left as it grows to stay anchored at the left edge
        transform: [{ translateX: grow.interpolate({ inputRange: [0, 1], outputRange: [-width / 2, 0] }) }, { scaleX: grow }],
      }}
    />
  );
}
