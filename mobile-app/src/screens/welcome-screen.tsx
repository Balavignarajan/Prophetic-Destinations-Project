import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { HeroBackdrop } from '@/components/hero-backdrop';
import { HeroStatusBar } from '@/components/hero-status-bar';
import { appImages } from '@/config/images';
import { AppText, Divider, IconButton, OptionRow, PrimaryButton, ScreenContainer, SecondaryButton, SettingsIcon } from '@/components/ui';
import { LEARNING_LEVELS, LEVEL_LABELS, type LearningLevel } from '@/learning/levels';
import { applyLearningLevel, useLearningLevel } from '@/learning/use-learning-level';
import { saveWelcomeSeen } from '@/storage/preferences';
import { useTheme } from '@/theme';

/**
 * First launch. No sign-in: the app has no learner accounts. Three ways in, all optional and all ending in the app:
 *  - "Get Started" records that this screen was passed and opens Home;
 *  - "Take the assessment" does the same and opens the optional assessment;
 *  - "Choose my level" shows the three levels right here; "Continue" saves the chosen level (the same call More and Learn use), records
 *    that this screen was passed and opens Home. The level can be changed later in Learn or More.
 * The text sits on a themed panel, so it stays readable on any picture and in both themes.
 */
export function WelcomeScreen() {
  const router = useRouter();
  const { gradients, spacing, colors, radius, isDark } = useTheme();
  const { level, ready } = useLearningLevel();
  const [step, setStep] = useState<'start' | 'level'>('start');
  const [chosen, setChosen] = useState<LearningLevel | null>(null);
  // What the cards show is what "Continue" saves: the learner's pick, otherwise the level the app already has (Beginner when none was ever saved).
  const selected = chosen ?? level;
  const panel = { padding: spacing.xl, borderRadius: radius.xl, backgroundColor: colors.overlay } as const;

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      {/* decorative picture, darkened so the text stays the focus */}
      <HeroBackdrop source={appImages.hall.source} reach={1} dim={isDark ? 0.35 : 0.2} />
      {/* the top of the picture is always dark, so the status bar icons stay light in both themes */}
      <HeroStatusBar />
      <LinearGradient colors={gradients.goldGlow} style={styles.glow} pointerEvents="none" />

      <ScreenContainer transparent scroll>
        <View style={styles.topBar}>
          <IconButton accessibilityLabel="Saved items" onPress={() => router.push('/saved')}>
            <AppText variant="heading" color="textOnImage">
              ★
            </AppText>
          </IconButton>
          <IconButton accessibilityLabel="Settings" onPress={() => router.push('/settings')}>
            <SettingsIcon color="textOnImage" />
          </IconButton>
        </View>
        <View style={[styles.spacer, { minHeight: spacing.xxl }]} />

        {step === 'start' ? (
          <>
            <View style={[panel, { gap: spacing.lg }]}>
              <View style={styles.ornament} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Divider tone="gold" style={styles.ornamentLine} />
                <View style={[styles.diamond, { backgroundColor: colors.primary }]} />
                <Divider tone="gold" style={styles.ornamentLine} />
              </View>

              <View style={{ gap: spacing.md }}>
                <AppText variant="bodySmall" color="primaryHighlight" align="center" style={{ fontWeight: '700', letterSpacing: 2 }}>
                  PROPHETIC DESTINATIONS
                </AppText>
                <AppText variant="sectionHeading" align="center" accessibilityRole="header">
                  Discover Bible prophecy through Scripture and history.
                </AppText>
              </View>

              <AppText variant="body" color="textSecondary" align="center">
                Learn one lesson at a time. Take a short, optional assessment for a suggested level, or choose your own.
              </AppText>
            </View>

            <View style={{ marginTop: spacing.xl, marginBottom: spacing.xl, gap: spacing.md }}>
              <PrimaryButton
                label="Get Started"
                onPress={() => {
                  void saveWelcomeSeen();
                  router.replace('/');
                }}
              />
              <AppText variant="bodySmall" color="textSecondary" align="center" style={{ marginTop: spacing.sm }}>
                Not sure where to begin?
              </AppText>
              {/* Optional: a suggestion for a starting level. Starting and choosing a level yourself (Learn) works without it. */}
              <SecondaryButton
                label="Take the assessment"
                onPress={() => {
                  void saveWelcomeSeen();
                  router.replace('/assessment');
                }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose my level"
                onPress={() => setStep('level')}
                style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
                <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700', textDecorationLine: 'underline' }}>
                  Choose my level
                </AppText>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={{ gap: spacing.lg }}>
              <View style={[panel, { gap: spacing.sm }]}>
                <AppText variant="sectionHeading" align="center" accessibilityRole="header">
                  Choose your level
                </AppText>
                <AppText variant="body" color="textSecondary" align="center">
                  You can change this at any time in Learn or More.
                </AppText>
              </View>
              <View accessibilityRole="radiogroup" accessibilityLabel="Learning level" style={{ gap: spacing.md }}>
                {LEARNING_LEVELS.map((option) => (
                  <OptionRow key={option} title={LEVEL_LABELS[option]} selected={selected === option} onSelect={() => setChosen(option)} />
                ))}
              </View>
              <AppText variant="bodySmall" color="textSecondary" align="center" accessibilityLiveRegion="polite">
                {LEVEL_LABELS[selected]} is selected. Tap another level to change it.
              </AppText>
            </View>

            <View style={{ marginTop: spacing.xl, marginBottom: spacing.xl, gap: spacing.md }}>
              <PrimaryButton
                label={`Continue with ${LEVEL_LABELS[selected]}`}
                disabled={!ready && chosen === null}
                onPress={() => {
                  applyLearningLevel(selected);
                  void saveWelcomeSeen();
                  router.replace('/');
                }}
              />
              <SecondaryButton label="Back" onPress={() => setStep('start')} />
            </View>
          </>
        )}
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: '60%' },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingTop: 8 },
  spacer: { flex: 1 },
  ornament: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  ornamentLine: { width: 56, alignSelf: 'center' },
  diamond: { width: 8, height: 8, transform: [{ rotate: '45deg' }] },
});
