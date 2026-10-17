import { Cinzel_500Medium, Cinzel_600SemiBold, Cinzel_700Bold, useFonts } from '@expo-google-fonts/cinzel';
import { type ErrorBoundaryProps, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo } from 'react';

import { ErrorState, ScreenContainer } from '@/components/ui';
import { BookmarksProvider } from '@/features/bookmarks/bookmarks-provider';
import { LearningProgressProvider } from '@/features/learning/learning-provider';
import { createNavigationTheme } from '@/navigation/navigation-theme';
import { ThemeProvider, useTheme, useThemePreference } from '@/theme';

// Keep the native splash screen up until the display font AND the saved appearance preference are ready, so the first
// frame is already in the right theme and titles never flash in a fallback face.
SplashScreen.preventAutoHideAsync();

/**
 * Expo Router renders this if a screen throws while rendering, instead of a blank screen. It sits OUTSIDE the providers, so it
 * uses the dark theme directly and no hooks that need a provider.
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <ThemeProvider>
      <ScreenContainer>
        <ErrorState title="Something went wrong" message="The screen could not be shown. Your saved data is safe." onRetry={retry} />
      </ScreenContainer>
    </ThemeProvider>
  );
}

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
      <BookmarksProvider>
        <LearningProgressProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.colors.background },
            }}
          />
        </LearningProgressProvider>
      </BookmarksProvider>
    </NavigationThemeProvider>
  );
}
