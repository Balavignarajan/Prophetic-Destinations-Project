import { useRef, useState } from 'react';
import { View } from 'react-native';

import { AppText, OptionRow, PrimaryButton, SecondaryButton } from '@/components/ui';
import { useLearningProgress } from '@/features/learning/learning-provider';
import type { ProgressLevel } from '@/features/learning/progress-model';
import { useTheme } from '@/theme';

/**
 * Renders a published QUIZ block. The lesson snapshot carries the quiz as it was when the lesson was published
 * (backend/src/modules/lessons/application/quiz-embed.service.ts):
 *   { quizId, quizVersion, quiz: { title, description, questions: [{ id, type: 'SINGLE_CHOICE', prompt, explanation,
 *                                                                   correctOptionId, options: [{ id, text }] }] } }
 * so a quiz works with no connection. Because the snapshot is public, the correct answers are on the device and are not secret;
 * that is the cost of offline feedback. Answers are checked on the device. No accounts, no pass mark, no attempt limit, and a quiz never
 * blocks completing the lesson.
 *
 * RESULTS (PROG-001, FLOW-06, QUIZ-001): checking the answers saves the result on this device with the learner's progress. PROVISIONAL rules, since
 * the documents do not define attempts or retention: only the LATEST completed result of this quiz block is kept; every question counts in the
 * total and an unanswered one scores 0. The saved result belongs to this lesson, level, block, quiz and PUBLISHED version of the lesson: after
 * the lesson is republished it is not shown. When the learner comes back, the saved result is shown clearly labelled as the PREVIOUS completed
 * result. "Try again" starts a fresh attempt and the saved result stays until the new attempt is checked. The attempt in progress and the saved
 * result are separate; a new unfinished attempt never displays an old score as its own. If the result cannot be stored the learner still sees
 * the score and is told it was not saved.
 *
 * Only SINGLE_CHOICE questions are supported. The publisher refuses a quiz with anything else, but if one still reaches the app the WHOLE quiz is
 * shown as unavailable (no partial quiz, no score, nothing saved).
 */
type Option = { id: string; text: string };
type Question = { id: string; prompt: string; explanation: string | null; correctOptionId: string; options: Option[] };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const asText = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * LEVELS: the quiz in a published lesson is already LEVEL-SPECIFIC. The server froze, for this level, only the questions enabled at it (a question with no level
 * setting is enabled everywhere), so Advanced-only questions and their answers are not in a Beginner lesson at all. This screen shows and scores exactly the frozen
 * questions (the score total is that number), never rebuilds anything from the quiz library, and treats older payloads without any level data the same way.
 * Results are kept per lesson, block, level and publication, so a result is shown only for the quiz it was taken on.
 */
