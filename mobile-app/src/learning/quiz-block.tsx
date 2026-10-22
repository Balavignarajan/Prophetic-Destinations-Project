import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import {
  ActionRow,
  AppText,
  BlockFrame,
  BlockNotice,
  FeedbackMark,
  FeedbackReveal,
  OptionRow,
  PrimaryButton,
  ScoreReveal,
  SecondaryButton,
} from '@/components/ui';
import { useLearningProgress } from '@/features/learning/learning-provider';
import type { ProgressLevel } from '@/features/learning/progress-model';
import { ScriptureLinks } from '@/learning/scripture-links';
import { useTheme } from '@/theme';

/**
 * Renders a published QUIZ block. The lesson snapshot carries the quiz as it was when the lesson was published
 * (backend/src/modules/lessons/application/quiz-embed.service.ts):
 *   { quizId, quizVersion, quiz: { title, description, questions: [{ id, type: 'SINGLE_CHOICE', prompt, explanation,
 *                                                                   correctOptionId, scripture?, options: [{ id, text, feedback? }] }] } }
 * so a quiz works with no connection. `scripture` (the question's frozen passages) and an option's `feedback` are optional and only shown AFTER the
 * learner has checked the answer (and in the review): before that nothing on screen says which option is right. The feedback shown is the one of the
 * option the learner chose, next to (never instead of) the general explanation, and it is left out when it only repeats it. Because the snapshot is public, the correct answers are on the device and are not secret;
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
type Option = { id: string; text: string; feedback: string | null };
type Question = { id: string; prompt: string; explanation: string | null; correctOptionId: string; options: Option[]; scripture: unknown[] };

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
    // `feedback` (per option) and `scripture` (per question) are OPTIONAL additions: older snapshots have neither, and a value that is not usable is
    // simply left out, so it can never make the quiz unavailable.
    const options = raw.options.filter(isRecord).map((o) => ({ id: asText(o.id), text: asText(o.text), feedback: asText(o.feedback).trim() || null }));
    const correct = asText(raw.correctOptionId);
    if (!asText(raw.id) || !asText(raw.prompt) || options.length < 2 || options.length !== raw.options.length) return null;
    if (options.some((o) => !o.id || !o.text) || !options.some((o) => o.id === correct)) return null;
    questions.push({
      id: asText(raw.id),
      prompt: asText(raw.prompt),
      explanation: asText(raw.explanation) || null,
      correctOptionId: correct,
      options,
      scripture: Array.isArray(raw.scripture) ? raw.scripture : [],
    });
  }
  return { quizId, title: asText(quiz.title), description: asText(quiz.description), questions };
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

type Step = 'question' | 'results' | 'review';

/** "Question 2 of 5" with a segmented bar (a plain bar for long quizzes). Position within the quiz only: it says nothing about lesson completion. */
function QuestionProgress({ label, current, total }: { label: string; current: number; total: number }) {
  const { colors, radius, spacing } = useTheme();
  const segmented = total <= 10;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 1, max: total, now: current }}
      style={{ gap: spacing.sm }}>
      <AppText variant="bodySmall" color="textSecondary" style={{ fontWeight: '600' }}>
        {label}
      </AppText>
      {segmented ? (
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          {Array.from({ length: total }, (_, i) => (
            <View
              key={i}
              style={{ flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: i < current ? colors.primary : colors.border }}
            />
          ))}
        </View>
      ) : (
        <View style={{ height: 4, borderRadius: radius.pill, backgroundColor: colors.border, overflow: 'hidden' }}>
          <View style={{ width: `${(current / total) * 100}%`, height: '100%', backgroundColor: colors.primary }} />
        </View>
      )}
    </View>
  );
}

/**
 * The result of one checked question: a labelled card (never colour alone), the correct answer when missed, and the CMS explanation if there is one.
 * `animate` is true only for the moment the learner checks the answer; a question they come back to, and the review, show the same card at rest.
 * A correct answer gets a gold check; a missed one gets a quiet cross and a 3 point settle, in the existing amber accent.
 */
