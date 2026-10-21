import {
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme';
import { motion } from '@/theme/motion';

import { AnimatedPressable, usePressMotion } from './animated-pressable';
import { AppText } from './app-text';

export type SecondaryButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  /** `large` (default, 56) is the original size; `medium` is 48 and `small` is 44. */
  size?: 'small' | 'medium' | 'large';
  /** `danger` outlines the button and its label in the error colour, for actions that erase something. */
  tone?: 'default' | 'danger';
  style?: StyleProp<ViewStyle>;
};

/** An outlined, quieter action next to (or instead of) the primary one. Same press feedback as the primary button; destructive ones shrink less. */
export function SecondaryButton({ label, size = 'large', tone = 'default', disabled, style, onPressIn, onPressOut, ...rest }: SecondaryButtonProps) {
  const { colors, layout, radius, spacing } = useTheme();
  const press = usePressMotion({
    scaleTo: tone === 'danger' ? motion.scale.buttonQuiet : motion.scale.button,
    disabled: Boolean(disabled),
    onPressIn,
    onPressOut,
  });
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={Boolean(disabled)}
      disabled={disabled}
      hitSlop={4}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        styles.base,
        {
          minHeight: size === 'small' ? layout.minTouchTarget : size === 'medium' ? layout.touchTarget : layout.buttonHeight,
          paddingHorizontal: size === 'small' ? spacing.lg : spacing.xl,
          borderRadius: radius.md,
          borderWidth: layout.hairline,
          borderColor: disabled ? colors.borderSubtle : tone === 'danger' ? colors.error : press.pressed ? colors.primary : colors.borderGold,
          backgroundColor: press.pressed ? colors.surfaceElevated : colors.transparent,
        },
        style,
        press.scaleStyle,
      ]}
      {...rest}>
      <AppText variant="label" color={disabled ? 'disabledText' : tone === 'danger' ? 'error' : 'textPrimary'} align="center">
        {label}
      </AppText>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
