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
  /** `large` (default, 56) is the original size; `medium` is 48 and `small` is 44. */
  size?: 'small' | 'medium' | 'large';
  /** `danger` outlines the button and its label in the error colour, for actions that erase something. */
  tone?: 'default' | 'danger';
  style?: StyleProp<ViewStyle>;
};

/** An outlined, quieter action next to (or instead of) the primary one. */
export function SecondaryButton({ label, size = 'large', tone = 'default', disabled, style, ...rest }: SecondaryButtonProps) {
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
          minHeight: size === 'small' ? layout.minTouchTarget : size === 'medium' ? layout.touchTarget : layout.buttonHeight,
          paddingHorizontal: size === 'small' ? spacing.lg : spacing.xl,
          borderRadius: radius.md,
          borderWidth: layout.hairline,
          borderColor: disabled ? colors.borderSubtle : tone === 'danger' ? colors.error : pressed ? colors.primary : colors.borderGold,
          backgroundColor: pressed ? colors.surfaceElevated : colors.transparent,
        },
        style,
      ]}
      {...rest}>
      <AppText variant="label" color={disabled ? 'disabledText' : tone === 'danger' ? 'error' : 'textPrimary'} align="center">
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
