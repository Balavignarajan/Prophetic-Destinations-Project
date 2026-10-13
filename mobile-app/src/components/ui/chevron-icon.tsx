import { StyleSheet, View } from 'react-native';

import { type ColorToken, useTheme } from '@/theme';

export type ChevronIconProps = {
  direction?: 'left' | 'right';
  color?: ColorToken;
  size?: number;
};

/** A small chevron drawn with a bordered, rotated view (no icon font needed). Decorative: it is hidden from screen readers. */
export function ChevronIcon({ direction = 'left', color = 'textPrimary', size = 12 }: ChevronIconProps) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.arm,
        {
          width: size,
          height: size,
          borderColor: colors[color],
          transform: [
            { rotate: direction === 'left' ? '45deg' : '-135deg' },
            { translateX: direction === 'left' ? size * 0.2 : size * 0.2 },
          ],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  arm: {
    borderLeftWidth: 2,
    borderBottomWidth: 2,
  },
});
