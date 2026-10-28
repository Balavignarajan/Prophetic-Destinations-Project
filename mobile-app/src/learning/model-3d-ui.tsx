import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, type StyleProp, View, type ViewStyle } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { AppText, PrimaryButton } from '@/components/ui';
import { useTheme, withAlpha } from '@/theme';
import { NATIVE_DRIVER, motion } from '@/theme/motion';

/**
 * The small building blocks of the 3D experience, shared by the lesson card (model-3d-block.tsx), the full-screen viewer (model-3d-viewer.tsx) and its panels (model-3d-panels.tsx): a drawn cube,
 * the icons of the controls, round and pill buttons that float over the model, the numbered medallion that echoes the markers on the model, the entrance of a panel, and the loading and error
 * cards. Everything takes its colours, type and spacing from the theme (dark and light), nothing is an image or an icon font, and nothing here animates except a panel's one-time entrance.
 */

/**
 * A small wireframe cube drawn with views: a back square, a front square that hides the back one's covered edges, and three edges joining them. Decorative: hidden from screen readers.
 */
export function CubeIcon({ size, color, fill }: { size: number; color: string; fill: string }) {
  const stroke = 2;
  const depth = Math.round(size * 0.3);
  const side = size - depth;
  const diagonal = Math.round(depth * Math.SQRT2);
  // One edge from the front square to the back square, centred on (x, y), rising to the right.
  const edge = (x: number, y: number) => ({ position: 'absolute' as const, left: x - diagonal / 2, top: y - stroke / 2, width: diagonal, height: stroke, backgroundColor: color, transform: [{ rotate: '-45deg' }] });
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', left: depth, top: 0, width: side, height: side, borderWidth: stroke, borderColor: color }} />
      <View style={edge(depth / 2, depth / 2)} />
      <View style={edge(side + depth / 2, depth / 2)} />
      <View style={edge(side + depth / 2, side + depth / 2)} />
      <View style={{ position: 'absolute', left: 0, top: depth, width: side, height: side, borderWidth: stroke, borderColor: color, backgroundColor: fill }} />
    </View>
  );
}

export type GlyphName = 'left' | 'right' | 'close' | 'help';

/** An icon drawn with views: a chevron to the left or right, a cross, or a question mark. Decorative (the button that holds it carries the name). */
export function Glyph({ name, color, size = 16 }: { name: GlyphName; color: string; size?: number }) {
  const stroke = 2;
  if (name === 'close') {
    const bar = { position: 'absolute' as const, left: 0, top: (size - stroke) / 2, width: size, height: stroke, borderRadius: 1, backgroundColor: color };
    return (
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
        <View style={[bar, { transform: [{ rotate: '45deg' }] }]} />
        <View style={[bar, { transform: [{ rotate: '-45deg' }] }]} />
      </View>
    );
  }
  if (name === 'help') {
    return (
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <AppText variant="label" allowFontScaling={false} style={{ color, fontSize: size, lineHeight: size + 4, textTransform: 'none' }}>
          ?
        </AppText>
      </View>
    );
  }
  // A chevron is the corner of a square turned a quarter-eighth round; it is moved a little so it looks centred.
  const edge = Math.round(size * 0.62);
  const left = name === 'left';
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: edge,
          height: edge,
          borderColor: color,
          borderLeftWidth: left ? stroke : 0,
          borderBottomWidth: left ? stroke : 0,
          borderRightWidth: left ? 0 : stroke,
          borderTopWidth: left ? 0 : stroke,
          transform: [{ translateX: left ? edge * 0.35 : -edge * 0.35 }, { rotate: '45deg' }],
        }}
      />
    </View>
  );
}

/**
 * A round control that floats over the model: 44 points, named for screen readers, a quiet border of gold. `float` is a translucent disc (back, help), `filled` is gold (the main step, Next), `plain`
 * has no disc (a close button inside a panel). It is dimmed and inert when disabled.
 */
