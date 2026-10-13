import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export type DividerProps = {
  /** `gold` is a quiet accent line; `default` is a neutral separator. */
  tone?: 'default' | 'gold';
  style?: StyleProp<ViewStyle>;
};

/** A one-pixel line. Decorative, so it is hidden from screen readers. */
export function Divider({ tone = 'default', style }: DividerProps) {
  const { colors, layout } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { height: layout.hairline, alignSelf: 'stretch', backgroundColor: tone === 'gold' ? colors.borderGold : colors.divider },
        style,
      ]}
    />
  );
}
