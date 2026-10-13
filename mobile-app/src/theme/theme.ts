import { type ColorTokens, type GradientTokens, type ThemeName, colorSchemes, createGradients } from './colors';
import { radius } from './radius';
import { type ShadowTokens, createShadows } from './shadows';
import { layout, spacing } from './spacing';
import { fontFamilies, typography } from './typography';

/** Everything a component needs to style itself, for one theme. */
export interface Theme {
  name: ThemeName;
  isDark: boolean;
  colors: ColorTokens;
  gradients: GradientTokens;
  shadows: ShadowTokens;
  spacing: typeof spacing;
  layout: typeof layout;
  radius: typeof radius;
  typography: typeof typography;
  fontFamilies: typeof fontFamilies;
}

export function createTheme(name: ThemeName): Theme {
  const isDark = name === 'dark';
  const colors = colorSchemes[name];
  return {
    name,
    isDark,
    colors,
    gradients: createGradients(name),
    shadows: createShadows(colors, isDark),
    spacing,
    layout,
    radius,
    typography,
    fontFamilies,
  };
}

/** Both themes, built once. */
export const themes: Record<ThemeName, Theme> = {
  dark: createTheme('dark'),
  light: createTheme('light'),
};
