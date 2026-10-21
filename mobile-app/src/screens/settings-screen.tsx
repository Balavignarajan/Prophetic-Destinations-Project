import { useState } from 'react';
import { View } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { AppText, Card, OptionRow, ScreenContainer, ScreenHeader, ScreenSection, SecondaryButton } from '@/components/ui';
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
 * result is announced. While it is armed a Cancel button is offered, and the warning (if any) is read out.
 */
function ConfirmButton({
  label,
  confirmLabel,
  warning,
  run,
}: {
  label: string;
  confirmLabel: string;
  warning?: string;
  run: () => Promise<string> | string;
}) {
  const { spacing } = useTheme();
  const [state, setState] = useState<{ phase: 'idle' | 'armed' | 'done'; message?: string }>({ phase: 'idle' });
  const armed = state.phase === 'armed';
  return (
    <View style={{ gap: spacing.sm }}>
      <SecondaryButton
        tone="danger"
        label={armed ? confirmLabel : label}
        onPress={async () => {
          if (state.phase !== 'armed') {
            setState({ phase: 'armed' });
            return;
          }
          const message = await run();
          setState({ phase: 'done', message });
        }}
      />
      {armed ? (
        <>
          {warning ? (
            <AppText variant="bodySmall" color="textSecondary" accessibilityLiveRegion="polite">
              {warning}
            </AppText>
          ) : null}
          <SecondaryButton size="small" label="Cancel" onPress={() => setState({ phase: 'idle' })} />
        </>
      ) : null}
      {state.phase === 'done' ? (
        <AppText variant="bodySmall" color="textSecondary" accessibilityLiveRegion="polite">
          {state.message}
        </AppText>
      ) : null}
    </View>
  );
}

/** Settings: how the app looks, how text and motion are handled, and what is stored on this device. Everything applies immediately and stays on this device. */
export function SettingsScreen() {
  const { preference, setPreference, themeName } = useThemePreference();
  const { colors, layout, radius, spacing } = useTheme();
  const { reset } = useLearningProgress();
  const reduceMotion = useReduceMotion();

  return (
    <ScreenContainer scroll>
      <ScreenHeader title="Settings" />
      <View style={{ gap: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xxl }}>
        <AppText variant="body" color="textSecondary">
          Choose how Prophetic Destinations looks and manage what is kept on this device.
        </AppText>

        <ScreenSection title="Appearance" description="Applies right away and is remembered on this device only.">
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
              </View>
            </Card>
          </View>
        </ScreenSection>

        <ScreenSection title="Text size and motion" description="These follow your device settings.">
          <Card>
            <View style={{ gap: spacing.lg }}>
              <View style={{ gap: spacing.xs }}>
                <AppText variant="body" style={{ fontWeight: '600' }}>
                  Text size
                </AppText>
                <AppText variant="bodySmall" color="textSecondary">
                  On phones and tablets, text follows your device's font size. Change it in your device's display or accessibility settings.
                </AppText>
              </View>
              <View style={{ gap: spacing.xs }}>
                <AppText variant="body" style={{ fontWeight: '600' }}>
                  Reduce motion
                </AppText>
                <AppText variant="bodySmall" color="textSecondary">
                  {reduceMotion
                    ? 'On for this device. The app keeps animations to a minimum.'
                    : "Off for this device. If you turn on Reduce Motion in your device's accessibility settings, the app keeps animations to a minimum."}
                </AppText>
              </View>
            </View>
          </Card>
        </ScreenSection>

        <ScreenSection title="On this device" description="Everything the app keeps stays on this device. Saved items (stars) and Daniel 2 progress are not affected by these buttons.">
          <Card>
            <View style={{ gap: spacing.md }}>
              <View style={{ gap: spacing.xs }}>
                <AppText variant="body" style={{ fontWeight: '600' }}>
                  Offline lessons
                </AppText>
                <AppText variant="bodySmall" color="textSecondary">
                  Lessons and courses you open (with their images) are kept so you can read them without internet. Clearing them does not erase your reading progress or quiz results.
                </AppText>
              </View>
              <ConfirmButton
                label="Clear offline lessons and courses"
                confirmLabel="Tap again to clear offline lessons and courses"
                warning="You can save lessons again by opening them while you are online."
                run={async () => {
                  const count = await cacheClear();
                  return count === 0 ? 'Nothing was saved for offline reading.' : `Removed ${count} saved ${count === 1 ? 'item' : 'items'} (lessons, courses and course lists) and their saved images.`;
                }}
              />
            </View>
          </Card>
          <Card>
            <View style={{ gap: spacing.md }}>
              <View style={{ gap: spacing.xs }}>
                <AppText variant="body" style={{ fontWeight: '600' }}>
                  Reading progress
                </AppText>
                <AppText variant="bodySmall" color="textSecondary">
                  Forget where you stopped, which lessons you completed and your saved quiz results.
                </AppText>
              </View>
              <ConfirmButton
                label="Reset reading progress and quiz results"
                confirmLabel="Tap again to erase reading progress and saved quiz results"
                warning="This cannot be undone."
                run={() => {
                  reset();
                  return 'Reading progress and saved quiz results were erased from this device.';
                }}
              />
            </View>
          </Card>
        </ScreenSection>
      </View>
    </ScreenContainer>
  );
}
