import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { palette, useTheme, withAlpha } from '@/theme';
import { NATIVE_DRIVER, motion } from '@/theme/motion';

import { AnimatedPressable, usePressMotion } from './animated-pressable';
import { AppText } from './app-text';
import { PrimaryButton, type PrimaryButtonProps } from './primary-button';

/** One slow breath of light, in milliseconds: the glow widens and brightens, then softens. */
const CYCLE = 3200;
/** How far the faint fallback rings reach beyond the button. */
const REACH = 22;
/** Concentric, very faint rings. They are only the safety net for devices that cannot draw a soft shadow; the real glow is the blurred shadow. */
const RINGS = [
  { inset: 0, alpha: 0.022 },
  { inset: 6, alpha: 0.03 },
  { inset: 12, alpha: 0.04 },
  { inset: 17, alpha: 0.05 },
] as const;

/** Where the small stars twinkle, around the button's edges (never over the label). Each has its own size, start and rhythm, so they never pulse together. */
const STARS: { size: number; delay: number; cycle: number; at: ViewStyle }[] = [
  { size: 15, delay: 0, cycle: 3100, at: { left: '5%', top: -17 } },
  { size: 10, delay: 1500, cycle: 3500, at: { left: '27%', bottom: -15 } },
  { size: 12, delay: 800, cycle: 3700, at: { left: '56%', top: -19 } },
  { size: 17, delay: 2200, cycle: 3300, at: { right: '6%', top: -14 } },
  { size: 9, delay: 1100, cycle: 3000, at: { right: '22%', bottom: -14 } },
  { size: 11, delay: 2700, cycle: 3600, at: { right: -7, top: '48%' } },
];

/** A four-point sparkle: two tapered streaks that cross, and a small bright centre. It fades and turns slightly in, then out, and rests. */
function Sparkle({ size, delay, cycle, color, at }: { size: number; delay: number; cycle: number; color: string; at: ViewStyle }) {
  const [t] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const twinkle = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(
        Animated.sequence([
          Animated.timing(t, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER }),
          Animated.timing(t, { toValue: 0, duration: 760, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
          Animated.delay(Math.max(0, cycle - 1280)),
        ]),
      ),
    ]);
    twinkle.start();
    return () => twinkle.stop();
  }, [delay, cycle, t]);

  const clear = withAlpha(color, 0);
  return (
    <Animated.View
      style={[
        { position: 'absolute', width: size, height: size },
        at,
        {
          opacity: t,
          transform: [
            { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) },
            { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '20deg'] }) },
          ],
        },
      ]}>
      <LinearGradient colors={[clear, color, clear]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ position: 'absolute', left: 0, right: 0, top: size / 2 - 1, height: 2 }} />
      <LinearGradient colors={[clear, color, clear]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ position: 'absolute', top: 0, bottom: 0, left: size / 2 - 1, width: 2 }} />
      <View style={{ position: 'absolute', left: size / 2 - 1.5, top: size / 2 - 1.5, width: 3, height: 3, borderRadius: 1.5, backgroundColor: palette.textBright }} />
    </Animated.View>
  );
}

/**
 * The call to action that opens the app: a metallic antique-gold gradient button with a glossy upper edge and a slow beam of light that glides
 * across it, a soft golden glow that breathes behind it, and a few small stars that twinkle around its edges. It is the PrimaryButton in
 * behaviour: same label, same press feedback (a slight shrink, brighter glow), same touch area, the action runs at once. The label is the
 * dark text colour on every stop of the gradient (contrast above 6:1).
 *
 * Everything decorative sits in layers that take no layout space, ignore touches and are hidden from screen readers; only opacity, scale and
 * position move, on the native thread, and every loop stops when the screen goes away. With Reduce Motion on there is no movement at all: the
 * gradient and a still, gentle glow remain. A disabled or loading button falls back to the plain PrimaryButton, with no glow.
 */
export function GlowingButton(props: PrimaryButtonProps) {
  if (props.disabled || props.loading) return <PrimaryButton {...props} />;
  return <GlowingGoldButton {...props} />;
}

