import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';

export type OptionRowProps = {
  title: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
};

/**
 * One choice in a radio-style list. The selected state is shown three ways (gold border, filled dot, bold weight of the
 * indicator) and announced to screen readers as "selected", so it never depends on colour alone.
 */
export function OptionRow({ title, description, selected, onSelect }: OptionRowProps) {
  const { colors, layout, radius, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={description ? `${title}. ${description}` : title}
      aria-checked={selected}
      onPress={onSelect}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: layout.touchTarget + spacing.md,
          // the selected border is 1px thicker; take it from the padding so the row does not shift
          padding: selected ? spacing.lg - 1 : spacing.lg,
          gap: spacing.lg,
          borderRadius: radius.lg,
          borderWidth: selected ? 2 : layout.hairline,
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected || pressed ? colors.surfaceElevated : colors.surface,
        },
      ]}>
      <View
        style={[
          styles.radio,
          { borderColor: selected ? colors.primaryHighlight : colors.textMuted },
        ]}>
        {selected ? <View style={[styles.dot, { backgroundColor: colors.primaryHighlight }]} /> : null}
      </View>
      <View style={styles.text}>
        <AppText variant="body" style={{ fontWeight: selected ? '700' : '500' }}>
          {title}
        </AppText>
        {description ? (
          <AppText variant="bodySmall" color="textSecondary">
            {description}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { flex: 1, gap: 2 },
});
