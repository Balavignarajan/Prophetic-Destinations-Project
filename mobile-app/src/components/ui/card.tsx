import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export type CardProps = {
  children: ReactNode;
  variant?: 'default' | 'elevated' | 'outlined';
  /** Makes the whole card a button. Then `accessibilityLabel` is required. */
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** A padded, rounded surface for grouped content. */
export function Card({ children, variant = 'default', onPress, accessibilityLabel, style }: CardProps) {
  const { colors, layout, radius, spacing, shadows } = useTheme();
  const base: ViewStyle = {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: variant === 'elevated' ? colors.surfaceElevated : colors.surface,
    borderWidth: layout.hairline,
    borderColor: variant === 'outlined' ? colors.borderGold : colors.borderSubtle,
  };
  const lift = variant === 'elevated' ? shadows.card : undefined;

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [base, lift, pressed ? { backgroundColor: colors.surfaceElevated } : null, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[base, lift, style]}>{children}</View>;
}
