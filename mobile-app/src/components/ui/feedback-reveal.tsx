import { useEffect, useState } from 'react';
import { Animated, View, type ViewProps } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { useTheme } from '@/theme';
import { NATIVE_DRIVER, motion } from '@/theme/motion';

/** A check mark drawn with two borders of a rotated view (no icon font), the way ChevronIcon is drawn. Decorative. */
export function CheckStroke({ color, size, thickness }: { color: string; size: number; thickness: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: size * 0.34,
          height: size * 0.62,
          marginTop: -size * 0.1,
          borderRightWidth: thickness,
          borderBottomWidth: thickness,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

/** A small cross drawn with two rotated bars. Decorative. */
export function CrossStroke({ color, size, thickness }: { color: string; size: number; thickness: number }) {
  const bar = { position: 'absolute', width: size * 0.72, height: thickness, borderRadius: thickness / 2, backgroundColor: color } as const;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[bar, { transform: [{ rotate: '45deg' }] }]} />
      <View style={[bar, { transform: [{ rotate: '-45deg' }] }]} />
    </View>
  );
}

/**
 * The surface of a feedback card, eased in once: it fades and rises a few points and, for gentle feedback, settles from a 3 point sideways
 * offset (one short movement, no shaking). `animate` is read when the card first appears; a card that appears with `animate` false (a question
 * the learner comes back to, or the review) is simply shown. Nothing here changes size or touches any state, and the content is readable throughout.
 */
export function FeedbackReveal({ animate, nudge = 0, style, children, ...rest }: ViewProps & { animate: boolean; nudge?: number }) {
  const reduce = useReduceMotion();
  const [play] = useState(animate && !reduce);
  const [progress] = useState(() => new Animated.Value(play ? 0 : 1));

  useEffect(() => {
    if (!play) return;
    const animation = Animated.timing(progress, { toValue: 1, duration: motion.duration.reveal, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER });
    animation.start();
    return () => animation.stop();
  }, [play, progress]);

  return (
    <Animated.View
      {...rest}
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [motion.offset.reveal, 0] }) },
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [nudge, 0] }) },
          ],
        },
      ]}>
      {children}
    </Animated.View>
  );
}

/**
 * The small badge beside "Correct" or "Not quite". A correct answer gets a gold check that pops in with a thin gold ring that expands once and
 * fades; a missed one gets a quiet cross that fades in. Both stay on screen afterwards. The badge is decorative (the label next to it says the
 * same in words), so it is hidden from screen readers. With Reduce Motion, or when `animate` is false, it is just shown.
 */
export function FeedbackMark({ kind, animate }: { kind: 'correct' | 'incorrect'; animate: boolean }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const [play] = useState(animate && !reduce);
  const [pop] = useState(() => new Animated.Value(play ? 0 : 1));
  const [halo] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!play) return;
    const animations = [Animated.timing(pop, { toValue: 1, duration: motion.duration.mark, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER })];
    if (kind === 'correct') {
      animations.push(Animated.timing(halo, { toValue: 1, duration: motion.duration.halo, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER }));
    }
    const animation = Animated.parallel(animations);
    animation.start();
    return () => animation.stop();
  }, [play, kind, pop, halo]);

  const accent = kind === 'correct' ? colors.primary : colors.warning;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
      {kind === 'correct' ? (
        <Animated.View
          style={{
            position: 'absolute',
            width: 28,
            height: 28,
            borderRadius: 14,
            borderWidth: 2,
            borderColor: colors.primary,
            opacity: halo.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.55, 0] }),
            transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
          }}
        />
      ) : null}
      <Animated.View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          borderWidth: 2,
          borderColor: accent,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pop,
          transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
        }}>
        {kind === 'correct' ? <CheckStroke color={accent} size={16} thickness={2.5} /> : <CrossStroke color={accent} size={14} thickness={2.5} />}
      </Animated.View>
    </View>
  );
}
