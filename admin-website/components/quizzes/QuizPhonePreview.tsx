'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { LEVEL_NAMES, LEVELS, type QuizDraft, previewPlan } from '../../lib/quiz-draft';
import { useScriptureInfo } from '../../lib/scripture-info';
import type { LearningLevel } from '../../lib/types';
import { Choice } from '../lesson-preview/Choice';
import { QuizBlock } from '../lesson-preview/quiz';
import { PREVIEW_CSS, PREVIEW_THEME_NAMES, type PreviewTheme, ensurePreviewFonts, themeVars } from '../lesson-preview/theme';
import { Btn, Chevron, Notice, PhoneContext, type PhoneContextValue, Txt } from '../lesson-preview/ui';
import { Modal } from '../ui';

/**
 * "Preview Quiz": the quiz as a learner meets it in the mobile app, in a phone-shaped frame, from the Quiz Builder's WORKING COPY (including changes that are not saved yet, in the working copy's
 * order). It plays the app's own quiz flow with the same component the Lesson Preview uses (components/lesson-preview/quiz.tsx, drawn from mobile-app/src/learning/quiz-block.tsx): one question at a
 * time with the progress bar, radio-style answers, "Check answer", the feedback card (correct answer, the answer's own feedback, the explanation and the Scripture), "View results" with the score
 * and the review. Only the questions enabled at the chosen learning level are given, as the app does.
 *
 * PREVIEW ONLY. Answers, checked questions and the score live in the phone's own state: nothing is sent, no learner progress or quiz result is written, nothing is published and the saved quiz is
 * not touched. "Reset preview" clears only the preview's answers; closing the preview leaves the builder's working copy exactly as it was. The learner quiz routes are never called, so an unsaved
 * or unpublished quiz can be tried. A question that is not complete is not guessed at: the preview names what is missing and waits.
 */
const OPTIONS_LEVEL: readonly LearningLevel[] = LEVELS;

