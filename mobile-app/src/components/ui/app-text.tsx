import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { type ColorToken, type TypographyVariant, resolveFontFace, useTheme } from '@/theme';

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
  const merged: TextStyle = StyleSheet.flatten([typography[variant], { color: colors[color] }, align ? { textAlign: align } : null, style]);
  // Inter and EB Garamond are separate font files per weight/style: pick the real face for a bold or italic override.
  const face = resolveFontFace(merged.fontFamily, merged.fontWeight, merged.fontStyle);
  if (!face) return <Text style={merged} {...rest} />;
  return <Text style={[merged, { fontFamily: face.fontFamily, fontWeight: 'normal', fontStyle: face.italicIncluded ? 'normal' : merged.fontStyle }]} {...rest} />;
}
