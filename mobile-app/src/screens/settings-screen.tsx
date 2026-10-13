import { View } from 'react-native';

import { AppText, Card, OptionRow, ScreenContainer, ScreenHeader, SectionHeader } from '@/components/ui';
import { type ThemePreference } from '@/storage/preferences';
import { useTheme, useThemePreference } from '@/theme';

const OPTIONS: { value: ThemePreference; title: string; description: string }[] = [
  { value: 'system', title: 'System', description: 'Match your device. Changes when your device does.' },
  { value: 'light', title: 'Light', description: 'Warm ivory pages with dark text. Easy to read in daylight.' },
  { value: 'dark', title: 'Dark', description: 'The cinematic default: deep black with gold. Gentle in low light.' },
];

/** Appearance settings. The choice applies immediately and is remembered on this device. */
export function SettingsScreen() {
  const { preference, setPreference, themeName } = useThemePreference();
  const { colors, layout, radius, spacing } = useTheme();

  return (
    <ScreenContainer scroll>
      <ScreenHeader title="Settings" />
      <View style={{ gap: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxl }}>
        <SectionHeader title="Appearance" subtitle="Choose how Prophetic Destinations looks. Saved on this device only." />

        <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" style={{ gap: spacing.md }}>
          {OPTIONS.map((option) => (
            <OptionRow
              key={option.value}
              title={option.title}
              description={option.description}
              selected={preference === option.value}
              onSelect={() => setPreference(option.value)}
            />
          ))}
        </View>

        <View style={{ gap: spacing.md }}>
          <AppText variant="label" color="textMuted">
            Preview
          </AppText>
          <View
            accessible
            accessibilityLabel={`Preview of the ${themeName} theme`}
            style={{
              padding: spacing.lg,
              borderRadius: radius.lg,
              borderWidth: layout.hairline,
              borderColor: colors.border,
              backgroundColor: colors.background,
            }}>
            <Card variant="elevated">
              <View style={{ gap: spacing.sm }}>
                <AppText variant="heading" color="primaryHighlight">
                  The theme in use: {themeName === 'dark' ? 'Dark' : 'Light'}
                </AppText>
                <View style={{ width: 32, height: 2, backgroundColor: colors.primary }} />
                <AppText variant="body">Primary text is easy to read on this surface.</AppText>
                <AppText variant="bodySmall" color="textSecondary">
                  Secondary text explains and supports the main content.
                </AppText>
                <AppText variant="caption" color="textMuted">
                  Captions and small details look like this.
                </AppText>
              </View>
            </Card>
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
}
