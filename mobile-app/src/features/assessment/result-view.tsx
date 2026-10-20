import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Card, PrimaryButton, SecondaryButton } from '@/components/ui';
import { LevelSelector } from '@/learning/level-selector';
import { LEARNING_LEVELS, LEVEL_LABELS, type LearningLevel } from '@/learning/levels';
import { useTheme } from '@/theme';

import type { SubmissionResult } from './assessment-types';

type Props = {
  result: SubmissionResult;
  /** The level the learner has saved now, or null if they never chose one. It is only changed by "Use this level". */
  savedLevel: LearningLevel | null;
  onApply: (level: LearningLevel) => void;
  /** Leave without changing the level. */
  onKeep: () => void;
  /** Load the assessment that is active now (only offered when the one answered is no longer current and another is). */
  onTakeCurrent: () => void;
};

const joinLevels = (levels: readonly LearningLevel[]) => levels.map((l) => LEVEL_LABELS[l]).join(' and ');

/**
 * The backend's recommendation. The app shows it and lets the learner decide: nothing is saved until "Use this level", the learner can pick another level,
 * and they can keep the level they already have. The level is never calculated here.
 */
export function ResultView({ result, savedLevel, onApply, onKeep, onTakeCurrent }: Props) {
  const { spacing } = useTheme();
  const [chosen, setChosen] = useState<LearningLevel>(result.recommendedLevel);
  const tied = result.tiedLevels.length > 1;
  const differs = chosen !== result.recommendedLevel;

  return (
    <View style={{ gap: spacing.xl }}>
      <View style={{ gap: spacing.sm }} accessible accessibilityRole="header" accessibilityLabel={`Your recommended level is ${LEVEL_LABELS[result.recommendedLevel]}`}>
        <AppText variant="caption" color="textMuted" align="center">
          Your recommended level
        </AppText>
        <AppText variant="title" color="primaryHighlight" align="center">
          {LEVEL_LABELS[result.recommendedLevel]}
        </AppText>
      </View>

      {!result.current ? (
        <Card variant="outlined" style={{ gap: spacing.sm }}>
          <AppText variant="label" color="textPrimary">
            This assessment was updated
          </AppText>
          <AppText variant="bodySmall" color="textSecondary">
            {result.activePublication
              ? 'A newer version was published while you were answering. This recommendation is based on the version you answered. You can use it, or take the current assessment.'
              : 'The assessment you answered is no longer active. This recommendation is still based on your answers. You can use it or choose your own level.'}
          </AppText>
          {result.activePublication ? <SecondaryButton label="Take the current assessment" onPress={onTakeCurrent} /> : null}
        </Card>
      ) : null}

      {result.message ? (
        <Card variant="elevated">
          <AppText variant="body">{result.message}</AppText>
        </Card>
      ) : (
        <AppText variant="bodySmall" color="textSecondary" align="center">
          Based on your answers, this is a good place to start. You can change your level at any time.
        </AppText>
      )}

      {tied ? (
        <AppText variant="bodySmall" color="textSecondary">
          Your answers pointed equally to {joinLevels(result.tiedLevels)}. We suggest {LEVEL_LABELS[result.recommendedLevel]}, but any of them could suit you.
        </AppText>
      ) : null}

      <View style={{ gap: spacing.xs }}>
        <AppText variant="caption" color="textMuted">
          You answered {result.answered} of {result.total} questions. Points by level:
        </AppText>
        <AppText variant="bodySmall" color="textSecondary" accessibilityLabel={LEARNING_LEVELS.map((l) => `${LEVEL_LABELS[l]}, ${result.scores[l]} points`).join('. ')}>
          {LEARNING_LEVELS.map((l) => `${LEVEL_LABELS[l]} ${result.scores[l]}`).join('  ·  ')}
        </AppText>
      </View>

      <View style={{ gap: spacing.md }}>
        <AppText variant="label" color="textPrimary">
          Choose your level
        </AppText>
        <LevelSelector value={chosen} onChange={setChosen} />
        {differs ? (
          <AppText variant="caption" color="textMuted">
            You chose a different level from the recommendation. That is completely fine.
          </AppText>
        ) : null}
      </View>

      <View style={{ gap: spacing.md }}>
        <PrimaryButton label={`Use ${LEVEL_LABELS[chosen]} level`} onPress={() => onApply(chosen)} />
        <SecondaryButton label={savedLevel ? `Keep my current level (${LEVEL_LABELS[savedLevel]})` : 'Decide later'} onPress={onKeep} />
      </View>
    </View>
  );
}
