import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';

export type OptionRowProps = {
  title: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
  /** Ignores presses (an answer that has been checked). The row stays readable and keeps its selected state. */
  locked?: boolean;
  /** After an answer is checked: marks this option as the correct one, or as the learner's incorrect choice. Shown in words, not colour alone. */
  outcome?: 'correct' | 'incorrect';
};

/**
 * One choice in a radio-style list. The selected state is shown three ways (gold border, filled dot, bold weight of the
 * indicator) and announced to screen readers as "selected", so it never depends on colour alone.
 */
export function OptionRow({ title, description, selected, onSelect, locked = false, outcome }: OptionRowProps) {
  const { colors, layout, radius, spacing } = useTheme();
  const outcomeText =
    outcome === 'correct' ? (selected ? '✓ Correct. Your answer' : '✓ Correct answer') : outcome === 'incorrect' ? '✗ Not correct. Your answer' : null;
  const emphasised = selected || outcome !== undefined;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${description ? `${title}. ${description}` : title}${outcomeText ? `. ${outcomeText.replace(/^[✓✗]\s*/, '')}` : ''}`}
      aria-checked={selected}
      aria-disabled={locked}
      onPress={locked ? undefined : onSelect}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: layout.touchTarget + spacing.md,
          // the selected border is 1px thicker; take it from the padding so the row does not shift
          padding: emphasised ? spacing.lg - 1 : spacing.lg,
          gap: spacing.lg,
          borderRadius: radius.lg,
          borderWidth: emphasised ? 2 : layout.hairline,
          borderColor: outcome === 'correct' ? colors.success : outcome === 'incorrect' ? colors.error : selected ? colors.primary : colors.border,
          backgroundColor: selected || (pressed && !locked) ? colors.surfaceElevated : colors.surface,
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
        {outcomeText ? (
          <AppText variant="bodySmall" color={outcome === 'incorrect' ? 'error' : 'success'} style={{ fontWeight: '700' }}>
            {outcomeText}
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
