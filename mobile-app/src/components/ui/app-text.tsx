import { Text, type TextProps } from 'react-native';

import { type ColorToken, type TypographyVariant, useTheme } from '@/theme';

export type AppTextProps = TextProps & {
  /** Which typographic style to use. */
  variant?: TypographyVariant;
  /** A colour TOKEN (never a raw colour). */
  color?: ColorToken;
  align?: 'left' | 'center' | 'right';
};

/** The one text component: every piece of text takes its face, size and colour from the theme. */
export function AppText({
  variant = 'body',
  color = 'textPrimary',
  align,
  style,
  ...rest
}: AppTextProps) {
  const { typography, colors } = useTheme();
  return (
    <Text
      style={[typography[variant], { color: colors[color] }, align ? { textAlign: align } : null, style]}
      {...rest}
    />
  );
}
