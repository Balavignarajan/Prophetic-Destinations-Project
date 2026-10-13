import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export type IconButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  /** Required: an icon has no visible text, so a screen reader needs this. */
  accessibilityLabel: string;
  children: ReactNode;
  /** `filled` is a dark disc for use over photographs; `ghost` has no background. */
  tone?: 'filled' | 'ghost';
  style?: StyleProp<ViewStyle>;
};

/** A round 48-point touch target around an icon. */
export function IconButton({ children, tone = 'filled', disabled, style, ...rest }: IconButtonProps) {
  const { colors, layout, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [
        styles.base,
        {
          width: layout.touchTarget,
          height: layout.touchTarget,
          borderRadius: radius.pill,
        },
        tone === 'filled'
          ? {
              backgroundColor: pressed ? colors.overlay : colors.scrim,
              borderWidth: layout.hairline,
              borderColor: colors.borderGold,
            }
          : { backgroundColor: pressed ? colors.scrim : colors.transparent },
        disabled ? { opacity: 0.4 } : null,
        style,
      ]}
      {...rest}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
