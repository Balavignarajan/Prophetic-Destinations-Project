import { StyleSheet, View } from 'react-native';

export type TabIconName = 'home' | 'learn' | 'progress' | 'more';

/**
 * Bottom-tab icons drawn with plain views (the same approach as ChevronIcon and SettingsIcon), so they look identical on iOS,
 * Android and the web with no icon font, SVG library or SF Symbols. `color` is a resolved colour from the tab bar.
 * Decorative: hidden from screen readers; the tab's own label names the destination.
 */
export function TabIcon({ name, color, size = 24 }: { name: TabIconName; color: string; size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {name === 'home' ? <Home size={size} color={color} /> : null}
      {name === 'learn' ? <Book size={size} color={color} /> : null}
      {name === 'progress' ? <Bars size={size} color={color} /> : null}
      {name === 'more' ? <Grid size={size} color={color} /> : null}
    </View>
  );
}

type Part = { size: number; color: string };

const STROKE = 2;

/** A pitched roof over a body with a door. */
function Home({ size, color }: Part) {
  const roof = size * 0.6;
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      <View
        style={{
          width: roof,
          height: roof,
          marginTop: size * 0.1,
          borderLeftWidth: STROKE,
          borderTopWidth: STROKE,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: size * 0.06,
          width: size * 0.64,
          height: size * 0.44,
          borderWidth: STROKE,
          borderTopWidth: 0,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}>
        <View style={{ width: size * 0.2, height: size * 0.24, backgroundColor: color }} />
      </View>
    </View>
  );
}

/** An open book: two pages meeting at a spine. */
function Book({ size, color }: Part) {
  const page = { width: size * 0.46, height: size * 0.62, borderWidth: STROKE, borderColor: color } as const;
  return (
    <View style={[styles.rowCenter, { width: size, height: size }]}>
      <View style={[page, { borderTopLeftRadius: 5, borderBottomLeftRadius: 2 }]} />
      <View style={[page, { borderTopRightRadius: 5, borderBottomRightRadius: 2, marginLeft: -STROKE }]} />
    </View>
  );
}

/** Three rising bars. */
function Bars({ size, color }: Part) {
  const width = size * 0.2;
  return (
    <View style={[styles.rowCenter, { width: size, height: size, alignItems: 'flex-end', gap: size * 0.1, paddingBottom: size * 0.1 }]}>
      {[0.4, 0.65, 0.9].map((height) => (
        <View key={height} style={{ width, height: size * height, borderRadius: 2, backgroundColor: color }} />
      ))}
    </View>
  );
}

/** A two-by-two grid of rounded squares. */
function Grid({ size, color }: Part) {
  const cell = size * 0.38;
  return (
    <View style={{ width: size, height: size, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'center', gap: size * 0.1 }}>
      {[0, 1, 2, 3].map((key) => (
        <View key={key} style={{ width: cell, height: cell, borderRadius: 3, backgroundColor: color }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rowCenter: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
});