export function RoundButton({
  glyph,
  label,
  hint,
  onPress,
  disabled = false,
  tone = 'float',
}: {
  glyph: GlyphName;
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'float' | 'filled' | 'plain';
}) {
  const { colors, layout } = useTheme();
  const size = layout.minTouchTarget;
  const glyphColor = disabled ? colors.textMuted : tone === 'filled' ? colors.onPrimary : colors.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: tone === 'plain' ? 0 : layout.hairline,
        borderColor: tone === 'filled' ? colors.primary : colors.borderGold,
        backgroundColor:
          tone === 'filled'
            ? pressed
              ? colors.primaryPressed
              : colors.primary
            : tone === 'plain'
              ? pressed
                ? colors.surface
                : colors.transparent
              : pressed
                ? colors.surfaceElevated
                : withAlpha(colors.surface, 0.9),
        opacity: disabled ? 0.4 : 1,
      })}>
      <Glyph name={glyph} color={glyphColor} />
    </Pressable>
  );
}

/**
 * A pill-shaped control with a short label (44 points high at least): `float` (translucent, over the model), `outline` (inside a panel) or `filled` (gold). `leading` is an optional drawn icon or
 * badge before the label. `accessibilityLabel` names it in full when the visible label is short.
 */
export function Pill({
  label,
  accessibilityLabel,
  hint,
  onPress,
  disabled = false,
  variant = 'float',
  leading,
  grow = false,
  expanded,
}: {
  label: string;
  accessibilityLabel?: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'float' | 'outline' | 'filled';
  leading?: ReactNode;
  grow?: boolean;
  expanded?: boolean;
}) {
  const { colors, spacing, radius, layout } = useTheme();
  const filled = variant === 'filled';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={hint}
      accessibilityState={{ disabled, expanded }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        minHeight: layout.minTouchTarget,
        minWidth: layout.minTouchTarget,
        flexGrow: grow ? 1 : 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.pill,
        borderWidth: layout.hairline,
        borderColor: filled ? colors.primary : colors.borderGold,
        backgroundColor: filled
          ? pressed
            ? colors.primaryPressed
            : colors.primary
          : variant === 'outline'
            ? pressed
              ? colors.surface
              : colors.transparent
            : pressed
              ? colors.surfaceElevated
              : withAlpha(colors.surface, 0.9),
        opacity: disabled ? 0.4 : 1,
      })}>
      {leading}
      <AppText variant="label" color={disabled ? 'textMuted' : filled ? 'onPrimary' : variant === 'outline' ? 'primaryHighlight' : 'textPrimary'} align="center" style={{ flexShrink: 1 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * A numbered medallion that echoes the markers on the model: a gold face with a dark rim inside a thin gold ring (the chosen one in brighter gold). Decorative: the number is always also in the
 * text of the control or panel that holds it.
 */
export function NumberBadge({ value, size = 32, active = false }: { value: number; size?: number; active?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size + 6, height: size + 6, borderRadius: (size + 6) / 2, borderWidth: 1, borderColor: withAlpha(colors.primary, active ? 0.9 : 0.55), alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: colors.onPrimary,
          backgroundColor: active ? colors.primaryHighlight : colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <AppText variant="caption" color="onPrimary" style={{ fontWeight: '700' }} allowFontScaling={false}>
          {value}
        </AppText>
      </View>
    </View>
  );
}

/**
 * Brings its content in once, when it appears: it fades in and rises (or comes in from the right, or settles from the top). That is all: no exit animation, no callback and no state, so the content
 * is removed the instant its owner stops rendering it and a half-run animation can never keep anything on screen. With Reduce Motion it just appears. The wrapper passes touches through
 * (`box-none`), so only the content inside it ever takes one.
 */
export function RiseIn({ children, from = 'bottom', delay = 0, style }: { children: ReactNode; from?: 'bottom' | 'right' | 'top'; delay?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const [progress] = useState(() => new Animated.Value(reduce ? 1 : 0));
  useEffect(() => {
    if (reduce) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, { toValue: 1, delay, duration: motion.duration.modal, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER });
    animation.start();
    return () => animation.stop();
  }, [reduce, progress, delay]);
  const translate = progress.interpolate({ inputRange: [0, 1], outputRange: [from === 'right' ? 40 : from === 'top' ? -12 : motion.offset.sheet, 0] });
  return (
    <Animated.View pointerEvents="box-none" style={[{ opacity: progress, transform: from === 'right' ? [{ translateX: translate }] : [{ translateY: translate }] }, style]}>
      {children}
    </Animated.View>
  );
}

/** The short hint over the model ("Drag to rotate · Pinch to zoom"): a quiet pill that never takes a touch. */
export function HintPill({ text }: { text: string }) {
  const { colors, spacing, radius, layout } = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: radius.pill,
        borderWidth: layout.hairline,
        borderColor: colors.borderGold,
        backgroundColor: withAlpha(colors.surface, 0.9),
      }}>
      <AppText variant="bodySmall" color="textSecondary" align="center">
        {text}
      </AppText>
    </View>
  );
}

