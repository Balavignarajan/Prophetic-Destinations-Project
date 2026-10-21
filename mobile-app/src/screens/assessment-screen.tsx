import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, ScrollView, View } from 'react-native';

import { ApiError, ConfigurationError, NetworkError, describeError } from '@/api/errors';
import { useResource } from '@/api/use-resource';
import { ActionRow, AppText, Card, ErrorState, LoadingState, PrimaryButton, ScreenContainer, ScreenHeader, SecondaryButton } from '@/components/ui';
import { type AnswerMap, answeredCount, selectAnswer, toSubmittedAnswers, unansweredIndexes } from '@/features/assessment/answers';
import { answerProblemCode, getActiveAssessment, isAssessmentUnavailable, isVersionNotFound, submitAssessment } from '@/features/assessment/assessment-api';
import type { PublicAssessment, SubmissionResult } from '@/features/assessment/assessment-types';
import { QuestionView } from '@/features/assessment/question-view';
import { ResultView } from '@/features/assessment/result-view';
import type { LearningLevel } from '@/learning/levels';
import { applyLearningLevel } from '@/learning/use-learning-level';
import { readLearningLevel, saveAssessmentResult } from '@/storage/preferences';
import { useTheme } from '@/theme';

type Phase = 'intro' | 'answering' | 'result';

/** Something the learner can act on after a failed submission. */
type SubmitProblem = { title: string; message: string; reload: boolean };

/**
 * The optional placement assessment. Loads the ACTIVE published assessment, lets the learner answer one single-choice question at a time (answers live only in
 * this screen's memory), sends them to the backend and shows the backend's recommendation. The app never scores. Nothing changes the learner's level except
 * the learner pressing "Use ... level" on the result. Everything can be skipped or left at any time.
 */
