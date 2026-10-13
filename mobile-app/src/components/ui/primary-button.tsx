import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';

export type PrimaryButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  /** Shows a spinner and ignores presses while something is happening. */
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** The gold call to action. Use it once per screen for the main action. */
export function PrimaryButton({ label, loading = false, disabled, style, ...rest }: PrimaryButtonProps) {
  const { colors, layout, radius, shadows, spacing } = useTheme();
  const inactive = Boolean(disabled) || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={inactive}
      aria-busy={loading}
      disabled={inactive}
      hitSlop={4}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: layout.buttonHeight,
          paddingHorizontal: spacing.xl,
          borderRadius: radius.md,
          backgroundColor: disabled ? colors.disabled : pressed ? colors.primaryPressed : colors.primary,
        },
        !inactive && !pressed ? shadows.glow : null,
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={colors.onPrimary} />
      ) : (
        <AppText variant="label" color={disabled ? 'disabledText' : 'onPrimary'} align="center">
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
