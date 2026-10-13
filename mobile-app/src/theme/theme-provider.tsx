import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';

import {
  DEFAULT_THEME_PREFERENCE,
  type ThemePreference,
  readThemePreference,
  saveThemePreference,
} from '@/storage/preferences';

import type { ThemeName } from './colors';
import { type Theme, themes } from './theme';

type ThemeContextValue = {
  /** The theme currently in force. */
  theme: Theme;
  /** What the user chose: `system`, `light` or `dark`. */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** False until the saved preference has been read. The app should not draw themed UI before this is true. */
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: themes.dark,
  preference: DEFAULT_THEME_PREFERENCE,
  setPreference: () => undefined,
  ready: false,
});

/**
 * Which theme a preference means right now. `system` follows the device (and falls back to dark if the device reports
 * nothing); `light` and `dark` ignore the device.
 */
export function resolveThemeName(preference: ThemePreference, systemScheme: string | null | undefined): ThemeName {
  if (preference === 'system') return systemScheme === 'light' ? 'light' : 'dark';
  return preference;
}

/**
 * Holds the appearance preference and provides the matching theme to the whole tree.
 *
 * - The saved preference is read once at start-up; until then `ready` is false (the root layout keeps the splash screen up),
 *   so the first themed frame is already the right one.
 * - A first-time user has no saved value and gets dark.
 * - With `system`, the theme follows the device and changes live when the device switches appearance.
 * - Changing the preference updates every themed component immediately and saves the choice.
 * - On iOS and Android the native appearance (status bar icons, keyboard, system dialogs) is aligned with an explicit
 *   choice through `Appearance.setColorScheme`. That API does not exist on the web, so it is skipped there.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_THEME_PREFERENCE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readThemePreference().then((saved) => {
      if (cancelled) return;
      if (saved) setPreferenceState(saved);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }, [preference, ready]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void saveThemePreference(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: themes[resolveThemeName(preference, systemScheme)],
      preference,
      setPreference,
      ready,
    }),
    [preference, systemScheme, setPreference, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The theme in force. Every component styles itself from this, so it follows the user's choice live. */
export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

/** The appearance preference and how to change it (for the Settings screen), plus whether it has loaded. */
export function useThemePreference() {
  const { preference, setPreference, ready, theme } = useContext(ThemeContext);
  return { preference, setPreference, ready, themeName: theme.name };
}
