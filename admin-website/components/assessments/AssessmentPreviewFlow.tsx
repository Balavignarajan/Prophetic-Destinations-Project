'use client';

import React, { useEffect, useRef, useState } from 'react';
import { LEVEL_LABEL } from '../../lib/assessments';
import { type PreviewAnswers, type PreviewAssessment, type PreviewResult, checkBeforeSubmit, scorePreview, selectPreviewAnswer, toPreviewAnswers } from '../../lib/assessment-preview-scoring';
import { Btn, Chevron, Txt, cx } from '../lesson-preview/ui';
import { LearnerResult } from './AssessmentPreviewResults';

/**
 * The assessment as a learner meets it in the mobile app, played inside the phone: the welcome screen (title, instructions, how many questions, Start), one single-choice question at a time with its
 * progress, Previous / Next, "See my result", and the result screen. It follows mobile-app/src/screens/assessment-screen.tsx and the question and result views beside it, word for word where the app has
 * words, and invents no screen: the app has no timer, no right or wrong answer, no review step and no restart on the result, so the preview has none either.
 *
 * What the app does that depends on the server is replaced by the same rule run on the spot: pressing "See my result" scores the attempt with `scorePreview` (a copy of the backend's scoring) instead of
 * sending it. Nothing is stored, no learner API is called, and the answers live only in this component, so closing the preview or "Reset preview" (which remounts it) leaves nothing behind.
 * Not simulated: the leave-the-assessment confirmation, saving the chosen level and leaving the screen (the buttons say so), and the loading and offline states.
 */
type Phase = 'intro' | 'answering' | 'result';

function ScreenHeader({ title }: { title: string }) {
  return (
    <header className="shrink-0 px-6 pb-2">
      <div className="flex items-center gap-1 pt-1">
        <span aria-hidden="true" className="flex shrink-0 items-center justify-center" style={{ width: 48, height: 48 }}>
          <Chevron dir="left" size={16} tone="text" />
        </span>
        <div className="flex min-w-0 flex-1 items-center" style={{ minHeight: 48 }}>
          <Txt v="heading" as="h2" className="line-clamp-2">
            {title}
          </Txt>
        </div>
      </div>
    </header>
  );
}

