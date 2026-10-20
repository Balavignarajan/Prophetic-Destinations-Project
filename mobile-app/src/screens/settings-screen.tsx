import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Card, OptionRow, ScreenContainer, ScreenHeader, SecondaryButton, SectionHeader } from '@/components/ui';
import { useLearningProgress } from '@/features/learning/learning-provider';
import { cacheClear } from '@/features/offline/cache-store';
import { type ThemePreference } from '@/storage/preferences';
import { useTheme, useThemePreference } from '@/theme';

const OPTIONS: { value: ThemePreference; title: string; description: string }[] = [
  { value: 'system', title: 'System', description: 'Match your device. Changes when your device does.' },
  { value: 'light', title: 'Light', description: 'Warm ivory pages with dark text. Easy to read in daylight.' },
  { value: 'dark', title: 'Dark', description: 'The cinematic default: deep black with gold. Gentle in low light.' },
];

/**
 * A destructive button that asks twice (Alert is not available on the web): first press arms it, second press does it, and the
 * result is announced.
 */
function ConfirmButton({ label, confirmLabel, run }: { label: string; confirmLabel: string; run: () => Promise<string> | string }) {
  const { spacing } = useTheme();
  const [state, setState] = useState<{ phase: 'idle' | 'armed' | 'done'; message?: string }>({ phase: 'idle' });
  return (
    <View style={{ gap: spacing.xs }}>
      <SecondaryButton
        label={state.phase === 'armed' ? confirmLabel : label}
        onPress={async () => {
          if (state.phase !== 'armed') {
            setState({ phase: 'armed' });
            return;
          }
          const message = await run();
          setState({ phase: 'done', message });
        }}
      />
      {state.phase === 'done' ? (
        <AppText variant="caption" color="textMuted" accessibilityLiveRegion="polite">
          {state.message}
        </AppText>
      ) : null}
    </View>
  );
}

/** Appearance settings. The choice applies immediately and is remembered on this device. */
export function SettingsScreen() {
  const { preference, setPreference, themeName } = useThemePreference();
  const { colors, layout, radius, spacing } = useTheme();
  const { reset } = useLearningProgress();

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

        <View style={{ gap: spacing.md }}>
          <SectionHeader
            title="Saved data"
            subtitle="Lessons, courses and course lists you open (with their images) are kept on this device for offline reading. Clearing offline lessons does not erase your reading progress or quiz results. Saved items (stars) and Daniel 2 progress are not affected by these buttons."
          />
          <ConfirmButton
            label="Clear offline lessons and courses"
            confirmLabel="Tap again to clear offline lessons and courses"
            run={async () => {
              const count = await cacheClear();
              return count === 0 ? 'Nothing was saved for offline reading.' : `Removed ${count} saved ${count === 1 ? 'item' : 'items'} (lessons, courses and course lists) and their saved images.`;
            }}
          />
          <ConfirmButton
            label="Reset reading progress and quiz results"
            confirmLabel="Tap again to erase reading progress and saved quiz results"
            run={() => {
              reset();
              return 'Reading progress and saved quiz results were erased from this device.';
            }}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}
