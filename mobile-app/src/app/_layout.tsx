import { Cinzel_500Medium, Cinzel_600SemiBold, Cinzel_700Bold, useFonts } from '@expo-google-fonts/cinzel';
import { Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo } from 'react';

import { createNavigationTheme } from '@/navigation/navigation-theme';
import { ThemeProvider, useTheme, useThemePreference } from '@/theme';

// Keep the native splash screen up until the display font AND the saved appearance preference are ready, so the first
// frame is already in the right theme and titles never flash in a fallback face.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

function AppShell() {
  const theme = useTheme();
  const { ready } = useThemePreference();
  const [fontsLoaded, fontError] = useFonts({ Cinzel_500Medium, Cinzel_600SemiBold, Cinzel_700Bold });
  const navigationTheme = useMemo(() => createNavigationTheme(theme), [theme]);
  const showApp = ready && (fontsLoaded || Boolean(fontError));

  useEffect(() => {
    if (showApp) SplashScreen.hideAsync();
  }, [showApp]);

  // The root view behind every screen (visible during transitions and over the Android navigation bar).
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme.colors.background]);

  // A font that fails to load is not fatal: text falls back to the platform face.
  if (!showApp) return null;

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      />
    </NavigationThemeProvider>
  );
}