/** One answer in the radio list: a real radio (so the arrow keys work), the chosen one shown by a gold border, a filled dot and bold text (never colour alone). */
function AnswerRow({ group, title, selected, onSelect }: { group: string; title: string; selected: boolean; onSelect: () => void }) {
  return (
    <label className={cx('lp-option', selected && 'lp-option-selected lp-option-emphasised')} style={{ cursor: 'pointer' }}>
      <input type="radio" name={group} className="sr-only" checked={selected} onChange={onSelect} aria-label={title} />
      <span className={cx('lp-radio', selected && 'lp-radio-on')} aria-hidden="true">
        {selected && <span className="lp-radio-dot" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col" aria-hidden="true">
        <Txt v="body" w={selected ? 7 : 5} as="span">
          {title}
        </Txt>
      </span>
    </label>
  );
}

export default function AssessmentPreviewFlow({ assessment, onResult }: { assessment: PreviewAssessment; onResult: (result: PreviewResult | null) => void }) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<PreviewAnswers>({});
  const [hint, setHint] = useState<string | null>(null);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [skipNote, setSkipNote] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);

  const total = assessment.questions.length;
  const required = assessment.requireAll;

  useEffect(() => {
    onResult(result);
  }, [result, onResult]);

  // A new question (or screen) starts at its top, so a long previous one never leaves the next scrolled out of sight.
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 });
  }, [phase, index]);

  const announcement = phase === 'answering' ? `Question ${index + 1} of ${total}` : phase === 'result' && result ? `Your result: ${LEVEL_LABEL[result.recommendedLevel]} is suggested.` : phase === 'intro' ? 'Assessment preview' : '';

  const goTo = (next: number) => {
    setHint(null);
    setIndex(Math.min(total - 1, Math.max(0, next)));
  };

  const submit = () => {
    const check = checkBeforeSubmit(assessment, answers);
    if (check.kind === 'open-question') {
      setHint(check.message);
      setIndex(check.goTo);
      return;
    }
    if (check.kind === 'no-answers') {
      setHint(check.message);
      return;
    }
    const outcome = scorePreview(assessment, toPreviewAnswers(assessment, answers));
    if (!outcome.ok) {
      setHint('The preview could not score these answers. Use Reset preview and try again.');
      return;
    }
    setHint(null);
    setResult(outcome.result);
    setPhase('result');
  };

  // ------------------------------------------------------------------------------------------------------------------ result
  if (phase === 'result' && result) {
    return (
      <>
        <p role="status" className="sr-only">
          {announcement}
        </p>
        <ScreenHeader title="Your result" />
        <div ref={scroll} tabIndex={0} role="group" aria-label="Assessment result, scrollable" className="lp-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="px-6" style={{ paddingTop: 12, paddingBottom: 40 }}>
            <LearnerResult result={result} />
          </div>
        </div>
      </>
    );
  }

  // ------------------------------------------------------------------------------------------------------------------ intro
  if (phase === 'intro') {
    return (
      <>
        <p role="status" className="sr-only">
          {announcement}
        </p>
        <ScreenHeader title="Assessment" />
        <div ref={scroll} tabIndex={0} role="group" aria-label="Assessment welcome, scrollable" className="lp-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-6 px-6" style={{ paddingTop: 12, paddingBottom: 40 }}>
            <div className="flex flex-col gap-2">
              <Txt v="body-small" tone="highlight" w={7}>
                Optional
              </Txt>
              <Txt v="section-heading" as="h3">
                {assessment.title}
              </Txt>
              {assessment.instructions && (
                <Txt v="body" tone="secondary" pre style={{ fontSize: 17, lineHeight: '27px' }}>
                  {assessment.instructions}
                </Txt>
              )}
            </div>
            <div className="lp-card flex flex-col gap-2" style={{ background: 'var(--lp-elevated)', boxShadow: 'var(--lp-shadow-card)' }}>
              <Txt v="body" w={6}>
                {total === 1 ? '1 question' : `${total} questions`}
              </Txt>
              <Txt v="body-small" tone="secondary">
                This is optional. It suggests a starting level; you stay free to choose any level, now or later.
                {required ? ' Every question needs an answer.' : ' You may skip questions you are unsure about.'}
              </Txt>
            </div>
            <div className="flex flex-col gap-3">
              <Btn kind="primary" size="lg" onClick={() => setPhase('answering')}>
                Start
              </Btn>
              <Btn kind="secondary" size="lg" onClick={() => setSkipNote(true)}>
                Skip and choose my level
              </Btn>
              {skipNote && (
                <Txt v="body-small" tone="muted" role="status">
                  Preview only. In the app this leaves the assessment and opens the level choice.
                </Txt>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ------------------------------------------------------------------------------------------------------------------ answering
  const question = assessment.questions[index];
  const isLast = index === total - 1;
  const answeredHere = answers[question.id] !== undefined;
  const percent = Math.round(((index + 1) / total) * 100);

  return (
    <>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <ScreenHeader title={assessment.title} />
      <div ref={scroll} tabIndex={0} role="group" aria-label="Assessment question, scrollable" className="lp-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 px-6" style={{ paddingTop: 12, paddingBottom: 24 }}>
          <div role="progressbar" aria-label={`Question ${index + 1} of ${total}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <Txt v="caption" tone="muted" className="mb-2">
              Question {index + 1} of {total}
            </Txt>
            <div className="lp-track" style={{ width: '100%' }}>
              <div className="lp-track-fill" style={{ width: `${percent}%`, background: 'var(--lp-highlight)' }} />
            </div>
          </div>
          <Txt v="body" w={6} as="h3" pre style={{ fontSize: 18, lineHeight: '27px' }}>
            {question.prompt}
          </Txt>
          <Txt v="body-small" tone="muted">
            {required ? 'Choose one answer to continue.' : 'Choose one answer, or skip this question.'}
          </Txt>
          <div className="flex flex-col gap-3" role="radiogroup" aria-label={`Answers to question ${index + 1}`}>
            {question.options.map((option) => (
              <AnswerRow
                key={option.id}
                group={`as-preview-q-${question.id}`}
                title={option.text}
                selected={answers[question.id] === option.id}
                onSelect={() => {
                  setHint(null);
                  setAnswers((previous) => selectPreviewAnswer(previous, question.id, option.id));
                }}
              />
            ))}
          </div>
          {hint && (
            <Txt v="body-small" tone="error" role="alert">
              {hint}
            </Txt>
          )}
        </div>
      </div>
      <div className="shrink-0 px-6" style={{ paddingTop: 12, paddingBottom: 28 }}>
        <div className="flex flex-wrap gap-3">
          <div style={{ flex: '1 1 7rem' }}>
            <Btn kind="secondary" size="md" className="w-full" disabled={index === 0} onClick={() => goTo(index - 1)}>
              Previous
            </Btn>
          </div>
          <div style={{ flex: '1.6 1 9rem' }}>
            {isLast ? (
              <Btn kind="primary" size="md" className="w-full" onClick={submit}>
                See my result
              </Btn>
            ) : (
              <Btn kind="primary" size="md" className="w-full" disabled={required && !answeredHere} onClick={() => goTo(index + 1)}>
                Next
              </Btn>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
