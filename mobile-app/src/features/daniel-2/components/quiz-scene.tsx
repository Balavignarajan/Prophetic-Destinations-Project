import { useState } from 'react';
import { View } from 'react-native';

import { AppText, OptionRow, PrimaryButton, ProgressIndicator, SecondaryButton } from '@/components/ui';
import { useTheme } from '@/theme';

import type { QuizResult } from '../progress';
import type { Daniel2Lesson, QuizScene, SceneId } from '../types';

type Props = {
  scene: QuizScene;
  lesson: Daniel2Lesson;
  /** The saved result, if the quiz was already finished (for example after resuming). */
  result: QuizResult | null;
  onFinish: (result: QuizResult) => void;
  onRetake: () => void;
  onReview: (id: SceneId) => void;
};

/**
 * A local, single-choice quiz. One question at a time: choose, submit, see feedback, continue. The answer key is read only after
 * a question has been submitted. Marked on this device; nothing is sent anywhere.
 */
export function QuizSceneView({ scene, lesson, result, onFinish, onRetake, onReview }: Props) {
  const { colors, layout, radius, spacing } = useTheme();
  const questions = lesson.quiz;
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const header = (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label" color="primaryHighlight">
        {scene.eyebrow}
      </AppText>
      <AppText variant="title" accessibilityRole="header">
        {scene.title}
      </AppText>
    </View>
  );

  const retake = () => {
    setIndex(0);
    setSelected(null);
    setSubmitted(false);
    setAnswers({});
    onRetake();
  };

  if (result) {
    const missed = questions.filter((q) => answers[q.id] !== undefined && answers[q.id] !== q.correctOptionId);
    return (
      <View style={{ gap: spacing.lg }}>
        {header}
        <View
          accessibilityLiveRegion="polite"
          style={{ alignItems: 'center', gap: spacing.sm, padding: spacing.xl, borderRadius: radius.lg, borderWidth: layout.hairline, borderColor: colors.borderGold, backgroundColor: colors.surfaceElevated }}>
          <AppText variant="caption" color="textMuted">
            Your score
          </AppText>
          <AppText variant="hero" color="primaryHighlight">
            {result.correct} / {result.total}
          </AppText>
          <AppText variant="bodySmall" color="textSecondary" align="center">
            {result.correct === result.total
              ? 'Every answer correct.'
              : result.correct >= Math.ceil(result.total / 2)
                ? 'A good start. Review the scenes below and try again.'
                : 'Take another look at the scenes below and try again.'}
          </AppText>
        </View>
        {missed.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="label" color="textMuted">
              Worth another look
            </AppText>
            {missed.map((q) => {
              const target = lesson.scenes.find((s) => s.id === q.reviewSceneId);
              return <SecondaryButton key={q.id} label={`Review: ${target?.title ?? q.reviewSceneId}`} onPress={() => onReview(q.reviewSceneId)} />;
            })}
          </View>
        ) : null}
        <SecondaryButton label="Retake the quiz" onPress={retake} />
      </View>
    );
  }

  const question = questions[index];
  if (!question) return null;
  const isLast = index === questions.length - 1;

  const submit = () => {
    if (!selected) return;
    setAnswers((current) => ({ ...current, [question.id]: selected }));
    setSubmitted(true);
  };
  const next = () => {
    if (isLast) {
      const correct = questions.filter((q) => (q.id === question.id ? selected : answers[q.id]) === q.correctOptionId).length;
      onFinish({ correct, total: questions.length });
      return;
    }
    setIndex(index + 1);
    setSelected(null);
    setSubmitted(false);
  };

  const wasCorrect = submitted && selected === question.correctOptionId;

  return (
    <View style={{ gap: spacing.lg }}>
      {header}
      {index === 0 && !submitted ? (
        <AppText variant="bodySmall" color="textSecondary">
          {scene.intro}
        </AppText>
      ) : null}
      <ProgressIndicator value={(index + (submitted ? 1 : 0)) / questions.length} label={`Question ${index + 1} of ${questions.length}`} showPercent={false} />
      <AppText variant="heading" accessibilityRole="header">
        {question.prompt}
      </AppText>

      <View accessibilityRole="radiogroup" accessibilityLabel={question.prompt} style={{ gap: spacing.md }}>
        {question.options.map((option) => (
          <View key={option.id} pointerEvents={submitted ? 'none' : 'auto'}>
            <OptionRow title={option.text} selected={selected === option.id} onSelect={() => setSelected(option.id)} />
          </View>
        ))}
      </View>

      {submitted ? (
        <View
          accessibilityLiveRegion="polite"
          style={{ gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, borderWidth: layout.hairline, borderColor: wasCorrect ? colors.success : colors.warning, backgroundColor: colors.surface }}>
          <AppText variant="heading" color={wasCorrect ? 'success' : 'warning'}>
            {wasCorrect ? 'Correct' : 'Not quite'}
          </AppText>
          {!wasCorrect ? (
            <AppText variant="bodySmall" color="textSecondary">
              The answer: {question.options.find((o) => o.id === question.correctOptionId)?.text}
            </AppText>
          ) : null}
          <AppText variant="bodySmall">{question.explanation}</AppText>
        </View>
      ) : null}

      {submitted ? (
        <PrimaryButton label={isLast ? 'See your score' : 'Next question'} onPress={next} />
      ) : (
        <PrimaryButton label="Submit answer" disabled={!selected} onPress={submit} />
      )}
    </View>
  );
}
