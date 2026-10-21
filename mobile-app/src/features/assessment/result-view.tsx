import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Card, OptionRow, PrimaryButton, SecondaryButton } from '@/components/ui';
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
  const { colors, spacing } = useTheme();
  const [chosen, setChosen] = useState<LearningLevel>(result.recommendedLevel);
  const tied = result.tiedLevels.length > 1;
  const differs = chosen !== result.recommendedLevel;

  return (
    <View style={{ gap: spacing.xl }}>
      <Card variant="elevated" style={{ borderColor: colors.borderGold, gap: spacing.lg }}>
        <View
          accessible
          accessibilityRole="header"
          accessibilityLabel={`Your suggested level is ${LEVEL_LABELS[result.recommendedLevel]}`}
          style={{ gap: spacing.sm, alignItems: 'center' }}>
          <AppText variant="bodySmall" color="textSecondary" align="center" style={{ fontWeight: '600' }}>
            Your suggested level
          </AppText>
          <AppText variant="title" color="primaryHighlight" align="center" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {LEVEL_LABELS[result.recommendedLevel]}
          </AppText>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 48, height: 2, backgroundColor: colors.primary }} />
        </View>
        {result.message ? (
          <AppText variant="body" align="center">
            {result.message}
          </AppText>
        ) : (
          <AppText variant="body" color="textSecondary" align="center">
            Based on your answers, this is a good place to start. You can change your level at any time.
          </AppText>
        )}
      </Card>

      {!result.current ? (
        <Card variant="outlined" style={{ gap: spacing.sm }}>
          <AppText variant="body" style={{ fontWeight: '700' }}>
            This assessment was updated
          </AppText>
          <AppText variant="bodySmall" color="textSecondary">
            {result.activePublication
              ? 'A newer version was published while you were answering. This recommendation is based on the version you answered. You can use it, or take the current assessment.'
              : 'The assessment you answered is no longer active. This recommendation is still based on your answers. You can use it or choose your own level.'}
          </AppText>
          {result.activePublication ? <SecondaryButton size="medium" label="Take the current assessment" onPress={onTakeCurrent} /> : null}
        </Card>
      ) : null}

      {tied ? (
        <AppText variant="bodySmall" color="textSecondary">
          Your answers pointed equally to {joinLevels(result.tiedLevels)}. We suggest {LEVEL_LABELS[result.recommendedLevel]}, but any of them could suit you.
        </AppText>
      ) : null}

      <View style={{ gap: spacing.md }}>
        <AppText variant="heading" accessibilityRole="header">
          Choose your level
        </AppText>
        <View accessibilityRole="radiogroup" accessibilityLabel="Learning level" style={{ gap: spacing.md }}>
          {LEARNING_LEVELS.map((level) => (
            <OptionRow
              key={level}
              title={LEVEL_LABELS[level]}
              description={level === result.recommendedLevel ? 'Suggested by your answers' : undefined}
              selected={chosen === level}
              onSelect={() => setChosen(level)}
            />
          ))}
        </View>
        {differs ? (
          <AppText variant="bodySmall" color="textMuted">
            You chose a different level from the suggestion. That is completely fine.
          </AppText>
        ) : null}
      </View>

      <View style={{ gap: spacing.xs }}>
        <AppText variant="bodySmall" color="textMuted">
          You answered {result.answered} of {result.total} questions. Points by level:
        </AppText>
        <AppText variant="bodySmall" color="textSecondary" accessibilityLabel={LEARNING_LEVELS.map((l) => `${LEVEL_LABELS[l]}, ${result.scores[l]} points`).join('. ')}>
          {LEARNING_LEVELS.map((l) => `${LEVEL_LABELS[l]} ${result.scores[l]}`).join('  ·  ')}
        </AppText>
      </View>

      <View style={{ gap: spacing.md }}>
        <PrimaryButton label={`Use ${LEVEL_LABELS[chosen]} level`} onPress={() => onApply(chosen)} />
        <SecondaryButton label={savedLevel ? `Keep my current level (${LEVEL_LABELS[savedLevel]})` : 'Decide later'} onPress={onKeep} />
      </View>
    </View>
  );
}