export function AssessmentScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const [assessment, reloadAssessment] = useResource<PublicAssessment>('assessment:active', (signal) => getActiveAssessment(signal));

  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<SubmitProblem | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [savedLevel, setSavedLevel] = useState<LearningLevel | null>(null);
  const submitInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    readLearningLevel().then((level) => {
      if (!cancelled) setSavedLevel(level);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A new question starts at its top, so a long previous question never leaves the next one scrolled out of sight.
  const questionScroll = useRef<ScrollView>(null);
  useEffect(() => {
    questionScroll.current?.scrollTo({ y: 0, animated: false });
  }, [index]);

  const data = assessment.status === 'success' ? assessment.data : null;
  // A different published version arriving (a reload) starts clean: answers belong to one exact version.
  const identity = data ? `${data.assessmentId}:${data.version}` : null;
  const [seenIdentity, setSeenIdentity] = useState<string | null>(null);
  useEffect(() => {
    if (identity !== null && identity !== seenIdentity) {
      setSeenIdentity(identity);
      setPhase('intro');
      setIndex(0);
      setAnswers({});
      setResult(null);
      setProblem(null);
      setHint(null);
    }
  }, [identity, seenIdentity]);

  /** Back to wherever the learner came from (Home or the welcome screen's next step). */
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const inProgress = phase === 'answering' && Object.keys(answers).length > 0;
  const confirmLeave = useCallback(() => {
    if (!inProgress) {
      leave();
      return;
    }
    Alert.alert('Leave the assessment?', 'Your answers so far will be discarded. You can take the assessment again whenever you like.', [
      { text: 'Keep answering', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: leave },
    ]);
  }, [inProgress, leave]);

  // Android's back button asks the same question while answers would be lost.
  useEffect(() => {
    if (!inProgress) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmLeave();
      return true;
    });
    return () => subscription.remove();
  }, [inProgress, confirmLeave]);

  const startOver = () => {
    setPhase('intro');
    setIndex(0);
    setAnswers({});
    setResult(null);
    setProblem(null);
    setHint(null);
    setSeenIdentity(null);
    reloadAssessment();
  };

  const chooseLevelInstead = () => router.replace('/learn');

  // ------------------------------------------------------------------------------------------------------------------ loading and failures
  if (assessment.status === 'loading') {
    return (
      <ScreenContainer>
        <ScreenHeader title="Assessment" onBack={leave} />
        <LoadingState message="Loading the assessment…" />
      </ScreenContainer>
    );
  }

  if (assessment.status === 'error') {
    if (isAssessmentUnavailable(assessment.error)) {
      // A normal state: nothing is published right now.
      return (
        <ScreenContainer>
          <ScreenHeader title="Assessment" onBack={leave} />
          <View style={{ flex: 1, justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.xl }}>
            <AppText variant="heading" align="center" accessibilityRole="header">
              The assessment is not available right now
            </AppText>
            <AppText variant="bodySmall" color="textSecondary" align="center">
              There is no assessment to take at the moment. You do not need one: you can choose your learning level yourself and change it at any time.
            </AppText>
            <PrimaryButton label="Choose my level" onPress={chooseLevelInstead} />
            <SecondaryButton label="Check again" onPress={reloadAssessment} />
          </View>
        </ScreenContainer>
      );
    }
    const offline = assessment.error instanceof NetworkError;
    const friendly = describeError(assessment.error);
    return (
      <ScreenContainer>
        <ScreenHeader title="Assessment" onBack={leave} />
        <ErrorState
          title={offline ? 'You appear to be offline' : friendly.title}
          message={offline ? 'The assessment needs an internet connection. You can choose your level yourself now and take the assessment later.' : friendly.message}
          onRetry={assessment.error instanceof ConfigurationError ? undefined : reloadAssessment}
        />
        <View style={{ paddingBottom: spacing.xl }}>
          <SecondaryButton label="Choose my level instead" onPress={chooseLevelInstead} />
        </View>
      </ScreenContainer>
    );
  }

  const current = assessment.data;
  const total = current.questions.length;

  // ------------------------------------------------------------------------------------------------------------------ result
  if (phase === 'result' && result) {
    return (
      <ScreenContainer scroll>
        <ScreenHeader title="Your result" onBack={leave} />
        <View style={{ paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
          <ResultView
            result={result}
            savedLevel={savedLevel}
            onApply={(level) => {
              // The learner's explicit choice: stored, and applied by every screen that shows the level. Lesson progress is untouched.
              applyLearningLevel(level);
              router.replace('/learn');
            }}
            onKeep={leave}
            onTakeCurrent={startOver}
          />
        </View>
      </ScreenContainer>
    );
  }

  // ------------------------------------------------------------------------------------------------------------------ intro
  if (phase === 'intro') {
    return (
      <ScreenContainer scroll>
        <ScreenHeader title="Assessment" onBack={leave} />
        <View style={{ gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
          <View style={{ gap: spacing.sm }}>
            <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700' }}>
              Optional
            </AppText>
            <AppText variant="sectionHeading" accessibilityRole="header">
              {current.title}
            </AppText>
            {current.instructions ? (
              <AppText variant="body" color="textSecondary" style={{ fontSize: 17, lineHeight: 27 }}>
                {current.instructions}
              </AppText>
            ) : null}
          </View>
          <Card variant="elevated" style={{ gap: spacing.sm }}>
            <AppText variant="body" style={{ fontWeight: '600' }}>
              {total === 1 ? '1 question' : `${total} questions`}
            </AppText>
            <AppText variant="bodySmall" color="textSecondary">
              This is optional. It suggests a starting level; you stay free to choose any level, now or later.
              {current.requireAllQuestions ? ' Every question needs an answer.' : ' You may skip questions you are unsure about.'}
            </AppText>
          </Card>
          <View style={{ gap: spacing.md }}>
            <PrimaryButton label="Start" onPress={() => setPhase('answering')} />
            <SecondaryButton label="Skip and choose my level" onPress={chooseLevelInstead} />
          </View>
        </View>
      </ScreenContainer>
    );
  }

  // ------------------------------------------------------------------------------------------------------------------ answering
  const question = current.questions[index];
  const isLast = index === total - 1;
  const required = current.requireAllQuestions;
  const answeredHere = answers[question.id] !== undefined;

  const goTo = (next: number) => {
    setHint(null);
    setProblem(null);
    setIndex(Math.min(total - 1, Math.max(0, next)));
  };

  const submit = async () => {
    if (submitInFlight.current) return;
    const missing = unansweredIndexes(current, answers);
    if (required && missing.length > 0) {
      setHint(`Please answer every question before you finish. ${missing.length === 1 ? 'One question is' : `${missing.length} questions are`} still open; the first is question ${missing[0] + 1}.`);
      setIndex(missing[0]);
      return;
    }
    if (answeredCount(current, answers) === 0) {
      setHint('Answer at least one question to get a recommendation.');
      return;
    }
    submitInFlight.current = true;
    setSubmitting(true);
    setHint(null);
    setProblem(null);
    try {
      const outcome = await submitAssessment(current.assessmentId, current.version, toSubmittedAnswers(current, answers));
      // Only now, with the backend's answer in hand, is anything shown or remembered. The remembered record never changes the level.
      void saveAssessmentResult({ assessmentId: outcome.assessmentId, version: outcome.version, recommendedLevel: outcome.recommendedLevel, completedAt: new Date().toISOString() });
      setResult(outcome);
      setPhase('result');
    } catch (error) {
      setProblem(describeSubmitProblem(error));
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <ScreenHeader title={current.title} onBack={confirmLeave} />
      <ScrollView ref={questionScroll} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
        <QuestionView
          question={question}
          index={index}
          total={total}
          required={required}
          selectedOptionId={answers[question.id]}
          onSelect={(optionId) => {
            setHint(null);
            setAnswers((previous) => selectAnswer(previous, question.id, optionId));
          }}
        />
        {hint ? (
          <AppText variant="bodySmall" color="error" accessibilityLiveRegion="polite" accessibilityRole="alert">
            {hint}
          </AppText>
        ) : null}
        {problem ? (
          <Card variant="outlined" style={{ gap: spacing.sm }}>
            <AppText variant="label" color="error" accessibilityRole="alert">
              {problem.title}
            </AppText>
            <AppText variant="bodySmall" color="textSecondary">
              {problem.message}
            </AppText>
            {problem.reload ? <SecondaryButton label="Load the current assessment" onPress={startOver} /> : null}
          </Card>
        ) : null}
      </ScrollView>

      <View style={{ gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.lg }}>
        <ActionRow>
          <SecondaryButton size="medium" label="Previous" disabled={index === 0 || submitting} onPress={() => goTo(index - 1)} />
          {isLast ? (
            <PrimaryButton size="medium" label="See my result" loading={submitting} onPress={() => void submit()} />
          ) : (
            <PrimaryButton size="medium" label="Next" disabled={(required && !answeredHere) || submitting} onPress={() => goTo(index + 1)} />
          )}
        </ActionRow>
        {isLast && problem && !problem.reload ? (
          <AppText variant="bodySmall" color="textMuted" align="center">
            Your answers are kept. Press the button again to retry.
          </AppText>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

/** Words for a failed submission. Answers always stay on the screen; the learner decides whether to retry or reload. */
function describeSubmitProblem(error: unknown): SubmitProblem {
  if (isVersionNotFound(error)) {
    return { title: 'This assessment is no longer available', message: 'It was replaced or withdrawn while you were answering, so your answers cannot be scored. Nothing was saved. You can load the current assessment.', reload: true };
  }
  const code = answerProblemCode(error);
  if (code === 'INVALID_ANSWER' || code === 'DUPLICATE_ANSWER') {
    return { title: 'Your answers no longer match', message: 'The assessment may have changed while you were answering. Nothing was saved. Load the current assessment and answer again.', reload: true };
  }
  if (code === 'MISSING_ANSWERS' || code === 'NO_ANSWERS') {
    return { title: 'Some answers are missing', message: error instanceof ApiError ? error.message : 'Please answer the open questions and try again.', reload: false };
  }
  if (error instanceof NetworkError) {
    return { title: 'Your answers were not sent', message: 'The server could not be reached, so there is no result yet. Check your connection and try again.', reload: false };
  }
  const friendly = describeError(error);
  return { title: friendly.title, message: `${friendly.message} Nothing was saved.`, reload: false };
}
