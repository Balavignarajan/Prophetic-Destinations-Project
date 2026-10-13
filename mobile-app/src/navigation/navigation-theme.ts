import { DarkTheme, DefaultTheme } from 'expo-router';

import type { Theme } from '@/theme';

export type NavigationTheme = typeof DarkTheme;

/** The navigation container's colours, taken from the active app theme so transitions never flash a foreign colour. */
export function createNavigationTheme(theme: Theme): NavigationTheme {
  const base = theme.isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: theme.isDark,
    colors: {
      ...base.colors,
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.textPrimary,
      border: theme.colors.border,
      notification: theme.colors.primary,
    },
  };
}
