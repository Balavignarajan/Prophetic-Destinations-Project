import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { HeroBackdrop } from '@/components/hero-backdrop';
import { AppText, Divider, PrimaryButton, ScreenContainer } from '@/components/ui';
import { useTheme } from '@/theme';

/** First launch. No sign-in: the app has no learner accounts. */
export function WelcomeScreen() {
  const router = useRouter();
  const { gradients, spacing, colors, layout, typography } = useTheme();
  const { width } = useWindowDimensions();

  // "DESTINATIONS" (12 capitals) must fit on one line on any phone. Native text could shrink to fit, the web
  // cannot, so the size is derived from the space available.
  const contentWidth = Math.min(width, layout.maxContentWidth) - layout.screenPadding * 2;
  const titleSize = Math.min(typography.hero.fontSize, Math.floor(contentWidth / 10.6));
  const titleStyle = {
    fontSize: titleSize,
    lineHeight: Math.round(titleSize * 1.2),
    letterSpacing: titleSize * 0.04,
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      {/* decorative picture, darkened so the title stays the focus */}
      <HeroBackdrop source={require('@/assets/images/placeholder/daniel-2-hall-placeholder.jpg')} reach={1} dim={0.35} />
      <LinearGradient colors={gradients.goldGlow} style={styles.glow} pointerEvents="none" />

      <ScreenContainer transparent>
        <View style={styles.spacer} />

        <View style={[styles.content, { gap: spacing.lg }]}>
          <View style={styles.ornament} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Divider tone="gold" style={styles.ornamentLine} />
            <View style={[styles.diamond, { backgroundColor: colors.primary }]} />
            <Divider tone="gold" style={styles.ornamentLine} />
          </View>

          <View accessible accessibilityRole="header" accessibilityLabel="Prophetic Destinations">
            <AppText variant="hero" color="primaryHighlight" align="center" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55} style={titleStyle}>
              PROPHETIC
            </AppText>
            <AppText variant="hero" color="textPrimary" align="center" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55} style={titleStyle}>
              DESTINATIONS
            </AppText>
          </View>

          <AppText variant="subtitle" color="textSecondary" align="center">
            Discover Bible prophecy through Scripture and history.
          </AppText>
        </View>

        <PrimaryButton
          label="Enter"
          onPress={() => router.push('/daniel-2')}
          style={{ marginTop: spacing.xxl, marginBottom: spacing.xl }}
        />
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: '60%' },
  spacer: { flex: 1 },
  content: { alignItems: 'stretch' },
  ornament: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  ornamentLine: { width: 56, alignSelf: 'center' },
  diamond: { width: 8, height: 8, transform: [{ rotate: '45deg' }] },
});
