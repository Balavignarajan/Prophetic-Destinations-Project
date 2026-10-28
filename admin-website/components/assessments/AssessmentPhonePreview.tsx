'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { EditorState } from '../../lib/assessments';
import type { FixTab, FixTarget } from '../../lib/assessment-builder';
import { type PreviewIssue, type PreviewResult, buildPreview } from '../../lib/assessment-preview-scoring';
import { Choice } from '../lesson-preview/Choice';
import { PREVIEW_CSS, PREVIEW_THEME_NAMES, type PreviewTheme, ensurePreviewFonts, themeVars } from '../lesson-preview/theme';
import { Btn, Chevron, Notice, Txt } from '../lesson-preview/ui';
import { Modal } from '../ui';
import AssessmentPreviewFlow from './AssessmentPreviewFlow';
import { ScoringBreakdown } from './AssessmentPreviewResults';

/**
 * "Preview Assessment": the assessment as a learner meets it in the mobile app, in a phone-shaped frame, from the editor's WORKING COPY, including changes that are not saved yet (it reads the
 * editor's state; it never writes to it). The phone plays the app's own flow (AssessmentPreviewFlow), and when an attempt is finished the author can open a scoring breakdown beside it.
 *
 * PREVIEW ONLY, and labelled so: answers, the result and the breakdown live in this window's own state, so nothing is sent, no learner API is called, no progress or result is stored, nothing is
 * saved, approved or published, and the editor does not become "unsaved" because of anything done here. Closing it and opening it again starts a fresh attempt from the editor's content at that
 * moment; "Reset preview" starts a fresh attempt now. The result is SIMULATED with a copy of the backend's scoring (lib/assessment-preview-scoring.ts), never guessed.
 *
 * An incomplete working copy is not previewed. The phone says what is missing, each item with a button that closes the preview and takes the author to the tab and field to fix.
 */
const FIX_NAMES: Record<FixTab, string> = { overview: 'Overview', questions: 'Questions', scoring: 'Scoring' };
/** How many missing items are listed at once; the rest are counted. */
const SHOWN = 6;

