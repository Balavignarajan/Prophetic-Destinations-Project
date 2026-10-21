import { Children, Fragment, createContext, useContext, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';
import { ChevronIcon } from './chevron-icon';
import { Divider } from './divider';

const LinkGroupContext = createContext(false);

/** Several LinkRows on one shared surface, separated by hairlines, instead of a separately bordered card per row. */
export function LinkGroup({ children }: { children: ReactNode }) {
  const { colors, layout, radius } = useTheme();
  return (
    <LinkGroupContext.Provider value>
      <View
        style={{
          borderRadius: radius.lg,
          borderWidth: layout.hairline,
          borderColor: colors.borderSubtle,
          backgroundColor: colors.surface,
          overflow: 'hidden',
        }}>
        {Children.toArray(children).map((child, index) => (
          <Fragment key={index}>
            {index > 0 ? <Divider /> : null}
            {child}
          </Fragment>
        ))}
      </View>
    </LinkGroupContext.Provider>
  );
}

/** One row of a menu: a title, an optional line of explanation, and a chevron. The whole row is the button. */
export function LinkRow({ title, description, onPress }: { title: string; description?: string; onPress: () => void }) {
  const { colors, layout, radius, spacing } = useTheme();
  const grouped = useContext(LinkGroupContext);
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
        },
        grouped
          ? { backgroundColor: pressed ? colors.surfaceElevated : colors.transparent }
          : {
              borderRadius: radius.lg,
              borderWidth: layout.hairline,
              borderColor: colors.borderSubtle,
              backgroundColor: pressed ? colors.surfaceElevated : colors.surface,
            },
      ]}>
      <View style={styles.text}>
        <AppText variant="body">{title}</AppText>
        {description ? (
          <AppText variant="bodySmall" color="textMuted">
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
