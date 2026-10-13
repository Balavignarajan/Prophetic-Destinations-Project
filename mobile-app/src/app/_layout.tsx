import { Cinzel_500Medium, Cinzel_600SemiBold, Cinzel_700Bold, useFonts } from '@expo-google-fonts/cinzel';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';

import { navigationTheme } from '@/navigation/navigation-theme';
import { colors } from '@/theme';

// Keep the native splash screen up until the display font is ready, so titles never flash in a fallback face.
SplashScreen.preventAutoHideAsync();
// The root view behind every screen (visible during transitions and over the Android navigation bar).
SystemUI.setBackgroundColorAsync(colors.background);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Cinzel_500Medium, Cinzel_600SemiBold, Cinzel_700Bold });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // A font that fails to load is not fatal: text falls back to the platform face.
  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </ThemeProvider>
  );
}