/**
 * Shown while the model downloads and is prepared: the cube, a friendly line, the real status and, when the size is known, the real percentage as a thin gold line (no invented progress; while it
 * is unknown or the model is being prepared, a small spinner). It takes no touch, so the header's Close is always reachable.
 */
export function LoadingCard({ status, percent }: { status: string; percent: number | null }) {
  const { colors, spacing, radius, layout } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Preparing your 3D experience. ${status}`}
      accessibilityLiveRegion="polite"
      accessibilityValue={percent === null ? undefined : { min: 0, max: 100, now: percent }}
      style={{
        alignItems: 'center',
        gap: spacing.md,
        width: '100%',
        maxWidth: 300,
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.xl,
        borderRadius: radius.xl,
        borderWidth: layout.hairline,
        borderColor: colors.borderSubtle,
        backgroundColor: withAlpha(colors.surface, 0.8),
      }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, borderWidth: layout.hairline, borderColor: colors.borderGold, alignItems: 'center', justifyContent: 'center' }}>
        <CubeIcon size={30} color={colors.primaryHighlight} fill={colors.surface} />
      </View>
      <AppText variant="heading" align="center" style={{ fontSize: 18, lineHeight: 26 }}>
        Preparing your 3D experience
      </AppText>
      <AppText variant="bodySmall" color="textSecondary" align="center">
        {status}
      </AppText>
      {percent === null ? (
        <ActivityIndicator color={colors.primaryHighlight} />
      ) : (
        <View style={{ width: 180, height: 3, borderRadius: 2, backgroundColor: colors.borderSubtle, overflow: 'hidden' }}>
          <View style={{ width: `${percent}%`, height: 3, backgroundColor: colors.primary }} />
        </View>
      )}
    </View>
  );
}

/**
 * What the learner sees when the model cannot be shown: a mark, a clear title, a short plain explanation, Try again where trying again can help, and Close always. No code, no stack, no
 * internals: the text comes from the viewer's table of plain-language messages.
 */
export function ErrorCard({ title, message, canRetry, onRetry, onClose }: { title: string; message: string; canRetry: boolean; onRetry: () => void; onClose: () => void }) {
  const { colors, spacing, radius, layout } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={{
        alignItems: 'center',
        gap: spacing.md,
        width: '100%',
        maxWidth: 340,
        padding: spacing.xl,
        borderRadius: radius.xl,
        borderWidth: layout.hairline,
        borderColor: colors.borderGold,
        backgroundColor: colors.surfaceElevated,
      }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 52, height: 52, borderRadius: 26, borderWidth: layout.hairline, borderColor: colors.borderGold, alignItems: 'center', justifyContent: 'center' }}>
        <AppText variant="heading" color="primaryHighlight" allowFontScaling={false}>
          !
        </AppText>
      </View>
      <AppText variant="heading" align="center" accessibilityRole="header">
        {title}
      </AppText>
      <AppText variant="bodySmall" color="textSecondary" align="center">
        {message}
      </AppText>
      <View style={{ alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm }}>
        {canRetry ? <PrimaryButton label="Try again" size="medium" onPress={onRetry} /> : null}
        <Pill label="Close" accessibilityLabel="Close the 3D viewer" variant="outline" onPress={onClose} grow />
      </View>
    </View>
  );
}
