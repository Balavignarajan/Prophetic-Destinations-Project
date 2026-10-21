import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { palette, useTheme, withAlpha } from '@/theme';
import { NATIVE_DRIVER, motion } from '@/theme/motion';

import { AnimatedPressable, usePressMotion } from './animated-pressable';
import { AppText } from './app-text';
import { PrimaryButton, type PrimaryButtonProps } from './primary-button';

/*
 * SMOOTHNESS, in short. Every moving part runs from ONE native loop: a single timing from 0 to 1 that the native side repeats by itself, so a
 * busy JavaScript thread (a screen change, a font load) cannot make it stutter. What it should look like (a breath of light, a gliding beam,
 * a twinkle) is described by a table of points that the value is interpolated through, so the motion is eased exactly as drawn and every
 * loop ends where it began (no jump when it restarts). Interpolations are built once and reused, and a press does not re-render the button.
 */

/** One slow breath of light, in milliseconds. */
const CYCLE = 3600;
/** One beam of light crossing the button, then a long rest, in milliseconds. */
const SHIMMER = 4800;
/** The beam moves during the first part of the cycle. */
const SHIMMER_ACTIVE = 0.3;
/** How far the glow rings reach beyond the button. */
const REACH = 26;
/** Concentric, very faint rings; with so many, the steps blend into soft light. They breathe on top of the static glow. */
const RINGS = [
  { inset: 0, alpha: 0.014 },
  { inset: 4, alpha: 0.02 },
  { inset: 8, alpha: 0.028 },
  { inset: 12, alpha: 0.038 },
  { inset: 16, alpha: 0.05 },
  { inset: 20, alpha: 0.064 },
  { inset: 23, alpha: 0.078 },
] as const;

const STEPS = 24;
/** 0, 1/24, ... 1: the sample points of a full cycle. */
const PHASE = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS);
/** A smooth 0 -> 1 -> 0 (one full cosine), so the breath eases in and out and the loop seam is invisible. */
const BREATH = PHASE.map((u) => (1 - Math.cos(2 * Math.PI * u)) / 2);

/** Where the small stars twinkle, around the button's edges (never over the label). Each has its own size, start and rhythm. */
const STARS: { size: number; delay: number; cycle: number; at: ViewStyle }[] = [
  { size: 15, delay: 0, cycle: 3300, at: { left: '5%', top: -17 } },
  { size: 10, delay: 1500, cycle: 3700, at: { left: '27%', bottom: -15 } },
  { size: 12, delay: 800, cycle: 3900, at: { left: '56%', top: -19 } },
  { size: 17, delay: 2200, cycle: 3500, at: { right: '6%', top: -14 } },
  { size: 9, delay: 1100, cycle: 3200, at: { right: '22%', bottom: -14 } },
  { size: 11, delay: 2700, cycle: 3800, at: { right: -7, top: '48%' } },
];

// A twinkle fills the first 40% of a star's cycle (a soft rise and fall, sin squared) and rests for the rest.
const TWINKLE_POINTS = 16;
const TWINKLE_IN = [...Array.from({ length: TWINKLE_POINTS + 1 }, (_, i) => (0.4 * i) / TWINKLE_POINTS), 1];
const TWINKLE_BUMP = [...Array.from({ length: TWINKLE_POINTS + 1 }, (_, i) => Math.sin((Math.PI * i) / TWINKLE_POINTS) ** 2), 0];
const TWINKLE_SCALE = TWINKLE_BUMP.map((v) => 0.35 + 0.65 * v);
const TWINKLE_TURN = [...Array.from({ length: TWINKLE_POINTS + 1 }, (_, i) => `${-25 + (45 * i) / TWINKLE_POINTS}deg`), '20deg'];

/** A four-point sparkle: two tapered streaks that cross, and a small bright centre. It fades and turns slightly in, then out, and rests. */
function Sparkle({ size, delay, cycle, color, at }: { size: number; delay: number; cycle: number; color: string; at: ViewStyle }) {
  const [t] = useState(() => new Animated.Value(0));

  useEffect(() => {
    // after its own start delay, one native loop for the life of the screen
    const run = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(Animated.timing(t, { toValue: 1, duration: cycle, easing: Easing.linear, useNativeDriver: NATIVE_DRIVER }), { iterations: -1 }),
    ]);
    run.start();
    return () => run.stop();
  }, [delay, cycle, t]);

  const look = useMemo(
    () => ({
      opacity: t.interpolate({ inputRange: TWINKLE_IN, outputRange: TWINKLE_BUMP }),
      scale: t.interpolate({ inputRange: TWINKLE_IN, outputRange: TWINKLE_SCALE }),
      rotate: t.interpolate({ inputRange: TWINKLE_IN, outputRange: TWINKLE_TURN }),
    }),
    [t],
  );

  const clear = withAlpha(color, 0);
  return (
    <Animated.View
      style={[
        { position: 'absolute', width: size, height: size },
        at,
        { opacity: look.opacity, transform: [{ scale: look.scale }, { rotate: look.rotate }] },
      ]}>
      <LinearGradient colors={[clear, color, clear]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ position: 'absolute', left: 0, right: 0, top: size / 2 - 1, height: 2 }} />
      <LinearGradient colors={[clear, color, clear]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ position: 'absolute', top: 0, bottom: 0, left: size / 2 - 1, width: 2 }} />
      <View style={{ position: 'absolute', left: size / 2 - 1.5, top: size / 2 - 1.5, width: 3, height: 3, borderRadius: 1.5, backgroundColor: palette.textBright }} />
    </Animated.View>
  );
}

