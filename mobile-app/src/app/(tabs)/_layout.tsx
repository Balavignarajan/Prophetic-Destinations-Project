import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { TabIcon, type TabIconName } from '@/components/ui';
import { readWelcomeSeen } from '@/storage/preferences';
import { useTheme } from '@/theme';

/**
 * A tab's icon. The active tab sits on a small raised pill with a gold outline and a gold icon, so the state is shown by shape as well as colour.
 * The pill is only 30 points tall, so the standard tab-bar height still holds the icon and its label.
 */
function TabBarIcon({ name, color, focused }: { name: TabIconName; color: string; focused: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 56,
        height: 30,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: focused ? colors.borderGold : colors.transparent,
        backgroundColor: focused ? colors.surfaceElevated : colors.transparent,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <TabIcon name={name} color={focused ? colors.primary : color} size={22} />
    </View>
  );
}

/**
 * The four primary areas the specification names: Home, Learn, Progress and More. Before the first welcome screen has been passed
 * the learner is sent to it once; after that the app opens on Home. Everything here works offline (Home, Progress and More read
 * device-local data; Learn shows its saved copy).
 */
export default function TabsLayout() {
  const { colors, fontFamilies } = useTheme();
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
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1 },
        tabBarLabelStyle: { fontSize: 13, lineHeight: 16, fontFamily: fontFamilies.sansSemiBold, marginTop: 2 },
        tabBarItemStyle: { minHeight: 48 },
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarAccessibilityLabel: 'Home', tabBarIcon: (props) => <TabBarIcon name="home" {...props} /> }} />
      <Tabs.Screen name="learn" options={{ title: 'Learn', tabBarAccessibilityLabel: 'Learn', tabBarIcon: (props) => <TabBarIcon name="learn" {...props} /> }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarAccessibilityLabel: 'Progress', tabBarIcon: (props) => <TabBarIcon name="progress" {...props} /> }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarAccessibilityLabel: 'More', tabBarIcon: (props) => <TabBarIcon name="more" {...props} /> }} />
    </Tabs>
  );
}