function GlowingGoldButton({ label, size = 'large', style, onPressIn, onPressOut, loading, disabled, ...rest }: PrimaryButtonProps) {
  const { colors, gradients, layout, radius, spacing, isDark } = useTheme();
  const reduce = useReduceMotion();
  const [pulse] = useState(() => new Animated.Value(0.5));
  const [boost] = useState(() => new Animated.Value(0));
  const [sweep] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (reduce) {
      pulse.setValue(0.5);
      sweep.setValue(0);
      return;
    }
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: CYCLE / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(pulse, { toValue: 0, duration: CYCLE / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    // a beam of light crosses the button, then the button rests for a couple of seconds
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.delay(2600),
        Animated.timing(sweep, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    breathe.start();
    shimmer.start();
    return () => {
      breathe.stop();
      shimmer.stop();
    };
  }, [reduce, pulse, sweep]);

  useEffect(() => () => boost.stopAnimation(), [boost]);

  const brighten = (to: number, duration: number) => {
    if (reduce) return;
    boost.stopAnimation();
    Animated.timing(boost, { toValue: to, duration, easing: motion.easing.press, useNativeDriver: NATIVE_DRIVER }).start();
  };
  const press = usePressMotion({
    scaleTo: motion.scale.button,
    onPressIn: (event) => {
      brighten(1, motion.duration.buttonPress);
      onPressIn?.(event);
    },
    onPressOut: (event) => {
      brighten(0, motion.duration.buttonRelease * 2);
      onPressOut?.(event);
    },
  });

  // Brightness breathes between `from` and `to`; a press adds a little more; the sum is held at 1.
  const glowOpacity = (from: number, to: number) =>
    Animated.add(
      pulse.interpolate({ inputRange: [0, 1], outputRange: [from, to] }),
      boost.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }),
    ).interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const wideOpacity = glowOpacity(0.5, 1);
  const tightOpacity = glowOpacity(0.9, 0.5);
  const wideScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.99, 1.035] });

  const radiusMd = radius.md;
  const starColor = isDark ? palette.metalBright : colors.primary;
  const gold = colors.primary;

  return (
    <View style={{ alignSelf: 'stretch' }}>
      {/* the glow: a soft blurred shadow in two strengths (wide and tight) that trade brightness, with faint rings as a fallback */}
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        <View style={{ position: 'absolute', top: -REACH, bottom: -REACH, left: -REACH, right: -REACH }}>
          {RINGS.map(({ inset, alpha }) => (
            <View
              key={inset}
              style={{
                position: 'absolute',
                top: inset,
                bottom: inset,
                left: inset,
                right: inset,
                borderRadius: radiusMd + REACH - inset,
                backgroundColor: withAlpha(gold, alpha),
              }}
            />
          ))}
        </View>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: radiusMd, backgroundColor: gold, boxShadow: `0 0 34px 5px ${withAlpha(gold, 0.42)}`, opacity: wideOpacity, transform: [{ scale: wideScale }] },
          ]}
        />
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: radiusMd, backgroundColor: gold, boxShadow: `0 0 14px 1px ${withAlpha(palette.metalBright, 0.6)}`, opacity: tightOpacity },
          ]}
        />
      </View>

      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={label}
        aria-disabled={Boolean(disabled)}
        aria-busy={Boolean(loading)}
        disabled={disabled}
        hitSlop={4}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={[
          {
            minHeight: size === 'small' ? layout.minTouchTarget : size === 'medium' ? layout.touchTarget : layout.buttonHeight,
            paddingHorizontal: size === 'small' ? spacing.lg : spacing.xl,
            borderRadius: radiusMd,
            borderWidth: 1,
            borderColor: withAlpha(palette.textBright, 0.32),
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
          press.scaleStyle,
        ]}
        {...rest}>
        <LinearGradient colors={gradients.metallicGold} start={{ x: 0, y: 0.25 }} end={{ x: 1, y: 0.75 }} style={StyleSheet.absoluteFill} />
        {/* a soft sheen along the upper edge */}
        <LinearGradient
          colors={[withAlpha(palette.textBright, 0.42), withAlpha(palette.textBright, 0)]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '58%' }}
        />
        {/* the beam of light that glides across */}
        {reduce || width === 0 ? null : (
          <Animated.View
            style={{
              position: 'absolute',
              top: -24,
              bottom: -24,
              width: 64,
              transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-100, width + 36] }) }, { rotate: '18deg' }],
            }}>
            <LinearGradient
              colors={[withAlpha(palette.textBright, 0), withAlpha(palette.textBright, 0.5), withAlpha(palette.textBright, 0)]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        )}
        {press.pressed ? <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(palette.deepBlack, 0.14) }]} /> : null}
        <AppText variant="label" color="onPrimary" align="center">
          {label}
        </AppText>
      </AnimatedPressable>

      {/* the small stars, around the edges */}
      {reduce ? null : (
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
          {STARS.map((star, index) => (
            <Sparkle key={index} size={star.size} delay={star.delay} cycle={star.cycle} color={starColor} at={star.at} />
          ))}
        </View>
      )}
    </View>
  );
}
