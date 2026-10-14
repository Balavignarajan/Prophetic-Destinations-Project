import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { ScrollView, View } from 'react-native';

import {
  AppText,
  ChevronIcon,
  ErrorState,
  IconButton,
  LoadingState,
  PrimaryButton,
  ProgressIndicator,
  ScreenContainer,
} from '@/components/ui';
import { SceneRenderer, type SceneContext } from '@/features/daniel-2/components/scene-renderer';
import { SceneTransition } from '@/features/daniel-2/components/scene-transition';
import type { SceneId } from '@/features/daniel-2/types';
import { useDaniel2Lesson } from '@/features/daniel-2/use-daniel2-lesson';
import { useLessonProgress } from '@/features/daniel-2/use-lesson-progress';
import { useTheme } from '@/theme';

/**
 * The Daniel 2 scene lesson. One scene at a time, driven by the lesson model and the device-local progress:
 * Continue completes the scene and advances; Back returns to the previous scene (and leaves from the first). Progress is saved
 * whenever a scene is completed or opened, so leaving at any point loses nothing.
 */
export function Daniel2LessonScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const [lessonResource, reload] = useDaniel2Lesson();
  const lesson = lessonResource.status === 'success' ? lessonResource.data : null;
  const sceneIds = useMemo(() => lesson?.scenes.map((scene) => scene.id) ?? null, [lesson]);
  const p = useLessonProgress(sceneIds);
  const scroller = useRef<ScrollView>(null);

  const index = p.progress.currentIndex;
  const scene = lesson?.scenes[index] ?? null;

  useEffect(() => {
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, [scene?.id]);

  if (lessonResource.status === 'error') {
    return (
      <ScreenContainer>
        <ErrorState title="Lesson unavailable" message="The lesson could not be loaded." onRetry={reload} />
      </ScreenContainer>
    );
  }
  if (!lesson || !scene || !p.ready) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading lesson…" />
      </ScreenContainer>
    );
  }

  const total = lesson.scenes.length;
  const first = index === 0;
  const last = index === total - 1;
  const quizPending = scene.kind === 'quiz' && p.progress.quiz === null;
  const bookmarked = p.progress.bookmarks.includes(scene.id);

  const openScene = (id: SceneId) => p.goTo(lesson.scenes.findIndex((item) => item.id === id));
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/daniel-2'));
  const back = () => (first ? leave() : p.goTo(index - 1));
  const advance = () => {
    if (last) {
      p.completeCurrent();
      router.replace('/daniel-2');
      return;
    }
    p.completeAndAdvance();
  };

  const ctx: SceneContext = {
    lesson,
    quizResult: p.progress.quiz,
    onQuizFinish: p.recordQuiz,
    onRetakeQuiz: p.resetQuiz,
    onOpenScene: openScene,
    onRestart: p.restart,
  };

  return (
    <ScreenContainer>
      <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm }}>
          <IconButton accessibilityLabel={first ? 'Leave lesson' : 'Previous scene'} tone="ghost" onPress={back}>
            <ChevronIcon direction="left" color="textPrimary" />
          </IconButton>
          <View style={{ flex: 1 }} accessible accessibilityLabel={`Scene ${index + 1} of ${total}`}>
            <AppText variant="bodySmall" color="textSecondary" style={{ fontWeight: '700' }}>
              Scene {index + 1} of {total}
            </AppText>
          </View>
          <IconButton
            accessibilityLabel={bookmarked ? 'Remove bookmark from this scene' : 'Bookmark this scene'}
            tone="ghost"
            onPress={() => p.toggleBookmark(scene.id)}>
            <AppText variant="heading" color={bookmarked ? 'primaryHighlight' : 'textMuted'}>
              {bookmarked ? '★' : '☆'}
            </AppText>
          </IconButton>
        </View>
        <ProgressIndicator value={p.progress.completed.length / total} label="Lesson progress" />
      </View>

      <ScrollView
        ref={scroller}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <SceneTransition key={scene.id}>
          <SceneRenderer scene={scene} ctx={ctx} />
        </SceneTransition>
      </ScrollView>

      <View style={{ gap: spacing.xs, paddingTop: spacing.md, paddingBottom: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
        <PrimaryButton
          label={last ? 'Finish lesson' : first ? 'Start' : 'Continue'}
          disabled={quizPending}
          onPress={advance}
        />
        {quizPending ? (
          <AppText variant="caption" color="textMuted" align="center">
            Finish the quiz to continue.
          </AppText>
        ) : null}
      </View>
    </ScreenContainer>
  );
}