export default function QuizPhonePreview({ draft, onClose }: { draft: QuizDraft; onClose: () => void }) {
  const [level, setLevel] = useState<LearningLevel>('BEGINNER');
  const [theme, setTheme] = useState<PreviewTheme>('dark');
  const [resets, setResets] = useState(0);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const scripture = useScriptureInfo();
  const plan = useMemo(() => previewPlan(draft, level), [draft, level]);

  useEffect(() => {
    ensurePreviewFonts();
  }, []);

  const context = useMemo<PhoneContextValue>(
    () => ({ host, width: 0, height: 0, bookNames: scripture.bookNames, level, lessonId: '', pushOverlay: () => () => undefined }),
    [host, scripture.bookNames, level],
  );
  const title = draft.title.trim() || 'Quiz';

  return (
    <Modal isOpen onClose={onClose} title="Preview Quiz" description="See how this quiz appears to learners in the mobile app." maxWidth="4xl">
      <div className="flex flex-col gap-6 md:flex-row">
        <aside aria-label="Preview controls" className="w-full shrink-0 space-y-5 md:w-64">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">Learning level</p>
            <Choice label="Learning level" value={level} options={OPTIONS_LEVEL} names={LEVEL_NAMES} onChange={setLevel} />
            <p className="text-xs text-slate-600">
              {plan.shown.length} of {draft.questions.length} {draft.questions.length === 1 ? 'question is' : 'questions are'} given at the {LEVEL_NAMES[level]} level.
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">Theme</p>
            <Choice label="Reading theme" value={theme} options={['dark', 'light'] as const} names={PREVIEW_THEME_NAMES} onChange={setTheme} />
            <p className="text-xs text-slate-600">Dark is the app&rsquo;s default. This only changes the preview.</p>
          </div>
          <div className="space-y-1.5">
            <button type="button" onClick={() => setResets((count) => count + 1)} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
              Reset preview
            </button>
            <p className="text-xs text-slate-600">Clears the answers and the score in the preview. Your quiz is not changed.</p>
          </div>
          <ul className="space-y-2 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-700">
            <li>
              <span className="font-semibold text-slate-900">Your working copy.</span> This shows the quiz as it is in the builder now, including changes you have not saved.
            </li>
            <li>
              <span className="font-semibold text-slate-900">Preview only.</span> Answers and results are not saved, nothing is published and no learner progress is written.
            </li>
          </ul>
          <button type="button" onClick={onClose} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            Back to editing
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 justify-center">
          <div className="h-[min(42rem,68dvh)] min-h-[26rem] w-full max-w-[24.5rem]">
            <PhoneContext.Provider value={context}>
              <div className="h-full w-full rounded-[2.75rem] p-2.5" style={{ background: '#0B0E14', boxShadow: '0 28px 60px -12px rgba(0,0,0,.55), inset 0 0 0 1px #2B3140' }}>
                <style>{PREVIEW_CSS}</style>
                <div
                  ref={setHost}
                  role="region"
                  aria-label={`Preview of the quiz as it appears in the mobile app, ${LEVEL_NAMES[level]} level, ${theme} theme`}
                  data-theme={theme}
                  className="lp-root relative flex h-full flex-col overflow-hidden rounded-[2.1rem]"
                  style={themeVars(theme)}
                >
                  <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2" style={{ width: 96, height: 24, borderRadius: 12, background: '#05070B' }} />
                  <div aria-hidden="true" className="shrink-0" style={{ height: 38 }} />
                  <header className="shrink-0 px-6 pb-2">
                    <div className="flex items-center gap-1 pt-1">
                      <span aria-hidden="true" className="flex shrink-0 items-center justify-center" style={{ width: 48, height: 48 }}>
                        <Chevron dir="left" size={16} tone="text" />
                      </span>
                      <div className="flex min-w-0 flex-1 items-center" style={{ minHeight: 48 }}>
                        <Txt v="body-small" w={6} as="h2" className="truncate">
                          {title}
                        </Txt>
                      </div>
                    </div>
                  </header>
                  <div tabIndex={0} role="group" aria-label="Quiz preview, scrollable" className="lp-scroll min-h-0 flex-1 overflow-y-auto" style={{ paddingTop: 12 }}>
                    <div key={`${level}:${resets}`} className="px-6" style={{ paddingBottom: 40 }}>
                      {plan.shown.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-10 text-center" role="status">
                          <Txt v="heading" as="h3">
                            No questions
                          </Txt>
                          <Txt v="body" tone="secondary">
                            No questions are available at this learning level.
                          </Txt>
                        </div>
                      ) : plan.problems.length > 0 || !plan.content ? (
                        <div className="flex flex-col gap-4" role="alert">
                          <Notice variant="missing" title="This quiz is not complete yet" message="Finish these in the Quiz Builder, then preview again. Nothing is guessed or filled in for you." />
                          <ul className="flex flex-col gap-2">
                            {plan.problems.map((problem) => (
                              <li key={problem} className="flex gap-2">
                                <span aria-hidden="true" className="lp-c-warning">
                                  •
                                </span>
                                <Txt v="body-small" tone="secondary">
                                  {problem}
                                </Txt>
                              </li>
                            ))}
                          </ul>
                          <Btn kind="secondary" size="md" onClick={onClose}>
                            Back to editing
                          </Btn>
                        </div>
                      ) : (
                        <QuizBlock content={plan.content} />
                      )}
                    </div>
                  </div>
                  <div aria-hidden="true" className="pointer-events-none absolute bottom-1.5 left-1/2 z-10 -translate-x-1/2" style={{ width: 112, height: 4, borderRadius: 2, background: 'var(--lp-text)', opacity: 0.35 }} />
                </div>
              </div>
            </PhoneContext.Provider>
          </div>
        </div>
      </div>
    </Modal>
  );
}
