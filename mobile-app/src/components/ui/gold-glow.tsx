import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

/**
 * A faint wash of antique gold that fades out downward, filling the surface it is placed in (first child of a card or panel). It is clipped
 * to `radius` in its own layer, so a shadow on the parent is not cut off, and it never intercepts a touch. Decorative and static: hidden from
 * screen readers, with no animation. Use it sparingly, on one or two featured surfaces per screen.
 */
export function GoldGlow({ radius }: { radius: number }) {
  const { gradients } = useTheme();
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <LinearGradient colors={gradients.goldGlow} style={StyleSheet.absoluteFill} />
    </View>
  );
}
