import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { AnimatedPressable, usePressMotion } from '@/components/ui';
import { useTheme, withAlpha } from '@/theme';
import { motion } from '@/theme/motion';

import { LEARNING_LEVELS, LEVEL_LABELS, type LearningLevel } from './levels';

/** A three-way choice of learning level. Each segment is a radio with a selected state; the gold fill eases from one segment to the next. */
export function LevelSelector({ value, onChange }: { value: LearningLevel; onChange: (level: LearningLevel) => void }) {
  const { colors, layout, radius } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Learning level"
      style={[styles.group, { borderRadius: radius.md, borderWidth: layout.hairline, borderColor: colors.border, backgroundColor: colors.surface }]}>
      {LEARNING_LEVELS.map((level) => (
        <Segment key={level} level={level} selected={level === value} onPress={() => onChange(level)} />
      ))}
    </View>
  );
}

function Segment({ level, selected, onPress }: { level: LearningLevel; selected: boolean; onPress: () => void }) {
  const { colors, layout, radius, spacing, typography, fontFamilies } = useTheme();
  const reduce = useReduceMotion();
  const press = usePressMotion({ scaleTo: motion.scale.segment });
  const fill = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    if (reduce) {
      fill.setValue(selected ? 1 : 0);
      return;
    }
    // Colours cannot use the native driver; three short, tiny animations are cheap on the JavaScript thread.
    const animation = Animated.timing(fill, { toValue: selected ? 1 : 0, duration: motion.duration.selection, easing: motion.easing.standard, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [selected, reduce, fill]);

  // The fill and the label colour move together, so the label is never dark-on-dark halfway through.
  const background = fill.interpolate({ inputRange: [0, 1], outputRange: [withAlpha(colors.primary, 0), colors.primary] });
  const labelColor = fill.interpolate({ inputRange: [0, 1], outputRange: [colors.textSecondary, colors.onPrimary] });

  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityLabel={`${LEVEL_LABELS[level]} level`}
      aria-checked={selected}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[styles.segment, { minHeight: layout.touchTarget, margin: spacing.xxs, borderRadius: radius.sm }, press.scaleStyle]}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: radius.sm, backgroundColor: background }]} />
      <Animated.Text
        style={[
          typography.bodySmall,
          { fontFamily: selected ? fontFamilies.sansBold : fontFamilies.sansMedium, color: labelColor, textAlign: 'center' },
        ]}>
        {LEVEL_LABELS[level]}
      </Animated.Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row' },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
