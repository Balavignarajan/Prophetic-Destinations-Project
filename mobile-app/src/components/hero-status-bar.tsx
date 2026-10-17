import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';

/**
 * Light status-bar icons for a screen that sits over a (always dark) picture, applied ONLY while that screen is focused.
 *
 * Why not render `<StatusBar style="light" />` directly: in a stack the previous screen stays mounted underneath the next one,
 * and the most recently mounted `StatusBar` wins. A Welcome screen that stays mounted would keep forcing white icons onto
 * every Light-theme screen opened after it (white clock on ivory). Unmounting this component on blur hands control back to the
 * theme-driven `StatusBar` in the root layout.
 */
export function HeroStatusBar() {
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused ? <StatusBar style="light" /> : null;
}
