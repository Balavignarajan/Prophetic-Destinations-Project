import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';

export type SecondaryButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  style?: StyleProp<ViewStyle>;
};

/** An outlined, quieter action next to (or instead of) the primary one. */
export function SecondaryButton({ label, disabled, style, ...rest }: SecondaryButtonProps) {
  const { colors, layout, radius, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={Boolean(disabled)}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: layout.buttonHeight,
          paddingHorizontal: spacing.xl,
          borderRadius: radius.md,
          borderWidth: layout.hairline,
          borderColor: disabled ? colors.border : colors.primary,
          backgroundColor: pressed ? colors.surfaceElevated : colors.transparent,
        },
        style,
      ]}
      {...rest}>
      <AppText variant="label" color={disabled ? 'disabledText' : 'primaryHighlight'} align="center">
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
