'use client';

import React, { useId, useState } from 'react';
import { ScriptureLinks } from './scripture';
import { Btn, Frame, Notice, Txt, asText, cx, isRecord } from './ui';

/**
 * A QUIZ block as the learner app draws it (mobile-app/src/learning/quiz-block.tsx): one question at a time with a progress bar, radio-style choices, "Check answer", feedback that appears only
 * after the answer is checked (the explanation, the author's feedback for the chosen choice and the question's Scripture), "View results" with the score, and a read-only review.
 * IN THE PREVIEW the quiz works the same way but is PREVIEW ONLY: the answers and the score live in this block's own state, nothing is stored or sent, no learner progress is written, and
 * resetting the preview, changing the level or closing it forgets them. Only SINGLE_CHOICE questions are supported; if any part cannot be shown the whole quiz is "not available".
 */
interface QuizOption {
  id: string;
  text: string;
  feedback: string | null;
}
interface QuizQuestion {
  id: string;
  prompt: string;
  explanation: string | null;
  correctOptionId: string;
  options: QuizOption[];
  scripture: unknown[];
}

/** The quiz, or null when any part of it cannot be shown (unsupported type, missing parts): never a partial quiz. */
function readQuiz(content: Record<string, unknown>): { title: string; description: string; questions: QuizQuestion[] } | null {
  const quiz = content.quiz;
  if (!isRecord(quiz) || !Array.isArray(quiz.questions) || quiz.questions.length === 0) return null;
  const questions: QuizQuestion[] = [];
  for (const raw of quiz.questions) {
    if (!isRecord(raw) || (raw.type !== undefined && raw.type !== 'SINGLE_CHOICE') || !Array.isArray(raw.options)) return null;
    const options = raw.options.filter(isRecord).map((o) => ({ id: asText(o.id), text: asText(o.text), feedback: asText(o.feedback) || null }));
    const correct = asText(raw.correctOptionId);
    if (!asText(raw.id) || !asText(raw.prompt) || options.length < 2 || options.length !== raw.options.length) return null;
    if (options.some((o) => !o.id || !o.text) || !options.some((o) => o.id === correct)) return null;
    questions.push({ id: asText(raw.id), prompt: asText(raw.prompt), explanation: asText(raw.explanation) || null, correctOptionId: correct, options, scripture: Array.isArray(raw.scripture) ? raw.scripture : [] });
  }
  return { title: asText(quiz.title), description: asText(quiz.description), questions };
}

