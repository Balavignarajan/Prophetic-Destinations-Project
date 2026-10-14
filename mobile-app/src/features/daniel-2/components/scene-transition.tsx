import { type ReactNode, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Platform } from 'react-native';

/** A short fade-and-rise when a scene appears. Skipped when the device asks to reduce motion. Remount (change `key`) to replay. */
export function SceneTransition({ children }: { children: ReactNode }) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let cancelled = false;
    let animation: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          progress.setValue(1);
          return;
        }
        animation = Animated.timing(progress, { toValue: 1, duration: 260, useNativeDriver: Platform.OS !== 'web' });
        animation.start();
      });
    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [progress]);

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
