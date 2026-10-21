import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
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
 * How the screen is dressed for the room it has. Everything stays on screen without scrolling: a roomy phone gets the comfortable size
 * (tier 0); a shorter one, or a larger system font, steps down to tier 1 or 2, which tighten the gaps, trim the type a little and shrink the
 * space kept clear for the picture's lit archway. Touch targets never drop below 44 pt.
 *  - heading / body: type size and line height; gap: between the groups; group: inside a group; glow: room around the glowing button
 *  - primary / secondary: button sizes; clearance: the share of the screen height kept clear above the text; scrim: where the dark gradient ramps up
 */
const TIERS = [
  { gap: 24, group: 12, heading: 27, headingLine: 35, body: 16, bodyLine: 25, primary: 'large', secondary: 'large', glow: 16, clearance: 0.26, scrim: [0, 0.32, 0.6, 0.92] },
  { gap: 16, group: 10, heading: 24, headingLine: 31, body: 15, bodyLine: 22, primary: 'large', secondary: 'medium', glow: 12, clearance: 0.17, scrim: [0, 0.22, 0.5, 0.9] },
  { gap: 12, group: 8, heading: 21, headingLine: 27, body: 14, bodyLine: 20, primary: 'medium', secondary: 'small', glow: 8, clearance: 0.07, scrim: [0, 0.12, 0.38, 0.84] },
] as const;

/**
 * First launch. No sign-in: the app has no learner accounts. Three ways in, all optional and all ending in the app:
 *  - "Get Started" records that this screen was passed and opens Home;
 *  - "Take the assessment" does the same and opens the optional assessment;
 *  - "Choose my level" shows the three levels right here; "Continue" saves the chosen level (the same call More and Learn use), records
 *    that this screen was passed and opens Home. The level can be changed later in Learn or More.
 *
 * Layout: the cover picture fills the screen; one soft gradient carries the text and buttons, so there is no boxed panel. The content is
 * anchored to the bottom and the layout fits the screen by itself (see TIERS): it picks a size from the usable height and the font scale,
 * then checks what actually happened and steps down once more if anything still overflowed. Only if even the tightest size does not fit (a
 * huge system font, or a very short window) does the screen become scrollable, so nothing is ever cut off.
 */
