import { View } from 'react-native';

import { AppText, Card, SecondaryButton } from '@/components/ui';
import { useTheme } from '@/theme';

import type { QuizResult } from '../progress';
import type { SceneId, SummaryScene } from '../types';

type Props = {
  scene: SummaryScene;
  quizResult: QuizResult | null;
  onOpenScene: (id: SceneId) => void;
  onRetakeQuiz: () => void;
  onRestart: () => void;
};

/** The recap, the quiz score, and ways back: review the timeline, retake the quiz, or start over. */
export function SummarySceneView({ scene, quizResult, onOpenScene, onRetakeQuiz, onRestart }: Props) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" color="primaryHighlight">
          {scene.eyebrow}
        </AppText>
        <AppText variant="title" accessibilityRole="header">
          {scene.title}
        </AppText>
      </View>

      <Card variant="elevated">
        <View style={{ gap: spacing.md }}>
          {scene.points.map((point) => (
            <View key={point.sceneId} style={{ gap: spacing.xxs }}>
              <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700' }}>
                {point.heading}
              </AppText>
              <AppText variant="bodySmall" color="textSecondary">
                {point.text}
              </AppText>
            </View>
          ))}
        </View>
      </Card>

      <AppText variant="body" color="textSecondary">
        {scene.closing}
      </AppText>

      <Card>
        <AppText variant="caption" color="textMuted">
          Quiz
        </AppText>
        <AppText variant="heading" color={quizResult ? 'primaryHighlight' : 'textMuted'}>
          {quizResult ? `${quizResult.correct} / ${quizResult.total}` : 'Not taken'}
        </AppText>
      </Card>

      <View style={{ gap: spacing.md }}>
        <SecondaryButton label="Review the timeline" onPress={() => onOpenScene('timeline')} />
        <SecondaryButton label={quizResult ? 'Retake the quiz' : 'Take the quiz'} onPress={quizResult ? onRetakeQuiz : () => onOpenScene('quiz')} />
        <SecondaryButton label="Start the lesson over" onPress={onRestart} />
      </View>
    </View>
  );
}
