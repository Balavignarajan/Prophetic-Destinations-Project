import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeroBackdrop } from '@/components/hero-backdrop';
import {
  AppText,
  ChevronIcon,
  IconButton,
  PrimaryButton,
  ProgressIndicator,
  ScreenContainer,
} from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * Introduction to the Daniel 2 lesson ("The Dream of the Great Image").
 *
 * The text below is introductory copy written for this screen, not Scripture, and the picture is a placeholder
 * illustration. Real lesson content will come from the published lessons API; progress will be device-local.
 */
export function Daniel2IntroScreen() {
  const router = useRouter();
  const { spacing, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [noticeVisible, setNoticeVisible] = useState(false);

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <HeroBackdrop source={require('@/assets/images/placeholder/daniel-2-hall-placeholder.jpg')} reach={0.78} />
      <StatusBar style="light" />

      {/* back, over the picture; sits below the status bar / notch */}
      <View style={[styles.back, { top: insets.top + spacing.sm, left: spacing.lg + insets.left }]}>
        <IconButton accessibilityLabel="Go back" onPress={() => router.back()}>
          <ChevronIcon direction="left" color="textOnImage" />
        </IconButton>
      </View>

      <ScreenContainer safeEdges={['bottom']} scroll transparent>
        <View style={styles.pushDown} />

        <View style={{ gap: spacing.md }}>
          <AppText variant="label" color="primaryHighlight" align="center">
            Prophecy lesson
          </AppText>

          <View accessible accessibilityRole="header">
            <AppText variant="hero" align="center" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              DANIEL 2
            </AppText>
          </View>

          <AppText variant="subtitle" color="primaryHighlight" align="center">
            The Dream of the Great Image
          </AppText>

          <AppText variant="body" color="textSecondary" align="center" style={{ marginTop: spacing.sm }}>
            A king is troubled by a dream no one can explain. Step into ancient Babylon and follow how Scripture and
            history meet in the story of a great image and the kingdoms it stands for.
          </AppText>
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <ProgressIndicator value={0} label="Lesson progress" />
        </View>

        <PrimaryButton
          label="Start lesson"
          onPress={() => setNoticeVisible(true)}
          style={{ marginTop: spacing.xl }}
        />
        {noticeVisible ? (
          <AppText variant="caption" color="textMuted" align="center" accessibilityLiveRegion="polite" style={{ marginTop: spacing.md }}>
            The lesson scenes are built in the next phase.
          </AppText>
        ) : null}

        <View style={{ height: spacing.xl }} />
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  back: { position: 'absolute', zIndex: 2 },
  /** Leaves the upper part of the screen to the picture: it grows on tall phones, and stays small enough on short ones that the button remains in view. */
  pushDown: { flexGrow: 1, minHeight: 96 },
});
