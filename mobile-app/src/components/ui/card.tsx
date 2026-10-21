import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';
import { motion } from '@/theme/motion';

import { AnimatedPressable, usePressMotion } from './animated-pressable';

export type CardProps = {
  children: ReactNode;
  /**
   * - `default`: standard navy surface with a quiet border.
   * - `elevated`: raised surface with a soft shadow, for featured content.
   * - `outlined`: standard surface with a gold hairline.
   * - `reading`: borderless, roomy surface for Scripture and longer text.
   * - `interactive`: a selectable card (use with `onPress`; `selected` adds the gold highlight).
   */
  variant?: 'default' | 'elevated' | 'outlined' | 'reading' | 'interactive';
  /** Makes the whole card a button. Then `accessibilityLabel` is required. */
  onPress?: () => void;
  accessibilityLabel?: string;
  /** For selectable cards: shows the gold highlight and tells screen readers the card is selected. */
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** A padded, rounded surface for grouped content. Only a card with `onPress` moves (a slight press-in); a plain card is static. */
export function Card({ children, variant = 'default', onPress, accessibilityLabel, selected, style }: CardProps) {
  const { colors, layout, radius, spacing, shadows } = useTheme();
  const isSelected = Boolean(selected);
  const base: ViewStyle = {
    padding: variant === 'reading' ? spacing.xl : spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: variant === 'elevated' || isSelected ? colors.surfaceElevated : colors.surface,
    borderWidth: isSelected ? 1.5 : variant === 'reading' ? 0 : layout.hairline,
    borderColor: isSelected ? colors.primary : variant === 'outlined' ? colors.borderGold : colors.borderSubtle,
  };
  const lift = variant === 'elevated' ? shadows.card : undefined;

  if (onPress) {
    return (
      <PressableCard base={base} lift={lift} onPress={onPress} accessibilityLabel={accessibilityLabel} selected={selected} style={style}>
        {children}
      </PressableCard>
    );
  }
  return <View style={[base, lift, style]}>{children}</View>;
}

function PressableCard({
  children,
  base,
  lift,
  onPress,
  accessibilityLabel,
  selected,
  style,
}: {
  children: ReactNode;
  base: ViewStyle;
  lift: ViewStyle | undefined;
  onPress: () => void;
  accessibilityLabel?: string;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, layout } = useTheme();
  const press = usePressMotion({ scaleTo: motion.scale.card, pressMs: motion.duration.cardPress, releaseMs: motion.duration.cardPress + 20 });
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        base,
        lift,
        { minHeight: layout.touchTarget },
        press.pressed ? { backgroundColor: colors.surfaceElevated, borderColor: colors.borderGold } : null,
        style,
        press.scaleStyle,
      ]}>
      {children}
    </AnimatedPressable>
  );
}
