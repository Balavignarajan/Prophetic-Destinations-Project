import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';

import { readWelcomeSeen } from '@/storage/preferences';
import { useTheme } from '@/theme';

/**
 * The four primary areas the specification names: Home, Learn, Progress and More. Before the first welcome screen has been passed
 * the learner is sent to it once; after that the app opens on Home. Everything here works offline (Home, Progress and More read
 * device-local data; Learn shows its saved copy).
 */
export default function TabsLayout() {
  const { colors, typography } = useTheme();
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    readWelcomeSeen().then((value) => {
      if (!cancelled) setSeen(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (seen === null) return null;
  if (!seen) return <Redirect href="/welcome" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryHighlight,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: typography.label.fontSize, fontWeight: '600' },
        tabBarIconStyle: { display: 'none' },
        tabBarItemStyle: { justifyContent: 'center' },
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarAccessibilityLabel: 'Home' }} />
      <Tabs.Screen name="learn" options={{ title: 'Learn', tabBarAccessibilityLabel: 'Learn' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarAccessibilityLabel: 'Progress' }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarAccessibilityLabel: 'More' }} />
    </Tabs>
  );
}