/**
 * The call to action that opens the app: a metallic antique-gold gradient button with a glossy upper edge, a beam of light that glides across
 * it every few seconds, a soft golden glow that breathes behind it, and a few small stars that twinkle around its edges. It is the PrimaryButton
 * in behaviour: same label, same press feedback (a slight shrink, a brighter glow, a touch of shade), same touch area, the action runs at once.
 * The label is the dark text colour on every stop of the gradient (contrast above 6:1).
 *
 * Everything decorative sits in layers that take no layout space, ignore touches and are hidden from screen readers; only opacity, scale and
 * position move, all on the native thread, and every loop stops when the screen goes away. With Reduce Motion on nothing moves: the gradient
 * and a still, gentle glow remain. A disabled or loading button falls back to the plain PrimaryButton, with no glow.
 */
export function GlowingButton(props: PrimaryButtonProps) {
  if (props.disabled || props.loading) return <PrimaryButton {...props} />;
  return <GlowingGoldButton {...props} />;
}

function GlowingGoldButton({ label, size = 'large', style, onPressIn, onPressOut, loading, disabled, ...rest }: PrimaryButtonProps) {
  const { colors, gradients, layout, radius, spacing, isDark } = useTheme();
  const reduce = useReduceMotion();
  const [breath] = useState(() => new Animated.Value(0));
  const [sweepPhase] = useState(() => new Animated.Value(0));
  const [boost] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (reduce) {
      breath.setValue(0.25); // the middle of the breath, held
      sweepPhase.setValue(0);
      return;
    }
    breath.setValue(0);
    sweepPhase.setValue(0);
    const breathing = Animated.loop(Animated.timing(breath, { toValue: 1, duration: CYCLE, easing: Easing.linear, useNativeDriver: NATIVE_DRIVER }), { iterations: -1 });
    const shimmer = Animated.loop(Animated.timing(sweepPhase, { toValue: 1, duration: SHIMMER, easing: Easing.linear, useNativeDriver: NATIVE_DRIVER }), { iterations: -1 });
    breathing.start();
    shimmer.start();
    return () => {
      breathing.stop();
      shimmer.stop();
    };
  }, [reduce, breath, sweepPhase]);

  useEffect(() => () => boost.stopAnimation(), [boost]);

  const brighten = (to: number, duration: number) => {
    if (reduce) return;
    boost.stopAnimation();
    Animated.timing(boost, { toValue: to, duration, easing: motion.easing.press, useNativeDriver: NATIVE_DRIVER }).start();
  };
  // `trackPressed: false`: the pressed look is drawn by `boost`, so pressing never re-renders this button.
  const press = usePressMotion({
    scaleTo: motion.scale.button,
    trackPressed: false,
    onPressIn: (event) => {
      brighten(1, motion.duration.buttonPress);
      onPressIn?.(event);
    },
    onPressOut: (event) => {
      brighten(0, motion.duration.buttonRelease * 2);
      onPressOut?.(event);
    },
  });

  // Built once (and again only if the button's width changes), so a re-render never makes the native side rebuild a running animation.
  const ringOpacity = useMemo(
    () =>
      Animated.add(
        breath.interpolate({ inputRange: PHASE, outputRange: BREATH.map((b) => 0.45 + 0.55 * b) }),
        boost.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }),
      ).interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    [breath, boost],
  );
  const ringScale = useMemo(() => breath.interpolate({ inputRange: PHASE, outputRange: BREATH.map((b) => 0.985 + 0.055 * b) }), [breath]);
  const pressShade = useMemo(() => boost.interpolate({ inputRange: [0, 1], outputRange: [0, 0.14] }), [boost]);
  const beamX = useMemo(() => {
    const from = -100;
    const to = width + 36;
    const n = 14;
    const input: number[] = [];
    const output: number[] = [];
    for (let i = 0; i <= n; i += 1) {
      const s = i / n;
      const eased = s < 0.5 ? 2 * s * s : 1 - ((-2 * s + 2) ** 2) / 2; // ease in, ease out
      input.push(SHIMMER_ACTIVE * s);
      output.push(from + (to - from) * eased);
    }
    input.push(1);
    output.push(to);
    return sweepPhase.interpolate({ inputRange: input, outputRange: output });
  }, [sweepPhase, width]);

  const radiusMd = radius.md;
  const gold = colors.primary;
  const starColor = isDark ? palette.metalBright : colors.primary;

  return (
    <View style={{ alignSelf: 'stretch' }}>
      {/* the glow: a still, soft blurred shadow, and on top of it rings of light that breathe (wider and brighter, then softer) */}
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: radiusMd,
              backgroundColor: gold,
              boxShadow: `0 0 30px 3px ${withAlpha(gold, 0.3)}, 0 0 12px 1px ${withAlpha(palette.metalBright, 0.45)}`,
            },
          ]}
        />
        <Animated.View
          style={{ position: 'absolute', top: -REACH, bottom: -REACH, left: -REACH, right: -REACH, opacity: ringOpacity, transform: [{ scale: ringScale }] }}>
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
        </Animated.View>
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
        onLayout={(event) => {
          const next = event.nativeEvent.layout.width;
          setWidth((current) => (Math.abs(current - next) < 0.5 ? current : next));
        }}
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
        {/* the beam of light that glides across, then rests */}
        {reduce || width === 0 ? null : (
          <Animated.View style={{ position: 'absolute', top: -24, bottom: -24, width: 64, transform: [{ translateX: beamX }, { rotate: '18deg' }] }}>
            <LinearGradient
              colors={[withAlpha(palette.textBright, 0), withAlpha(palette.textBright, 0.5), withAlpha(palette.textBright, 0)]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        )}
        {/* a touch of shade while pressed */}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.deepBlack, opacity: pressShade }]} />
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