function QuestionFeedback({
  correct,
  answered,
  correctText,
  explanation,
  optionFeedback,
  scripture,
  animate,
}: {
  correct: boolean;
  answered: boolean;
  correctText: string | undefined;
  explanation: string | null;
  /** The author's feedback for the option the learner chose, when there is one. */
  optionFeedback: string | null;
  /** The question's frozen Scripture passages (a supporting reference), shown only here, after the answer has been checked. */
  scripture: unknown[];
  animate: boolean;
}) {
  const { colors, radius, spacing } = useTheme();
  const accent = correct ? colors.success : colors.warning;
  // The same sentence twice helps nobody: feedback that only repeats the general explanation is shown once.
  const feedback = optionFeedback && optionFeedback.trim() !== (explanation ?? '').trim() ? optionFeedback : null;
  return (
    <FeedbackReveal
      animate={animate}
      nudge={correct ? 0 : 3}
      accessibilityLiveRegion="polite"
      style={{
        gap: spacing.sm,
        padding: spacing.lg,
        borderRadius: radius.md,
        borderLeftWidth: 4,
        borderLeftColor: accent,
        backgroundColor: colors.surfaceElevated,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        {answered ? <FeedbackMark kind={correct ? 'correct' : 'incorrect'} animate={animate} /> : null}
        <AppText variant="body" color={correct ? 'success' : 'warning'} style={{ fontWeight: '700', flexShrink: 1 }}>
          {correct ? 'Correct' : answered ? 'Not quite' : 'Not answered'}
        </AppText>
      </View>
      {!correct && correctText ? (
        <AppText variant="body">
          <AppText variant="body" color="textSecondary">
            Correct answer:{' '}
          </AppText>
          {correctText}
        </AppText>
      ) : null}
      {feedback ? (
        <View style={{ gap: 2 }}>
          {explanation ? (
            <AppText variant="caption" color="textMuted" style={{ fontWeight: '600' }}>
              About your answer
            </AppText>
          ) : null}
          <AppText variant="body" color="textSecondary" style={{ fontSize: 16, lineHeight: 25 }}>
            {feedback}
          </AppText>
        </View>
      ) : null}
      {explanation ? (
        <View style={{ gap: 2 }}>
          {feedback ? (
            <AppText variant="caption" color="textMuted" style={{ fontWeight: '600' }}>
              Explanation
            </AppText>
          ) : null}
          <AppText variant="body" color="textSecondary" style={{ fontSize: 16, lineHeight: 25 }}>
            {explanation}
          </AppText>
        </View>
      ) : null}
      <ScriptureLinks entries={scripture} presentation="inline" />
    </FeedbackReveal>
  );
}

export function QuizContent({
  content,
  lessonId,
  lessonTitle,
  level,
  blockId,
  contentHash,
  onStepChange,
}: {
  content: Record<string, unknown>;
  lessonId: string;
  lessonTitle: string;
  level: ProgressLevel;
  blockId: string;
  /** Identifies the published version of the lesson; a saved result is shown only for the same one. */
  contentHash: string;
  /** Called when a different question, the results or the review comes into view (never when an answer is chosen). The lesson reader uses it to keep the quiz in view. */
  onStepChange?: () => void;
}) {
  const { spacing } = useTheme();
  const { ready, saveFailed, quizResultFor, recordQuizResult } = useLearningProgress();
  // The attempt being taken now. Separate from the saved result, which is only read from the progress store.
  const [mode, setMode] = useState<'saved' | 'attempt' | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  // Local, presentation-only state of the guided flow. Checking ONE question only marks it here; the result is stored once, from `check`.
  const [step, setStep] = useState<Step | null>(null);
  const [index, setIndex] = useState(0);
  const [checkedQuestions, setCheckedQuestions] = useState<Record<string, boolean>>({});
  const [reviewIndex, setReviewIndex] = useState(0);
  // The question whose answer was JUST checked (its feedback plays once), and whether the quiz was JUST finished (its result plays once).
  // Both are cleared as soon as the learner moves on, so coming back to a question, the review or a saved result never replays them.
  const [fresh, setFresh] = useState<string | null>(null);
  const [justFinished, setJustFinished] = useState(false);
  const attemptToken = useRef(0);
  const lastView = useRef({ step, index, reviewIndex });
  useEffect(() => {
    const previous = lastView.current;
    if (previous.step === step && previous.index === index && previous.reviewIndex === reviewIndex) return;
    lastView.current = { step, index, reviewIndex };
    onStepChange?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, index, reviewIndex]);
  const quiz = readQuiz(content);

  if (!quiz) {
    return (
      <BlockNotice
        title="Quiz not available"
        message="This lesson has a quiz that this version of the app cannot show, so no score is given. The rest of the lesson is not affected. Updating the app may fix this."
      />
    );
  }

  const saved = ready ? quizResultFor({ lessonId, level, blockId, quizId: quiz.quizId, contentHash }) : null;
  // Until the learner starts a new attempt, a matching saved result is what is shown. Once they have, it is only mentioned as "previous".
  const view = mode ?? (saved ? 'saved' : 'attempt');
  const showingSaved = view === 'saved' && saved !== null;
  const total = quiz.questions.length;
  const score = quiz.questions.filter((q) => answers[q.id] === q.correctOptionId).length;
  const currentStep: Step = step ?? (showingSaved ? 'results' : 'question');
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
    setStep('question');
    setIndex(0);
    setCheckedQuestions({});
    setReviewIndex(0);
    setFresh(null);
    setJustFinished(false);
  };

  // Stores the result exactly as before (one record for the whole quiz). It is only called from "View results".
  const check = () => {
    const token = (attemptToken.current += 1);
    setMode('attempt');
    setChecked(true);
    setSaveState('saving');
    setStep('results');
    setFresh(null);
    setJustFinished(true);
    const finished = {
      lessonId,
      level,
      blockId,
      quizId: quiz.quizId,
      contentHash,
      lessonTitle,
      score,
      total,
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

  const header = (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="heading" accessibilityRole="header">
        {quiz.title || 'Quiz'}
      </AppText>
      {quiz.description && currentStep === 'question' && index === 0 ? (
        <AppText variant="bodySmall" color="textSecondary">
          {quiz.description}
        </AppText>
      ) : null}
    </View>
  );

  // ------------------------------------------------------------------------------------------------ results
  if (currentStep === 'results') {
    const shown = showingSaved && saved ? { score: saved.score, total: saved.total, completedAt: saved.completedAt, answers: saved.answers } : { score, total, completedAt: 0, answers };
    const canReview = Object.keys(shown.answers).length > 0 || !showingSaved;
    return (
      <BlockFrame variant="interactive">
        {header}
        <ScoreReveal
          eyebrow={showingSaved ? 'Previous completed result' : 'Quiz complete'}
          score={shown.score}
          total={shown.total}
          note={
            showingSaved
              ? // A result held in memory after a failed write is not "saved": it is said plainly until a later write succeeds.
                `${dateOf(shown.completedAt) ? `Completed ${dateOf(shown.completedAt)}. ` : ''}${saveFailed ? 'Not saved on this device yet.' : 'Saved on this device.'}`
              : "You've completed this knowledge check."
          }
          animate={justFinished && !showingSaved}
        />
        {!showingSaved ? (
          saveState === 'failed' ? (
            <AppText variant="bodySmall" color="warning" accessibilityLiveRegion="polite">
              This result could not be saved on this device, so it will not be here next time. Your score above is still correct.
            </AppText>
          ) : saveState === 'saved' ? (
            <AppText variant="bodySmall" color="textMuted" accessibilityLiveRegion="polite">
              Result saved on this device.
            </AppText>
          ) : (
            <AppText variant="bodySmall" color="textMuted">
              Saving result…
            </AppText>
          )
        ) : null}
        <View style={{ gap: spacing.md }}>
          {canReview ? (
            <PrimaryButton
              label="Review answers"
              onPress={() => {
                setJustFinished(false);
                setReviewIndex(0);
                setStep('review');
              }}
            />
          ) : null}
          <SecondaryButton label={showingSaved ? 'Try the quiz again' : 'Try again'} onPress={startNewAttempt} />
        </View>
      </BlockFrame>
    );
  }

  // ------------------------------------------------------------------------------------------------ review (read-only)
  if (currentStep === 'review') {
    const reviewAnswers = showingSaved && saved ? saved.answers : answers;
    const question = quiz.questions[reviewIndex];
    const chosen = reviewAnswers[question.id];
    const correct = chosen === question.correctOptionId;
    const correctText = question.options.find((o) => o.id === question.correctOptionId)?.text;
    return (
      <BlockFrame variant="interactive">
        {header}
        <QuestionProgress label={`Review: question ${reviewIndex + 1} of ${total}`} current={reviewIndex + 1} total={total} />
        <AppText variant="body" accessibilityRole="header" style={{ fontSize: 18, lineHeight: 27, fontWeight: '600' }}>
          {question.prompt}
        </AppText>
        <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
          {question.options.map((option) => (
            <OptionRow
              key={option.id}
              title={option.text}
              selected={chosen === option.id}
              locked
              onSelect={() => undefined}
              outcome={option.id === question.correctOptionId ? 'correct' : chosen === option.id ? 'incorrect' : undefined}
            />
          ))}
        </View>
        <QuestionFeedback
          key={question.id}
          correct={correct}
          answered={chosen !== undefined}
          correctText={correctText}
          explanation={question.explanation}
          optionFeedback={question.options.find((o) => o.id === chosen)?.feedback ?? null}
          scripture={question.scripture}
          animate={false}
        />
        <ActionRow equal>
          <SecondaryButton size="medium" label="Previous" disabled={reviewIndex === 0} onPress={() => setReviewIndex(reviewIndex - 1)} />
          <SecondaryButton size="medium" label="Next" disabled={reviewIndex === total - 1} onPress={() => setReviewIndex(reviewIndex + 1)} />
        </ActionRow>
        <PrimaryButton label="Back to results" onPress={() => setStep('results')} />
      </BlockFrame>
    );
  }

  // ------------------------------------------------------------------------------------------------ one question at a time
  const question = quiz.questions[Math.min(index, total - 1)];
  const chosen = answers[question.id];
  const isChecked = checkedQuestions[question.id] === true;
  const isLast = index === total - 1;
  const correct = chosen === question.correctOptionId;
  const correctText = question.options.find((o) => o.id === question.correctOptionId)?.text;

  return (
    <BlockFrame variant="interactive">
      {header}
      {saved && !checked ? (
        <AppText variant="bodySmall" color="textMuted">
          Previous completed result: {saved.score} of {saved.total} correct{dateOf(saved.completedAt) ? ` (${dateOf(saved.completedAt)})` : ''}. It stays saved until you finish this new attempt.
        </AppText>
      ) : null}
      <QuestionProgress label={`Question ${index + 1} of ${total}`} current={index + 1} total={total} />
      <AppText variant="body" accessibilityRole="header" style={{ fontSize: 18, lineHeight: 27, fontWeight: '600' }}>
        {question.prompt}
      </AppText>
      <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
        {question.options.map((option) => (
          <OptionRow
            key={option.id}
            title={option.text}
            selected={chosen === option.id}
            locked={isChecked}
            outcome={isChecked ? (option.id === question.correctOptionId ? 'correct' : chosen === option.id ? 'incorrect' : undefined) : undefined}
            onSelect={() => {
              // Answering starts (or continues) a new attempt: a saved result that finishes loading later must not replace it.
              setMode('attempt');
              setAnswers((current) => ({ ...current, [question.id]: option.id }));
            }}
          />
        ))}
      </View>
      {isChecked ? (
        <QuestionFeedback
          key={question.id}
          correct={correct}
          answered={chosen !== undefined}
          correctText={correctText}
          explanation={question.explanation}
          optionFeedback={question.options.find((o) => o.id === chosen)?.feedback ?? null}
          scripture={question.scripture}
          animate={fresh === question.id}
        />
      ) : null}
      <ActionRow>
        {index > 0 ? (
          <SecondaryButton
            size="medium"
            label="Previous"
            onPress={() => {
              setFresh(null);
              setIndex(index - 1);
            }}
          />
        ) : null}
        {!isChecked ? (
          <PrimaryButton
            size="medium"
            label="Check answer"
            disabled={chosen === undefined}
            onPress={() => {
              setFresh(question.id);
              setCheckedQuestions((current) => ({ ...current, [question.id]: true }));
            }}
          />
        ) : isLast ? (
          <PrimaryButton size="medium" label="View results" onPress={check} />
        ) : (
          <PrimaryButton
            size="medium"
            label="Next question"
            onPress={() => {
              setFresh(null);
              setIndex(index + 1);
            }}
          />
        )}
      </ActionRow>
    </BlockFrame>
  );
}
