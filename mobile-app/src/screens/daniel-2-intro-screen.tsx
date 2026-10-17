import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeroBackdrop } from '@/components/hero-backdrop';
import { HeroStatusBar } from '@/components/hero-status-bar';
import { appImages } from '@/config/images';
import {
  AppText,
  ChevronIcon,
  IconButton,
  PrimaryButton,
  ProgressIndicator,
  ScreenContainer,
  SecondaryButton,
} from '@/components/ui';
import { hasStarted } from '@/features/daniel-2/progress';
import { useDaniel2Lesson } from '@/features/daniel-2/use-daniel2-lesson';
import { useLessonProgress } from '@/features/daniel-2/use-lesson-progress';
import { useTheme } from '@/theme';

/**
 * Entry to the Daniel 2 lesson: title, introduction, and the way in (Start, or Resume and Start over).
 *
 * The lesson content is CONFIGURED, built-in educational content (see src/features/daniel-2); it is not a course from the
 * backend catalog, and the picture is a placeholder illustration. Progress is device-local.
 */
export function Daniel2IntroScreen() {
  const router = useRouter();
  const { spacing, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [lessonResource] = useDaniel2Lesson();
  const lesson = lessonResource.status === 'success' ? lessonResource.data : null;
  const p = useLessonProgress(lesson ? lesson.scenes.map((scene) => scene.id) : null);

  // The lesson screen sits on top of this one and changes the saved progress; show it when we come back.
  const { reload: reloadProgress } = p;
  useFocusEffect(
    useCallback(() => {
      reloadProgress();
    }, [reloadProgress]),
  );

  const total = lesson?.scenes.length ?? 0;
  const resumable = p.ready && hasStarted(p.progress) && p.progress.completed.length < total;
  const finished = p.ready && total > 0 && p.progress.completed.length >= total;
  const open = () => router.push('/daniel-2-lesson');

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <HeroBackdrop source={appImages.hall.source} reach={0.78} />
      <HeroStatusBar />

      {/* back, over the picture; sits below the status bar / notch */}
      <View style={[styles.back, { top: insets.top + spacing.sm, left: spacing.lg + insets.left }]}>
        <IconButton accessibilityLabel="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
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
          <ProgressIndicator
            value={total > 0 ? p.progress.completed.length / total : 0}
            label={finished ? 'Lesson complete' : resumable ? `Scene ${p.progress.currentIndex + 1} of ${total}` : 'Lesson progress'}
          />
        </View>

        <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
          <PrimaryButton
            label={finished ? 'Review lesson' : resumable ? 'Resume lesson' : 'Start lesson'}
            disabled={!lesson || !p.ready}
            onPress={open}
          />
          {resumable || finished ? (
            <SecondaryButton
              label="Start over"
              onPress={() => {
                p.restart();
                open();
              }}
            />
          ) : null}
        </View>

        {lesson ? (
          <AppText variant="caption" color="textMuted" align="center" style={{ marginTop: spacing.md }}>
            {lesson.source.label} Progress is saved on this device only.
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
