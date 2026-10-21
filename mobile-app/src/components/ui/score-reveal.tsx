import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { useTheme } from '@/theme';
import { NATIVE_DRIVER, motion } from '@/theme/motion';

import { AppText } from './app-text';

/**
 * A finished quiz's result: a heading, the score ("8 / 10") and a supporting line. When the learner has just finished, the three parts come in one
 * after another (heading, then the score settling into place, then the text; about half a second in all). With `animate` false (a saved result
 * opened again, or coming back from the review) it is simply shown. The whole block is read as one sentence by screen readers.
 */
export function ScoreReveal({
  eyebrow,
  score,
  total,
  note,
  animate,
}: {
  eyebrow: string;
  score: number;
  total: number;
  note: string;
  animate: boolean;
}) {
  const { spacing } = useTheme();
  const reduce = useReduceMotion();
  const [play] = useState(animate && !reduce);
  const [heading] = useState(() => new Animated.Value(play ? 0 : 1));
  const [value] = useState(() => new Animated.Value(play ? 0 : 1));
  const [support] = useState(() => new Animated.Value(play ? 0 : 1));

  useEffect(() => {
    if (!play) return;
    const to = (target: Animated.Value, duration: number, delay: number) =>
      Animated.timing(target, { toValue: 1, duration, delay, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER });
    const animation = Animated.parallel([
      to(heading, motion.duration.selection, 0),
      to(value, motion.duration.result, 140),
      to(support, motion.duration.reveal, 340),
    ]);
    animation.start();
    return () => animation.stop();
  }, [play, heading, value, support]);

  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${eyebrow}. ${score} of ${total} correct. ${note}`}
      style={{ gap: spacing.sm, alignItems: 'center', paddingVertical: spacing.md }}>
      <Animated.View style={{ opacity: heading }}>
        <AppText variant="label" color="primaryHighlight" align="center">
          {eyebrow}
        </AppText>
      </Animated.View>
      <Animated.View
        style={{
          alignSelf: 'stretch',
          alignItems: 'center',
          opacity: value,
          transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }],
        }}>
        <AppText variant="hero" color="primaryHighlight" align="center" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {score} / {total}
        </AppText>
      </Animated.View>
      <Animated.View
        style={{
          alignSelf: 'stretch',
          alignItems: 'center',
          gap: spacing.xs,
          opacity: support,
          transform: [{ translateY: support.interpolate({ inputRange: [0, 1], outputRange: [motion.offset.reveal, 0] }) }],
        }}>
        <AppText variant="body" align="center" style={{ fontWeight: '700' }}>
          {score} of {total} correct
        </AppText>
        <AppText variant="body" color="textSecondary" align="center">
          {note}
        </AppText>
      </Animated.View>
    </View>
  );
}