/** "Question 2 of 5" with a segmented bar (a plain bar for long quizzes). Position within the quiz only: it says nothing about lesson completion. */
function QuestionProgress({ label, current, total }: { label: string; current: number; total: number }) {
  return (
    <div className="flex flex-col gap-2" role="progressbar" aria-label={label} aria-valuemin={1} aria-valuemax={total} aria-valuenow={current}>
      <Txt v="body-small" tone="secondary" w={6}>
        {label}
      </Txt>
      {total <= 10 ? (
        <div className="flex gap-1">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={cx('lp-seg', i < current && 'lp-seg-on')} />
          ))}
        </div>
      ) : (
        <div className="lp-track">
          <div className="lp-track-fill" style={{ width: `${(current / total) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

/** One choice in a radio-style list: a real radio (so arrow keys work), the selected state shown three ways (gold border, filled dot, bold text) and, after checking, in words too. */
function OptionRow({ group, title, selected, locked, outcome, onSelect }: { group: string; title: string; selected: boolean; locked: boolean; outcome?: 'correct' | 'incorrect'; onSelect: () => void }) {
  const spoken = outcome === 'correct' ? (selected ? 'Correct. Your answer' : 'Correct answer') : outcome === 'incorrect' ? 'Not correct. Your answer' : null;
  const outcomeText = spoken === null ? null : `${outcome === 'correct' ? '✓' : '✗'} ${spoken}`;
  const emphasised = selected || outcome !== undefined;
  return (
    <label className={cx('lp-option', selected && 'lp-option-selected', outcome === 'correct' && 'lp-option-correct', outcome === 'incorrect' && 'lp-option-incorrect', emphasised && 'lp-option-emphasised')} style={{ cursor: locked ? 'default' : 'pointer' }}>
      <input type="radio" name={group} className="sr-only" checked={selected} disabled={locked} onChange={onSelect} aria-label={`${title}${spoken ? `. ${spoken}` : ''}`} />
      <span className={cx('lp-radio', selected && 'lp-radio-on')} aria-hidden="true">
        {selected && <span className="lp-radio-dot" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5" aria-hidden="true">
        <Txt v="body" w={selected ? 7 : 5} as="span">
          {title}
        </Txt>
        {outcomeText && (
          <Txt v="body-small" tone={outcome === 'incorrect' ? 'error' : 'success'} w={7} as="span">
            {outcomeText}
          </Txt>
        )}
      </span>
    </label>
  );
}

/** The result of one checked question: a labelled card (never colour alone), the correct answer when missed, and the explanation, the chosen choice's feedback and the Scripture if there are any. */
function QuestionFeedback({ correct, answered, correctText, explanation, optionFeedback, scripture }: { correct: boolean; answered: boolean; correctText: string | undefined; explanation: string | null; optionFeedback: string | null; scripture: unknown[] }) {
  // The same sentence twice helps nobody: feedback that only repeats the general explanation is shown once.
  const feedback = optionFeedback && optionFeedback.trim() !== (explanation ?? '').trim() ? optionFeedback : null;
  return (
    <div className={cx('lp-feedback lp-rise', correct && 'lp-feedback-correct')} role="status">
      <div className="flex items-center gap-3">
        {answered && (
          <span className={cx('lp-mark', correct ? 'lp-c-success' : 'lp-c-warning')} aria-hidden="true">
            {correct ? '✓' : '✗'}
          </span>
        )}
        <Txt v="body" tone={correct ? 'success' : 'warning'} w={7}>
          {correct ? 'Correct' : answered ? 'Not quite' : 'Not answered'}
        </Txt>
      </div>
      {!correct && correctText && (
        <Txt v="body">
          <span className="lp-c-secondary">Correct answer: </span>
          {correctText}
        </Txt>
      )}
      {feedback && (
        <div className="flex flex-col gap-0.5">
          {explanation && (
            <Txt v="caption" tone="muted" w={6}>
              About your answer
            </Txt>
          )}
          <Txt v="body" tone="secondary" style={{ fontSize: 16, lineHeight: '25px' }} pre>
            {feedback}
          </Txt>
        </div>
      )}
      {explanation && (
        <div className="flex flex-col gap-0.5">
          {feedback && (
            <Txt v="caption" tone="muted" w={6}>
              Explanation
            </Txt>
          )}
          <Txt v="body" tone="secondary" style={{ fontSize: 16, lineHeight: '25px' }} pre>
            {explanation}
          </Txt>
        </div>
      )}
      <ScriptureLinks entries={scripture} presentation="inline" />
    </div>
  );
}

type Step = 'question' | 'results' | 'review';

export function QuizBlock({ content }: { content: Record<string, unknown> }) {
  const group = useId();
  const quiz = readQuiz(content);
  const [step, setStep] = useState<Step>('question');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checkedQuestions, setCheckedQuestions] = useState<Record<string, boolean>>({});
  const [reviewIndex, setReviewIndex] = useState(0);

  if (!quiz) {
    const onlyReference = typeof content.quizId === 'string' && !isRecord(content.quiz);
    return (
      <Notice
        title="Quiz not available"
        message={onlyReference ? 'This quiz block holds only a reference to a quiz, so its questions are not part of this preview. Open the quiz in the Quizzes section to see them.' : 'This lesson has a quiz that the app cannot show, so no score is given. The rest of the lesson is not affected.'}
      />
    );
  }

  const total = quiz.questions.length;
  const score = quiz.questions.filter((q) => answers[q.id] === q.correctOptionId).length;

  const restart = () => {
    setAnswers({});
    setCheckedQuestions({});
    setIndex(0);
    setReviewIndex(0);
    setStep('question');
  };

  const header = (
    <div className="flex flex-col gap-1">
      <Txt v="heading" as="h3">
        {quiz.title || 'Quiz'}
      </Txt>
      {quiz.description && step === 'question' && index === 0 && (
        <Txt v="body-small" tone="secondary" pre>
          {quiz.description}
        </Txt>
      )}
    </div>
  );

  if (step === 'results') {
    return (
      <Frame variant="interactive">
        {header}
        <div className="flex flex-col items-center gap-2 py-3 text-center" role="status">
          <Txt v="label" tone="highlight">
            Quiz complete
          </Txt>
          <p className="lp-c-highlight" style={{ fontFamily: 'var(--lp-display)', fontWeight: 700, fontSize: 44, lineHeight: '52px', letterSpacing: 2 }}>
            {score} / {total}
          </p>
          <Txt v="body" w={7}>
            {score} of {total} correct
          </Txt>
          <Txt v="body" tone="secondary">
            You&rsquo;ve completed this knowledge check.
          </Txt>
        </div>
        <Txt v="body-small" tone="muted">
          Preview only: this result is not saved and no learner progress is written.
        </Txt>
        <div className="flex flex-col gap-3">
          <Btn
            onClick={() => {
              setReviewIndex(0);
              setStep('review');
            }}
          >
            Review answers
          </Btn>
          <Btn kind="secondary" onClick={restart}>
            Try again
          </Btn>
        </div>
      </Frame>
    );
  }

  if (step === 'review') {
    const question = quiz.questions[reviewIndex];
    const chosen = answers[question.id];
    const correct = chosen === question.correctOptionId;
    const correctText = question.options.find((o) => o.id === question.correctOptionId)?.text;
    return (
      <Frame variant="interactive">
        {header}
        <QuestionProgress label={`Review: question ${reviewIndex + 1} of ${total}`} current={reviewIndex + 1} total={total} />
        <Txt v="body" w={6} style={{ fontSize: 18, lineHeight: '27px' }} as="h4" pre>
          {question.prompt}
        </Txt>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label={question.prompt}>
          {question.options.map((option) => (
            <OptionRow key={option.id} group={`${group}-review`} title={option.text} selected={chosen === option.id} locked onSelect={() => undefined} outcome={option.id === question.correctOptionId ? 'correct' : chosen === option.id ? 'incorrect' : undefined} />
          ))}
        </div>
        <QuestionFeedback key={question.id} correct={correct} answered={chosen !== undefined} correctText={correctText} explanation={question.explanation} optionFeedback={question.options.find((o) => o.id === chosen)?.feedback ?? null} scripture={question.scripture} />
        <div className="flex gap-3">
          <Btn kind="secondary" size="md" className="flex-1" disabled={reviewIndex === 0} onClick={() => setReviewIndex(reviewIndex - 1)}>
            Previous
          </Btn>
          <Btn kind="secondary" size="md" className="flex-1" disabled={reviewIndex === total - 1} onClick={() => setReviewIndex(reviewIndex + 1)}>
            Next
          </Btn>
        </div>
        <Btn onClick={() => setStep('results')}>Back to results</Btn>
      </Frame>
    );
  }

  const question = quiz.questions[Math.min(index, total - 1)];
  const chosen = answers[question.id];
  const isChecked = checkedQuestions[question.id] === true;
  const isLast = index === total - 1;
  const correct = chosen === question.correctOptionId;
  const correctText = question.options.find((o) => o.id === question.correctOptionId)?.text;

  return (
    <Frame variant="interactive">
      {header}
      <QuestionProgress label={`Question ${index + 1} of ${total}`} current={index + 1} total={total} />
      <Txt v="body" w={6} style={{ fontSize: 18, lineHeight: '27px' }} as="h4" pre>
        {question.prompt}
      </Txt>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label={question.prompt}>
        {question.options.map((option) => (
          <OptionRow
            key={option.id}
            group={`${group}-${question.id}`}
            title={option.text}
            selected={chosen === option.id}
            locked={isChecked}
            outcome={isChecked ? (option.id === question.correctOptionId ? 'correct' : chosen === option.id ? 'incorrect' : undefined) : undefined}
            onSelect={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))}
          />
        ))}
      </div>
      {isChecked && <QuestionFeedback key={question.id} correct={correct} answered={chosen !== undefined} correctText={correctText} explanation={question.explanation} optionFeedback={question.options.find((o) => o.id === chosen)?.feedback ?? null} scripture={question.scripture} />}
      <div className="flex gap-3">
        {index > 0 && (
          <Btn kind="secondary" size="md" onClick={() => setIndex(index - 1)}>
            Previous
          </Btn>
        )}
        {!isChecked ? (
          <Btn size="md" className="flex-1" disabled={chosen === undefined} onClick={() => setCheckedQuestions((current) => ({ ...current, [question.id]: true }))}>
            Check answer
          </Btn>
        ) : isLast ? (
          <Btn size="md" className="flex-1" onClick={() => setStep('results')}>
            View results
          </Btn>
        ) : (
          <Btn size="md" className="flex-1" onClick={() => setIndex(index + 1)}>
            Next question
          </Btn>
        )}
      </div>
    </Frame>
  );
}
