import { DarkTheme } from 'expo-router';

import { colors } from '@/theme';

export type NavigationTheme = typeof DarkTheme;

/** The navigation container's colours, taken from the app theme so transitions never flash a foreign colour. */
export const navigationTheme: NavigationTheme = {
  ...DarkTheme,
  dark: true,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
    notification: colors.primary,
  },
};
