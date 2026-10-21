import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

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

/** A padded, rounded surface for grouped content. */
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={selected === undefined ? undefined : { selected: isSelected }}
        onPress={onPress}
        style={({ pressed }) => [
          base,
          lift,
          { minHeight: layout.touchTarget },
          pressed ? { backgroundColor: colors.surfaceElevated, borderColor: colors.borderGold } : null,
          style,
        ]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[base, lift, style]}>{children}</View>;
}
