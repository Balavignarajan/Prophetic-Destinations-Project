import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { useTheme, withAlpha } from '@/theme';
import { NATIVE_DRIVER, motion } from '@/theme/motion';

import { PrimaryButton, type PrimaryButtonProps } from './primary-button';

/** How far the soft light reaches beyond the button on every side. It stays inside the 24 pt screen padding, so it is never cut off. */
const REACH = 20;
/** One slow breath of light, in milliseconds (brighten and widen, then soften). */
const CYCLE = 3200;
/** Concentric, very faint rings from the outside in; together they read as soft light fading away from the button, with no blur effect needed. */
const RINGS = [
  { inset: 0, alpha: 0.035 },
  { inset: 4, alpha: 0.045 },
  { inset: 8, alpha: 0.055 },
  { inset: 12, alpha: 0.065 },
  { inset: 16, alpha: 0.075 },
] as const;

/**
 * The primary button with a slow, soft golden glow behind it, for the one action that opens the app. The button is the ordinary PrimaryButton
 * (solid antique gold, dark label, the same press feedback, the same touch area); only a decorative layer behind it moves, and only its
 * opacity and scale: about 3.2 seconds per breath, never the button, its label or its hit area. A press brightens the glow briefly.
 *
 * The glow layer sits behind the button, ignores touches, is hidden from screen readers and takes no layout space. With Reduce Motion on it is a
 * still, gentle halo. A disabled or loading button has no glow. The loop stops when the screen goes away.
 */
export function GlowingButton({ onPressIn, onPressOut, ...props }: PrimaryButtonProps) {
  const { colors, radius } = useTheme();
  const reduce = useReduceMotion();
  const [pulse] = useState(() => new Animated.Value(0.5));
  const [boost] = useState(() => new Animated.Value(0));
  const inactive = Boolean(props.disabled) || Boolean(props.loading);

  useEffect(() => {
    if (reduce || inactive) {
      pulse.setValue(0.5);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: CYCLE / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(pulse, { toValue: 0, duration: CYCLE / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, inactive, pulse]);

  useEffect(() => () => boost.stopAnimation(), [boost]);

  const brighten = (to: number, duration: number) => {
    if (reduce) return;
    boost.stopAnimation();
    Animated.timing(boost, { toValue: to, duration, easing: motion.easing.press, useNativeDriver: NATIVE_DRIVER }).start();
  };

  // Base brightness breathes between 0.55 and 1; a press adds up to 0.35 more; the sum is held at 1.
  const opacity = Animated.add(
    pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
    boost.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }),
  ).interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1.03] });

  return (
    <View style={{ alignSelf: 'stretch' }}>
      {inactive ? null : (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', top: -REACH, bottom: -REACH, left: -REACH, right: -REACH }}>
          <Animated.View style={{ flex: 1, opacity, transform: [{ scale }] }}>
            {RINGS.map(({ inset, alpha }) => (
              <View
                key={inset}
                style={{
                  position: 'absolute',
                  top: inset,
                  bottom: inset,
                  left: inset,
                  right: inset,
                  borderRadius: radius.md + REACH - inset,
                  backgroundColor: withAlpha(colors.primary, alpha),
                }}
              />
            ))}
          </Animated.View>
        </View>
      )}
      <PrimaryButton
        {...props}
        onPressIn={(event) => {
          brighten(1, motion.duration.buttonPress);
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          brighten(0, motion.duration.buttonRelease * 2);
          onPressOut?.(event);
        }}
      />
    </View>
  );
}