/** The quiz, or null when any part of it cannot be shown (unsupported type, missing parts): never a partial quiz. */
function readQuiz(content: Record<string, unknown>): { quizId: string; title: string; description: string; questions: Question[] } | null {
  const quiz = content.quiz;
  const quizId = asText(content.quizId);
  if (!quizId || !isRecord(quiz) || !Array.isArray(quiz.questions) || quiz.questions.length === 0) return null;
  const questions: Question[] = [];
  for (const raw of quiz.questions) {
    if (!isRecord(raw) || raw.type !== 'SINGLE_CHOICE' || !Array.isArray(raw.options)) return null;
    const options = raw.options.filter(isRecord).map((o) => ({ id: asText(o.id), text: asText(o.text) }));
    const correct = asText(raw.correctOptionId);
    if (!asText(raw.id) || !asText(raw.prompt) || options.length < 2 || options.length !== raw.options.length) return null;
    if (options.some((o) => !o.id || !o.text) || !options.some((o) => o.id === correct)) return null;
    questions.push({ id: asText(raw.id), prompt: asText(raw.prompt), explanation: asText(raw.explanation) || null, correctOptionId: correct, options });
  }
  return { quizId, title: asText(quiz.title), description: asText(quiz.description), questions };
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

export function QuizContent({
  content,
  lessonId,
  lessonTitle,
  level,
  blockId,
  contentHash,
}: {
  content: Record<string, unknown>;
  lessonId: string;
  lessonTitle: string;
  level: ProgressLevel;
  blockId: string;
  /** Identifies the published version of the lesson; a saved result is shown only for the same one. */
  contentHash: string;
}) {
  const { spacing, colors, radius } = useTheme();
  const { ready, quizResultFor, recordQuizResult } = useLearningProgress();
  // The attempt being taken now. Separate from the saved result, which is only read from the progress store.
  const [mode, setMode] = useState<'saved' | 'attempt' | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const attemptToken = useRef(0);
  const quiz = readQuiz(content);

  if (!quiz) {
    return (
      <View style={{ gap: spacing.xs, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface }}>
        <AppText variant="label" color="warning">
          Quiz not available
        </AppText>
        <AppText variant="bodySmall" color="textSecondary" accessibilityLiveRegion="polite">
          This lesson has a quiz that this version of the app cannot show, so no score is given. The rest of the lesson is not affected. Updating the app may fix this.
        </AppText>
      </View>
    );
  }

  const saved = ready ? quizResultFor({ lessonId, level, blockId, quizId: quiz.quizId, contentHash }) : null;
  // Until the learner starts a new attempt, a matching saved result is what is shown. Once they have, it is only mentioned as "previous".
  const view = mode ?? (saved ? 'saved' : 'attempt');
  const score = quiz.questions.filter((q) => answers[q.id] === q.correctOptionId).length;
  const unanswered = quiz.questions.filter((q) => !answers[q.id]).length;
  const dateOf = (time: number) => {
    try {
      return new Date(time).toLocaleDateString(undefined, { dateStyle: 'medium' });
    } catch {
      return '';
    }
  };

  const startNewAttempt = () => {
    attemptToken.current += 1;
    setMode('attempt');
    setAnswers({});
    setChecked(false);
    setSaveState('idle');
  };

  const check = () => {
    const token = (attemptToken.current += 1);
    setMode('attempt');
    setChecked(true);
    setSaveState('saving');
    const finished = {
      lessonId,
      level,
      blockId,
      quizId: quiz.quizId,
      contentHash,
      lessonTitle,
      score,
      total: quiz.questions.length,
      completedAt: Date.now(),
      answers: { ...answers },
    };
    recordQuizResult(finished)
      .then((stored) => {
        if (attemptToken.current === token) setSaveState(stored ? 'saved' : 'failed');
      })
      .catch(() => {
        if (attemptToken.current === token) setSaveState('failed');
      });
  };

  const renderQuestion = (question: Question, index: number, chosenAnswers: Record<string, string>, interactive: boolean, feedback: boolean) => {
    const chosen = chosenAnswers[question.id];
    const correct = chosen === question.correctOptionId;
    const correctText = question.options.find((o) => o.id === question.correctOptionId)?.text;
    return (
      <View key={question.id} style={{ gap: spacing.sm }}>
        <AppText variant="body" style={{ fontWeight: '700' }}>
          {index + 1}. {question.prompt}
        </AppText>
        <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
          {question.options.map((option) => (
            <OptionRow
              key={option.id}
              title={option.text}
              selected={chosen === option.id}
              onSelect={() => {
                if (!interactive) return;
                // Answering starts (or continues) a new attempt: a saved result that finishes loading later must not replace it.
                setMode('attempt');
                setAnswers((current) => ({ ...current, [question.id]: option.id }));
              }}
            />
          ))}
        </View>
        {feedback ? (
          <View style={{ gap: spacing.xs }} accessibilityLiveRegion="polite">
            <AppText variant="label" color={correct ? 'success' : 'warning'}>
              {correct ? 'Correct' : chosen ? 'Not quite' : 'Not answered'}
            </AppText>
            {!correct && correctText ? (
              <AppText variant="bodySmall" color="textSecondary">
                Correct answer: {correctText}
              </AppText>
            ) : null}
            {question.explanation ? (
              <AppText variant="bodySmall" color="textSecondary">
                {question.explanation}
              </AppText>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View
      style={{
        gap: spacing.lg,
        padding: spacing.lg,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderGold,
        backgroundColor: colors.surface,
      }}>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="heading" accessibilityRole="header">
          {quiz.title || 'Quiz'}
        </AppText>
        {quiz.description ? (
          <AppText variant="bodySmall" color="textSecondary">
            {quiz.description}
          </AppText>
        ) : null}
      </View>

      {view === 'saved' && saved ? (
        <>
          <View style={{ gap: spacing.xs }} accessibilityLiveRegion="polite">
            <AppText variant="label" color="primaryHighlight">
              Previous completed result
            </AppText>
            <AppText variant="body" style={{ fontWeight: '700' }}>
              You got {saved.score} of {saved.total} correct
              {dateOf(saved.completedAt) ? ` · ${dateOf(saved.completedAt)}` : ''}
            </AppText>
            <AppText variant="caption" color="textMuted">
              Saved on this device. Your answers are shown below.
            </AppText>
          </View>
          {quiz.questions.map((question, index) => renderQuestion(question, index, saved.answers, false, true))}
          <SecondaryButton label="Try the quiz again" onPress={startNewAttempt} />
        </>
      ) : (
        <>
          {saved && !checked ? (
            <AppText variant="caption" color="textMuted">
              Previous completed result: {saved.score} of {saved.total} correct{dateOf(saved.completedAt) ? ` (${dateOf(saved.completedAt)})` : ''}. It stays saved until you check these new answers.
            </AppText>
          ) : null}

          {quiz.questions.map((question, index) => renderQuestion(question, index, answers, !checked, checked))}

          {checked ? (
            <View style={{ gap: spacing.md }}>
              <AppText variant="body" accessibilityLiveRegion="polite" style={{ fontWeight: '700' }}>
                You got {score} of {quiz.questions.length} correct.
              </AppText>
              {saveState === 'failed' ? (
                <AppText variant="bodySmall" color="warning" accessibilityLiveRegion="polite">
                  This result could not be saved on this device, so it will not be here next time. Your score above is still correct.
                </AppText>
              ) : saveState === 'saved' ? (
                <AppText variant="caption" color="textMuted" accessibilityLiveRegion="polite">
                  Result saved on this device.
                </AppText>
              ) : (
                <AppText variant="caption" color="textMuted">
                  Saving result…
                </AppText>
              )}
              <SecondaryButton label="Try the quiz again" onPress={startNewAttempt} />
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {unanswered > 0 && unanswered < quiz.questions.length ? (
                <AppText variant="caption" color="textMuted">
                  {unanswered} {unanswered === 1 ? 'question is' : 'questions are'} not answered yet. You can still check your answers.
                </AppText>
              ) : null}
              <PrimaryButton label="Check my answers" disabled={unanswered === quiz.questions.length} onPress={check} />
            </View>
          )}
        </>
      )}
    </View>
  );
}