export function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, fontScale } = useWindowDimensions();
  const { colors, layout } = useTheme();
  const { level, ready } = useLearningLevel();
  const [step, setStep] = useState<'start' | 'level'>('start');
  const [chosen, setChosen] = useState<LearningLevel | null>(null);
  // What the cards show is what "Continue" saves: the learner's pick, otherwise the level the app already has (Beginner when none was ever saved).
  const selected = chosen ?? level;

  // The first guess: the height left after the safe areas, divided by how much bigger the user's font is. The level step is taller, so it needs more room.
  const usable = (windowHeight - insets.top - insets.bottom) / Math.max(1, Math.min(fontScale, 2));
  const guess = step === 'start' ? (usable >= 760 ? 0 : usable >= 640 ? 1 : 2) : usable >= 840 ? 0 : usable >= 720 ? 1 : 2;
  // The correction: if the real layout still overflowed, step down; at the tightest size, allow scrolling. Reset whenever the situation changes.
  const situation = `${step}|${Math.round(windowHeight)}|${fontScale}`;
  const [fit, setFit] = useState({ situation: '', extra: 0, overflow: false });
  const extra = fit.situation === situation ? fit.extra : 0;
  const overflow = fit.situation === situation && fit.overflow;
  const tier = Math.min(2, guess + extra);
  const t = TIERS[tier];
  const viewport = useRef(0);

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

      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.grow}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // not scrollable while everything fits; scrollable only when even the tightest layout overflows
        scrollEnabled={overflow}
        bounces={false}
        overScrollMode="never"
        onLayout={(event) => {
          viewport.current = event.nativeEvent.layout.height;
        }}
        onContentSizeChange={(_width, contentHeight) => {
          const tooTall = contentHeight > (viewport.current || windowHeight) + 1;
          if (tooTall && tier < 2) setFit({ situation, extra: extra + 1, overflow: false });
          else if (tooTall !== overflow) setFit({ situation, extra, overflow: tooTall });
        }}>
        <View style={[styles.grow, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
          <LinearGradient colors={scrim} locations={t.scrim} style={StyleSheet.absoluteFill} pointerEvents="none" />

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

            {/* keeps the lit archway of the cover clear above the text; it takes whatever height is left over, and only a little when space is short */}
            <View style={[styles.spacer, { minHeight: Math.round(windowHeight * t.clearance) }]} />

            {step === 'start' ? (
              <View style={{ gap: t.gap, paddingBottom: t.gap }}>
                <Reveal offset={motion.offset.subtle} style={{ gap: t.group }}>
                  <View style={styles.brandRow}>
                    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 28, height: 2, backgroundColor: colors.primary }} />
                    <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700', letterSpacing: 2, flexShrink: 1 }}>
                      PROPHETIC DESTINATIONS
                    </AppText>
                  </View>
                  <AppText variant="title" accessibilityRole="header" style={{ fontSize: t.heading, lineHeight: t.headingLine, letterSpacing: 0.6 }}>
                    Discover Bible Prophecy Through Scripture and History
                  </AppText>
                  <AppText variant="body" color="textSecondary" style={{ fontSize: t.body, lineHeight: t.bodyLine }}>
                    Learn one lesson at a time. Take a short, optional assessment for a suggested level, or choose your own.
                  </AppText>
                </Reveal>

                <View style={{ gap: t.group }}>
                  {/* the glow and the small stars reach about 20-30 pt around this button, so it gets room above and below */}
                  <View style={{ marginVertical: t.glow }}>
                    <GlowingButton
                      label="Get Started"
                      size={t.primary}
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
                    size={t.secondary}
                    onPress={() => {
                      void saveWelcomeSeen();
                      router.replace('/assessment');
                    }}
                  />
                  <Pressable accessibilityRole="button" accessibilityLabel="Choose my level" onPress={() => setStep('level')} style={styles.textAction}>
                    <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700', textDecorationLine: 'underline' }}>
                      Choose my level
                    </AppText>
                    <ChevronIcon direction="right" color="primaryHighlight" size={10} />
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={{ gap: t.gap, paddingBottom: t.gap }}>
                <Reveal offset={motion.offset.subtle} style={{ gap: t.group }}>
                  <AppText variant="title" accessibilityRole="header" style={{ fontSize: t.heading, lineHeight: t.headingLine, letterSpacing: 0.6 }}>
                    Choose your level
                  </AppText>
                  <AppText variant="body" color="textSecondary" style={{ fontSize: t.body, lineHeight: t.bodyLine }}>
                    You can change this at any time in Learn or More.
                  </AppText>
                </Reveal>
                <View accessibilityRole="radiogroup" accessibilityLabel="Learning level" style={{ gap: t.group }}>
                  {LEARNING_LEVELS.map((option) => (
                    <OptionRow key={option} title={LEVEL_LABELS[option]} selected={selected === option} onSelect={() => setChosen(option)} />
                  ))}
                </View>
                {/* the selected card and the "Continue with ..." button already say this; the extra line is dropped only when space is tightest */}
                {tier < 2 ? (
                  <AppText variant="bodySmall" color="textSecondary" accessibilityLiveRegion="polite">
                    {LEVEL_LABELS[selected]} is selected. Tap another level to change it.
                  </AppText>
                ) : null}
                <View style={{ gap: t.group }}>
                  <PrimaryButton
                    label={`Continue with ${LEVEL_LABELS[selected]}`}
                    size={t.primary}
                    disabled={!ready && chosen === null}
                    onPress={() => {
                      applyLearningLevel(selected);
                      void saveWelcomeSeen();
                      router.replace('/');
                    }}
                  />
                  <SecondaryButton label="Back" size={t.secondary} onPress={() => setStep('start')} />
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
