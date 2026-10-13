import { colors, gradients } from './colors';
import { radius } from './radius';
import { shadows } from './shadows';
import { layout, spacing } from './spacing';
import { fontFamilies, typography } from './typography';

export { colors, gradients, palette, withAlpha } from './colors';
export type { ColorToken } from './colors';
export { radius } from './radius';
export { shadows } from './shadows';
export { layout, spacing } from './spacing';
export { fontFamilies, typography } from './typography';
export type { TypographyVariant } from './typography';

/** Everything a component needs to style itself, in one object. */
export const theme = {
  colors,
  gradients,
  spacing,
  layout,
  radius,
  shadows,
  typography,
  fontFamilies,
} as const;

export type Theme = typeof theme;

/**
 * The active theme. The app is dark-first and has exactly one theme today, so this returns a constant. Components
 * call it (rather than importing `theme` directly) so that adding a second theme later, with a provider, changes this
 * hook and nothing else.
 */
export function useTheme(): Theme {
  return theme;
}
