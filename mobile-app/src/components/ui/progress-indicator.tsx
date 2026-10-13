import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';

export type ProgressIndicatorProps = {
  /** From 0 (not started) to 1 (complete). Values outside the range are clamped. */
  value: number;
  /** Short caption, e.g. "Lesson progress". */
  label?: string;
  showPercent?: boolean;
};

/** A thin gold-on-dark progress bar with an accessible value. Progress is device-local data supplied by the caller. */
export function ProgressIndicator({ value, label, showPercent = true }: ProgressIndicatorProps) {
  const { colors, radius, spacing } = useTheme();
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const percent = Math.round(clamped * 100);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Progress'}
      accessibilityValue={{ min: 0, max: 100, now: percent }}>
      {label || showPercent ? (
        <View style={[styles.captions, { marginBottom: spacing.sm }]}>
          {label ? (
            <AppText variant="caption" color="textMuted">
              {label}
            </AppText>
          ) : (
            <View />
          )}
          {showPercent ? (
            <AppText variant="caption" color="textSecondary">
              {percent}%
            </AppText>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.track, { backgroundColor: colors.border, borderRadius: radius.pill }]}>
        <View
          style={{
            width: `${percent}%`,
            height: '100%',
            borderRadius: radius.pill,
            backgroundColor: colors.primary,
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  captions: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 4, overflow: 'hidden' },
});
