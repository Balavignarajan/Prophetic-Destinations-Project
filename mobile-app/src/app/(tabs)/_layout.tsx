import { Redirect, Tabs } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { TabIcon, type TabIconName } from '@/components/ui';
import { readWelcomeSeen } from '@/storage/preferences';
import { useTheme } from '@/theme';
import { NATIVE_DRIVER, motion } from '@/theme/motion';

/**
 * A tab's icon. The active tab sits on a small raised pill with a gold outline and a gold icon, so the state is shown by shape as well as colour.
 * The pill eases in and the icon settles into place when a tab is chosen (instantly with Reduce Motion). Only opacity and scale move, and the
 * pill is 30 points tall, so the standard tab-bar height still holds the icon and its label.
 */
function TabBarIcon({ name, color, focused }: { name: TabIconName; color: string; focused: boolean }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const pill = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const settle = useRef(new Animated.Value(1)).current;
  const mounted = useRef(false);

  useEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    if (reduce) {
      pill.setValue(focused ? 1 : 0);
      settle.setValue(1);
      return;
    }
    settle.setValue(focused && !first ? motion.scale.tabIcon : 1);
    const animation = Animated.parallel([
      Animated.timing(pill, { toValue: focused ? 1 : 0, duration: motion.duration.selection, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER }),
      Animated.timing(settle, { toValue: 1, duration: motion.duration.selection, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [focused, reduce, pill, settle]);

  return (
    <View style={{ width: 56, height: 30, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: 15, borderWidth: 1, borderColor: colors.borderGold, backgroundColor: colors.surfaceElevated, opacity: pill },
        ]}
      />
      <Animated.View style={{ transform: [{ scale: settle }] }}>
        <TabIcon name={name} color={focused ? colors.primary : color} size={22} />
      </Animated.View>
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
  const reduceMotion = useReduceMotion();
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
        // the screens cross-fade when a tab is chosen; with Reduce Motion they change at once
        animation: reduceMotion ? 'none' : 'fade',
        transitionSpec: { animation: 'timing', config: { duration: motion.duration.selection } },
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
