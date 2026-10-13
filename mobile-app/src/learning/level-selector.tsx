import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

import { LEARNING_LEVELS, LEVEL_LABELS, type LearningLevel } from './levels';

/** A three-way choice of learning level. Each segment is a radio with a selected state. */
export function LevelSelector({ value, onChange }: { value: LearningLevel; onChange: (level: LearningLevel) => void }) {
  const { colors, layout, radius, spacing } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Learning level"
      style={[styles.group, { borderRadius: radius.md, borderWidth: layout.hairline, borderColor: colors.border, backgroundColor: colors.surface }]}>
      {LEARNING_LEVELS.map((level) => {
        const selected = level === value;
        return (
          <Pressable
            key={level}
            accessibilityRole="radio"
            accessibilityLabel={`${LEVEL_LABELS[level]} level`}
            aria-checked={selected}
            onPress={() => onChange(level)}
            style={[
              styles.segment,
              {
                minHeight: layout.touchTarget,
                margin: spacing.xxs,
                borderRadius: radius.sm,
                backgroundColor: selected ? colors.primary : colors.transparent,
              },
            ]}>
            <AppText variant="bodySmall" color={selected ? 'onPrimary' : 'textSecondary'} align="center" style={{ fontWeight: selected ? '700' : '500' }}>
              {LEVEL_LABELS[level]}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row' },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