function Readiness({ issues, onFix, onClose }: { issues: PreviewIssue[]; onFix: (target: FixTarget) => void; onClose: () => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? issues : issues.slice(0, SHOWN);
  return (
    <div className="flex flex-col gap-4" role="region" aria-label="What is missing before this assessment can be previewed">
      <Notice
        variant="missing"
        title="This assessment is not ready to preview"
        message={`${issues.length} ${issues.length === 1 ? 'thing needs' : 'things need'} attention. The preview never guesses or fills in a gap for you.`}
      />
      <ul className="flex flex-col gap-3">
        {shown.map((issue) => (
          <li key={issue.key} className="flex flex-col items-start gap-2 rounded-xl p-3" style={{ border: '1px solid var(--lp-subtle)', background: 'var(--lp-surface)' }}>
            <Txt v="body-small" tone="text">
              {issue.message}
            </Txt>
            <button type="button" className="lp-chip-btn" onClick={() => onFix(issue.target)}>
              Fix in {FIX_NAMES[issue.target.tab]}
              <Chevron dir="right" size={12} />
            </button>
          </li>
        ))}
      </ul>
      {issues.length > SHOWN && (
        <button type="button" className="lp-link self-start text-left" style={{ fontSize: 14, lineHeight: '21px' }} aria-expanded={all} onClick={() => setAll((value) => !value)}>
          {all ? 'Show fewer' : `Show all ${issues.length}`}
        </button>
      )}
      <Btn kind="secondary" size="md" onClick={onClose}>
        Back to editing
      </Btn>
    </div>
  );
}

export default function AssessmentPhonePreview({
  state,
  dirty,
  isNew,
  onClose,
  onFix,
}: {
  /** The editor's working copy (read only here). */
  state: EditorState;
  /** The working copy has edits that are not saved. */
  dirty: boolean;
  /** The assessment has not been created yet. */
  isNew: boolean;
  onClose: () => void;
  /** Close the preview and take the author to what needs fixing. */
  onFix: (target: FixTarget) => void;
}) {
  const [theme, setTheme] = useState<PreviewTheme>('dark');
  const [resets, setResets] = useState(0);
  const [result, setResult] = useState<PreviewResult | null>(null);
  // The plan is built from the working copy as it is now. The window covers the editor, so it cannot change while this is open.
  const plan = useMemo(() => buildPreview(state), [state]);

  useEffect(() => {
    ensurePreviewFonts();
  }, []);

  const reset = () => {
    setResult(null);
    setResets((count) => count + 1);
  };
  const onResult = useCallback((next: PreviewResult | null) => setResult(next), []);
  const title = plan.ok ? plan.assessment.title : state.title.trim() || 'New assessment';

  return (
    <Modal isOpen onClose={onClose} title="Preview Assessment" description="See how this assessment appears to learners in the mobile app." maxWidth="6xl">
      <div className="flex flex-col gap-6 md:flex-row">
        <aside aria-label="Preview controls" className="w-full shrink-0 space-y-5 md:w-64">
          <div className="space-y-1.5">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-950">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-600" />
              Working Copy Preview
            </p>
            <p className="text-xs text-slate-700">
              {isNew ? 'This assessment has not been saved yet.' : dirty ? 'Includes your unsaved changes.' : 'Matches the last saved version.'} Results here are <strong>simulated</strong> with the scoring rules the server uses.
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">Theme</p>
            <Choice label="Reading theme" value={theme} options={['dark', 'light'] as const} names={PREVIEW_THEME_NAMES} onChange={setTheme} />
            <p className="text-xs text-slate-600">Dark is the app&rsquo;s default. This only changes the preview.</p>
          </div>
          <div className="space-y-1.5">
            <button type="button" onClick={reset} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
              Reset preview
            </button>
            <p className="text-xs text-slate-600">Clears the answers and the result and starts again. Your assessment is not changed.</p>
          </div>
          <ul className="space-y-2 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-700">
            <li>
              <span className="font-semibold text-slate-900">Preview only.</span> Answers and results are not saved or sent, no learner is affected, and nothing is approved or published.
            </li>
            <li>
              <span className="font-semibold text-slate-900">Read-only.</span> Nothing you do here changes the assessment you are editing.
            </li>
          </ul>
          <button type="button" onClick={onClose} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            Back to editing
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col items-center gap-6 xl:flex-row xl:items-start xl:justify-center">
          <div className="h-[min(42rem,68dvh)] min-h-[26rem] w-full max-w-[24.5rem] shrink-0">
            <div className="h-full w-full rounded-[2.75rem] p-2.5" style={{ background: '#0B0E14', boxShadow: '0 28px 60px -12px rgba(0,0,0,.55), inset 0 0 0 1px #2B3140' }}>
              <style>{PREVIEW_CSS}</style>
              <div
                role="region"
                aria-label={`Preview of the assessment as it appears in the mobile app, ${theme} theme`}
                data-theme={theme}
                className="lp-root relative flex h-full flex-col overflow-hidden rounded-[2.1rem]"
                style={themeVars(theme)}
              >
                <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2" style={{ width: 96, height: 24, borderRadius: 12, background: '#05070B' }} />
                <div aria-hidden="true" className="shrink-0" style={{ height: 38 }} />
                {plan.ok ? (
                  <AssessmentPreviewFlow key={resets} assessment={plan.assessment} onResult={onResult} />
                ) : (
                  <>
                    <header className="shrink-0 px-6 pb-2">
                      <div className="flex items-center gap-1 pt-1">
                        <div className="flex min-w-0 flex-1 items-center" style={{ minHeight: 48 }}>
                          <Txt v="heading" as="h2" className="line-clamp-2">
                            {title}
                          </Txt>
                        </div>
                      </div>
                    </header>
                    <div tabIndex={0} role="group" aria-label="Assessment preview, scrollable" className="lp-scroll min-h-0 flex-1 overflow-y-auto">
                      <div className="px-6" style={{ paddingTop: 12, paddingBottom: 40 }}>
                        <Readiness issues={plan.issues} onFix={onFix} onClose={onClose} />
                      </div>
                    </div>
                  </>
                )}
                <div aria-hidden="true" className="pointer-events-none absolute bottom-1.5 left-1/2 z-10 -translate-x-1/2" style={{ width: 112, height: 4, borderRadius: 2, background: 'var(--lp-text)', opacity: 0.35 }} />
              </div>
            </div>
          </div>

          {result && (
            <div className="w-full min-w-0 max-w-[24.5rem] xl:max-w-none xl:flex-1">
              <ScoringBreakdown key={resets} result={result} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
