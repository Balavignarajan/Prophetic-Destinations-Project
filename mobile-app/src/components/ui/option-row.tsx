import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { useTheme } from '@/theme';
import { NATIVE_DRIVER, motion } from '@/theme/motion';

import { AnimatedPressable, usePressMotion } from './animated-pressable';
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
 * indicator) and announced to screen readers as "selected", so it never depends on colour alone. The dot grows in when the row
 * is chosen (not with Reduce Motion), and the row gives slight press feedback.
 */
export function OptionRow({ title, description, selected, onSelect, locked = false, outcome }: OptionRowProps) {
  const { colors, layout, radius, spacing } = useTheme();
  const reduce = useReduceMotion();
  const press = usePressMotion({ scaleTo: motion.scale.option, pressMs: motion.duration.cardPress, releaseMs: motion.duration.cardPress + 20, disabled: locked });
  const dot = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    if (reduce) {
      dot.setValue(selected ? 1 : 0);
      return;
    }
    const animation = Animated.timing(dot, { toValue: selected ? 1 : 0, duration: motion.duration.selection, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER });
    animation.start();
    return () => animation.stop();
  }, [selected, reduce, dot]);

  const outcomeText =
    outcome === 'correct' ? (selected ? '✓ Correct. Your answer' : '✓ Correct answer') : outcome === 'incorrect' ? '✗ Not correct. Your answer' : null;
  const emphasised = selected || outcome !== undefined;
  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityLabel={`${description ? `${title}. ${description}` : title}${outcomeText ? `. ${outcomeText.replace(/^[✓✗]\s*/, '')}` : ''}`}
      aria-checked={selected}
      aria-disabled={locked}
      onPress={locked ? undefined : onSelect}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        styles.row,
        {
          minHeight: layout.touchTarget + spacing.md,
          // the selected border is 1px thicker; take it from the padding so the row does not shift
          padding: emphasised ? spacing.lg - 1 : spacing.lg,
          gap: spacing.lg,
          borderRadius: radius.lg,
          borderWidth: emphasised ? 2 : layout.hairline,
          borderColor: outcome === 'correct' ? colors.success : outcome === 'incorrect' ? colors.error : selected ? colors.primary : colors.border,
          backgroundColor: selected || press.pressed ? colors.surfaceElevated : colors.surface,
        },
        press.scaleStyle,
      ]}>
      <View
        style={[
          styles.radio,
          { borderColor: selected ? colors.primaryHighlight : colors.textMuted },
        ]}>
        <Animated.View
          style={[
            styles.dot,
            {
              backgroundColor: colors.primaryHighlight,
              opacity: dot,
              transform: [{ scale: dot.interpolate({ inputRange: [0, 1], outputRange: [motion.scale.radioDot, 1] }) }],
            },
          ]}
        />
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
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { flex: 1, gap: 2 },
});
