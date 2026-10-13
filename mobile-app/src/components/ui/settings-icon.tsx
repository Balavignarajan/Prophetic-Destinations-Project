import { StyleSheet, View } from 'react-native';

import { type ColorToken, useTheme } from '@/theme';

/** Three sliders drawn with plain views (no icon font). Decorative: hidden from screen readers; the button names it. */
export function SettingsIcon({ color = 'textPrimary', size = 20 }: { color?: ColorToken; size?: number }) {
  const { colors } = useTheme();
  const knob = Math.round(size * 0.3);
  const rows = [0.25, 0.7, 0.45];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, justifyContent: 'space-between' }}>
      {rows.map((offset, index) => (
        <View key={index} style={styles.row}>
          <View style={{ height: 2, borderRadius: 1, backgroundColor: colors[color], width: size }} />
          <View
            style={{
              position: 'absolute',
              left: Math.round((size - knob) * offset),
              width: knob,
              height: knob,
              borderRadius: knob,
              backgroundColor: colors[color],
            }}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: 6, justifyContent: 'center' },
});
