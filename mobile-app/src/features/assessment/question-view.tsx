import { View } from 'react-native';

import { AppText, OptionRow, ProgressIndicator } from '@/components/ui';
import { useTheme } from '@/theme';

import type { PublicQuestion } from './assessment-types';

type Props = {
  question: PublicQuestion;
  /** 0-based position of this question. */
  index: number;
  total: number;
  selectedOptionId: string | undefined;
  onSelect: (optionId: string) => void;
  /** true: this question must be answered before moving on. */
  required: boolean;
};

/** One single-choice question: progress, the question text and its answers as a radio list. Selecting again changes the answer. */
export function QuestionView({ question, index, total, selectedOptionId, onSelect, required }: Props) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      <ProgressIndicator value={(index + 1) / total} label={`Question ${index + 1} of ${total}`} showPercent={false} />
      <AppText variant="heading" accessibilityRole="header">
        {question.prompt}
      </AppText>
      <AppText variant="caption" color="textMuted">
        {required ? 'Choose one answer to continue.' : 'Choose one answer, or skip this question.'}
      </AppText>
      <View accessibilityRole="radiogroup" accessibilityLabel={`Answers to question ${index + 1}`} style={{ gap: spacing.md }}>
        {question.options.map((option) => (
          <OptionRow key={option.id} title={option.text} selected={option.id === selectedOptionId} onSelect={() => onSelect(option.id)} />
        ))}
      </View>
    </View>
  );
}
