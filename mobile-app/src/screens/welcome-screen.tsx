import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeroBackdrop } from '@/components/hero-backdrop';
import { HeroStatusBar } from '@/components/hero-status-bar';
import { appImages } from '@/config/images';
import {
  AppText,
  ChevronIcon,
  GlowingButton,
  IconButton,
  OptionRow,
  PrimaryButton,
  Reveal,
  SecondaryButton,
  SettingsIcon,
} from '@/components/ui';
import { LEARNING_LEVELS, LEVEL_LABELS, type LearningLevel } from '@/learning/levels';
import { applyLearningLevel, useLearningLevel } from '@/learning/use-learning-level';
import { saveWelcomeSeen } from '@/storage/preferences';
import { useTheme, withAlpha } from '@/theme';
import { motion } from '@/theme/motion';

/**
 * First launch. No sign-in: the app has no learner accounts. Three ways in, all optional and all ending in the app:
 *  - "Get Started" records that this screen was passed and opens Home;
 *  - "Take the assessment" does the same and opens the optional assessment;
 *  - "Choose my level" shows the three levels right here; "Continue" saves the chosen level (the same call More and Learn use), records
 *    that this screen was passed and opens Home. The level can be changed later in Learn or More.
 *
 * Layout: the cover picture fills the screen; one soft gradient (from the theme's background colour, clear at the top, deep at the bottom)
 * carries the text and buttons, so there is no boxed panel. The gradient is part of the scrolling content, so on a short phone or at a
 * large font size the text stays on it while the screen scrolls, and the safe areas are respected by hand.
 */
export function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { colors, layout, spacing } = useTheme();
  const { level, ready } = useLearningLevel();
  const [step, setStep] = useState<'start' | 'level'>('start');
  const [chosen, setChosen] = useState<LearningLevel | null>(null);
  // What the cards show is what "Continue" saves: the learner's pick, otherwise the level the app already has (Beginner when none was ever saved).
  const selected = chosen ?? level;
  const scrim = [
    withAlpha(colors.background, 0),
    withAlpha(colors.background, 0),
    withAlpha(colors.background, 0.74),
    withAlpha(colors.background, 0.97),
  ] as const;

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      {/* the cover picture, decorative; its own gradients keep the status bar and the very bottom legible */}
      <HeroBackdrop source={appImages.welcome.source} reach={1} />
      {/* the top of the picture is always dark, so the status bar icons stay light in both themes */}
      <HeroStatusBar />

      <ScrollView style={styles.fill} contentContainerStyle={styles.grow} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={[styles.grow, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
          <LinearGradient colors={scrim} locations={[0, 0.32, 0.6, 0.92]} style={StyleSheet.absoluteFill} pointerEvents="none" />

          <View style={[styles.column, { maxWidth: layout.maxContentWidth, paddingHorizontal: layout.screenPadding }]}>
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

            {/* keeps the lit archway of the cover clear above the text: about a third of the screen, more on a tall phone */}
            <View style={[styles.spacer, { minHeight: Math.max(spacing.xxxl, Math.round(windowHeight * 0.3)) }]} />

            {step === 'start' ? (
              <View style={{ gap: spacing.xl, paddingBottom: spacing.xl }}>
                <Reveal offset={motion.offset.subtle} style={{ gap: spacing.md }}>
                  <View style={styles.brandRow}>
                    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 28, height: 2, backgroundColor: colors.primary }} />
                    <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700', letterSpacing: 2, flexShrink: 1 }}>
                      PROPHETIC DESTINATIONS
                    </AppText>
                  </View>
                  <AppText variant="title" accessibilityRole="header" style={{ fontSize: 27, lineHeight: 35, letterSpacing: 0.6 }}>
                    Discover Bible Prophecy Through Scripture and History
                  </AppText>
                  <AppText variant="body" color="textSecondary">
                    Learn one lesson at a time. Take a short, optional assessment for a suggested level, or choose your own.
                  </AppText>
                </Reveal>

                <View style={{ gap: spacing.md }}>
                  {/* the glow and the small stars reach about 20-30 pt around this button, so it gets room above and below */}
                  <View style={{ marginVertical: spacing.lg }}>
                    <GlowingButton
                      label="Get Started"
                      onPress={() => {
                        void saveWelcomeSeen();
                        router.replace('/');
                      }}
                    />
                  </View>
                  <AppText variant="bodySmall" color="textSecondary" align="center">
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
                    style={styles.textAction}>
                    <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700', textDecorationLine: 'underline' }}>
                      Choose my level
                    </AppText>
                    <ChevronIcon direction="right" color="primaryHighlight" size={10} />
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={{ gap: spacing.xl, paddingBottom: spacing.xl }}>
                <Reveal offset={motion.offset.subtle} style={{ gap: spacing.sm }}>
                  <AppText variant="title" accessibilityRole="header" style={{ fontSize: 27, lineHeight: 35, letterSpacing: 0.6 }}>
                    Choose your level
                  </AppText>
                  <AppText variant="body" color="textSecondary">
                    You can change this at any time in Learn or More.
                  </AppText>
                </Reveal>
                <View accessibilityRole="radiogroup" accessibilityLabel="Learning level" style={{ gap: spacing.md }}>
                  {LEARNING_LEVELS.map((option) => (
                    <OptionRow key={option} title={LEVEL_LABELS[option]} selected={selected === option} onSelect={() => setChosen(option)} />
                  ))}
                </View>
                <AppText variant="bodySmall" color="textSecondary" accessibilityLiveRegion="polite">
                  {LEVEL_LABELS[selected]} is selected. Tap another level to change it.
                </AppText>
                <View style={{ gap: spacing.md }}>
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
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flexGrow: 1 },
  column: { flexGrow: 1, width: '100%', alignSelf: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingTop: 8 },
  spacer: { flex: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textAction: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
