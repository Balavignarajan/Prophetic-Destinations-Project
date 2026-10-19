import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';
import { ChevronIcon } from './chevron-icon';

/** One row of a menu: a title, an optional line of explanation, and a chevron. The whole row is the button. */
export function LinkRow({ title, description, onPress }: { title: string; description?: string; onPress: () => void }) {
  const { colors, layout, radius, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={description ? `${title}. ${description}` : title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: layout.touchTarget + spacing.md,
          padding: spacing.md,
          gap: spacing.md,
          borderRadius: radius.md,
          borderWidth: layout.hairline,
          borderColor: colors.borderSubtle,
          backgroundColor: pressed ? colors.surfaceElevated : colors.surface,
        },
      ]}>
      <View style={styles.text}>
        <AppText variant="body">{title}</AppText>
        {description ? (
          <AppText variant="caption" color="textMuted">
            {description}
          </AppText>
        ) : null}
      </View>
      <ChevronIcon direction="right" color="textMuted" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1, gap: 2 },
});
