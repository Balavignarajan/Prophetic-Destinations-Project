import { type ReactNode, useEffect, useState } from 'react';
import { Animated, Platform } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';

/** A short fade-and-rise when a scene appears. Skipped when the device asks to reduce motion. Remount (change `key`) to replay. */
export function SceneTransition({ children }: { children: ReactNode }) {
  const [progress] = useState(() => new Animated.Value(0));
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, { toValue: 1, duration: 260, useNativeDriver: Platform.OS !== 'web' });
    animation.start();
    return () => animation.stop();
  }, [progress, reduceMotion]);

  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
      }}>
      {children}
    </Animated.View>
  );
}
