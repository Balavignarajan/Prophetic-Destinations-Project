import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { useTheme } from '@/theme';
import { NATIVE_DRIVER, motion } from '@/theme/motion';

import { AppText } from './app-text';
import { CheckStroke } from './feedback-reveal';

/**
 * The quiet "lesson complete" moment: a gold check inside a gold outline pops in, one thin ring expands behind it and fades, and the words
 * fade in a beat later (about two thirds of a second in all). No confetti, no flash. The ring is decorative and hidden from screen readers;
 * the title and message are read once. Mount it only when the learner has just completed the lesson: it plays once when it appears, and
 * with Reduce Motion it is simply shown.
 */
export function CompletionMark({ title, message }: { title: string; message?: string }) {
  const { colors, spacing } = useTheme();
  const reduce = useReduceMotion();
  const [play] = useState(!reduce);
  const [badge] = useState(() => new Animated.Value(play ? 0 : 1));
  const [ring] = useState(() => new Animated.Value(0));
  const [text] = useState(() => new Animated.Value(play ? 0 : 1));

  useEffect(() => {
    if (!play) return;
    const animation = Animated.parallel([
      Animated.timing(badge, { toValue: 1, duration: motion.duration.mark + 20, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER }),
      Animated.timing(ring, { toValue: 1, duration: motion.duration.celebrate, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER }),
      Animated.timing(text, { toValue: 1, duration: motion.duration.reveal, delay: 180, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [play, badge, ring, text]);

  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={message ? `${title}. ${message}` : title}
      style={{ alignItems: 'center', gap: spacing.md }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: 92, height: 92, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={{
            position: 'absolute',
            width: 64,
            height: 64,
            borderRadius: 32,
            borderWidth: 2,
            borderColor: colors.primary,
            opacity: ring.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.55, 0] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.4] }) }],
          }}
        />
        <Animated.View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            borderWidth: 2,
            borderColor: colors.primary,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: badge,
            transform: [{ scale: badge.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
          }}>
          <CheckStroke color={colors.primary} size={30} thickness={3.5} />
        </Animated.View>
      </View>
      <Animated.View
        style={{
          alignItems: 'center',
          gap: spacing.xs,
          opacity: text,
          transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [motion.offset.reveal, 0] }) }],
        }}>
        <AppText variant="heading" align="center">
          {title}
        </AppText>
        {message ? (
          <AppText variant="bodySmall" color="textSecondary" align="center">
            {message}
          </AppText>
        ) : null}
      </Animated.View>
    </View>
  );
}
