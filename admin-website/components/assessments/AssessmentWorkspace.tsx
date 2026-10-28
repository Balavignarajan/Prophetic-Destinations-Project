'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { type FixTarget, targetForPath } from '../../lib/assessment-builder';
import { previewIssues } from '../../lib/assessment-preview-scoring';
import { type AssessmentDetail, checkEditor, fieldIdForPath, formatWhen } from '../../lib/assessments';
import { ConfirmDialog, StatusBadge } from '../ui';
import Icon from '../quizzes/icons';
import AssessmentOverviewTab from './AssessmentOverviewTab';
import AssessmentPhonePreview from './AssessmentPhonePreview';
import AssessmentPublishingTab from './AssessmentPublishingTab';
import AssessmentQuestionsTab from './AssessmentQuestionsTab';
import AssessmentScoringTab from './AssessmentScoringTab';
import { useAssessmentEditor } from './useAssessmentEditor';

/**
 * The assessment editor workspace (the new-assessment page and the assessment page both use it): a header with where the assessment stands, four tabs (Overview, Questions, Scoring, Publishing),
 * and a save bar. It is a layout and editing improvement only: what is saved, how, and every rule, role, workflow action and publishing check are the ones the assessment module already had.
 *
 * ONE WORKING COPY, FOUR VIEWS. The editing state lives here (useAssessmentEditor), not in the tabs, and every tab stays mounted, so switching tabs loses nothing: not unsaved edits, not the question
 * being edited, not what the Publishing tab has loaded. Nothing is saved until "Save Changes" succeeds (one call that replaces the whole working copy with the version it was loaded from; a stale
 * version is refused), and saving never publishes. The Publishing tab acts on the SAVED copy, so its actions are paused while there are unsaved edits. Leaving the page with unsaved edits is asked
 * about once, by the Admin's single guard.
 *
 * PREVIEW. "Preview Assessment" (header, Overview and Publishing; every role, new or saved) opens a phone-shaped window that plays the assessment as learners meet it, from the working copy as it is NOW,
 * unsaved edits included. It only reads the editor's state: it does not save, publish, send anything or make the editor "unsaved", and its "Fix in ..." buttons close it and take the author to the field.
 * Every confirmation in the workspace (discard, reload the latest, remove scoring, delete a question or answer, and the workflow actions) is the Admin's own dialog, never the browser's.
 */
type Tab = 'overview' | 'questions' | 'scoring' | 'publishing';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'questions', label: 'Questions' },
  { id: 'scoring', label: 'Scoring' },
  { id: 'publishing', label: 'Publishing' },
];

const BUTTON = 'rounded-lg px-4 py-2 text-sm font-medium focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50';
const SECONDARY = `${BUTTON} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`;
const PRIMARY = `${BUTTON} inline-flex items-center gap-2 bg-slate-900 text-white hover:bg-slate-800`;

const tabOf = (path: string | undefined): Tab => (path === 'title' || path === 'description' ? 'overview' : path && path.startsWith('scoringConfig') ? 'scoring' : 'questions');

export default function AssessmentWorkspace({
  detail,
  canWrite,
  message,
  onDismissMessage,
  onSaved,
  onReload,
  onDirtyChange,
  onCancelNew,
  onWorkflowChanged,
  onStale,
}: {
  /** null = a new assessment. */
  detail: AssessmentDetail | null;
  canWrite: boolean;
  message?: string | null;
  onDismissMessage?: () => void;
  /** Called only after the API confirmed the save. */
  onSaved: (detail: AssessmentDetail) => void;
  /** Reloads the saved assessment from the server (the editor then replaces its content with it). */
  onReload: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onCancelNew?: () => void;
  /** After the API confirmed a workflow transition (submit, approve, publish...). */
  onWorkflowChanged: (message: string) => void;
  /** The server refused a workflow action because the assessment changed (409). */
  onStale: () => void;
}) {
  const readOnly = !canWrite;
  const editor = useAssessmentEditor({ detail, readOnly, onSaved, onDirtyChange, onCancelNew });
  const [tab, setTab] = useState<Tab>('overview');
  const [discardOpen, setDiscardOpen] = useState(false);
  const [reloadOpen, setReloadOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const [focusQuestion, setFocusQuestion] = useState<{ index: number; nonce: number } | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const { state, dirty, saving } = editor;
  const found = editor.attempted ? checkEditor(state) : [];
  const tabHasProblem = (id: Tab) => found.some((p) => tabOf(p.path) === id);

  // Take the author to the field a problem names: open its tab and its question first, then focus the field once it is on screen.
  const goToTarget = (target: FixTarget) => {
    const nonce = Date.now();
    setTab(target.tab);
    if (target.questionIndex !== undefined) setFocusQuestion({ index: target.questionIndex, nonce });
    setFocusRequest({ id: target.fieldId, nonce });
  };
  const goTo = (path?: string) => {
    const target = targetForPath(path);
    if (target) goToTarget(target);
  };
  // "Fix in ..." from the preview: the window closes first, then the author lands on the field.
  const fixFromPreview = (target: FixTarget) => {
    setPreviewOpen(false);
    goToTarget(target);
  };
  // What the editor itself finds missing in the content as it is now (saved or not); the Publishing tab shows it beside the server's checks of the saved copy.
  const editorIssues = useMemo(() => previewIssues(state), [state]);
  // Reloading the saved version discards unsaved edits, so it asks first.
  const askReload = () => (dirty ? setReloadOpen(true) : onReload());
  useEffect(() => {
    if (!focusRequest) return;
    const timer = window.setTimeout(() => {
      const element = document.getElementById(focusRequest.id);
      if (!element) return;
      const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      element.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      element.focus({ preventScroll: true });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [focusRequest]);

  const onTabKeys = (event: React.KeyboardEvent, index: number) => {
    const count = TABS.length;
    const next = event.key === 'ArrowRight' ? (index + 1) % count : event.key === 'ArrowLeft' ? (index + count - 1) % count : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  const total = state.questions.length;
  const title = detail ? detail.title : state.title.trim() || 'New assessment';
  const active = detail?.activePublication ?? null;
  const askDiscard = () => (dirty ? setDiscardOpen(true) : editor.discard());

  return (
    <div className="space-y-5">
      <p role="status" aria-live="polite" className="sr-only">
        {editor.announce}
      </p>

      <header className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <Link href="/assessments" className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
              <span aria-hidden="true">&larr;</span> Back to Assessments
            </Link>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="font-serif text-2xl font-bold text-slate-900 wrap-break-word">{title}</h1>
              {detail ? <StatusBadge status={detail.status} /> : <span className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">New · not saved</span>}
              {dirty && !readOnly && (
                <span role="status" className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-950">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                  Unsaved changes
                </span>
              )}
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-700">
              {detail && (
                <div>
                  <dt className="inline font-semibold">Working copy: </dt>
                  <dd className="inline font-mono">v{detail.version}</dd>
                </div>
              )}
              <div>
                <dt className="inline font-semibold">Questions: </dt>
                <dd className="inline">
                  {total}
                  {detail && total !== detail.questions.length ? ' (unsaved)' : ''}
                </dd>
              </div>
              {detail && (
                <div>
                  <dt className="inline font-semibold">Updated: </dt>
                  <dd className="inline">{formatWhen(detail.updatedAt)}</dd>
                </div>
              )}
              <div>
                <dt className="inline font-semibold">Active for learners: </dt>
                <dd className="inline">{active ? `published version ${active.version}` : 'no'}</dd>
              </div>
            </dl>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button type="button" onClick={() => setPreviewOpen(true)} aria-haspopup="dialog" className={`${SECONDARY} inline-flex items-center gap-2`}>
              <Icon name="phone" />
              Preview Assessment
            </button>
            {!readOnly && (
              <>
                <button type="button" onClick={askDiscard} disabled={saving || (!dirty && !!detail)} className={SECONDARY}>
                  {detail ? 'Discard changes' : 'Cancel'}
                </button>
                <button type="button" onClick={() => void editor.save()} disabled={saving || (!!detail && !dirty)} aria-busy={saving} className={PRIMARY}>
                  {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none" aria-hidden="true" />}
                  {saving ? 'Saving…' : detail ? 'Save Changes' : 'Create Draft'}
                </button>
              </>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-700">
          {readOnly
            ? 'Your role can read but not change assessments.'
            : 'Changes stay on this page until you save, and saving never publishes. Learners receive an immutable published version; editing never changes it, and saving returns this copy to Draft.'}
        </p>
      </header>

      {message && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <span>{message}</span>
          <button type="button" onClick={onDismissMessage} aria-label="Dismiss message" className="rounded p-1 text-emerald-800 hover:bg-emerald-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            <Icon name="close" />
          </button>
        </div>
      )}

      {editor.serverMoved && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span>A newer version of this assessment was saved elsewhere. Your unsaved edits are still here; saving them will be refused until you reload.</span>
          <button type="button" onClick={askReload} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            Reload latest (discards my edits)
          </button>
        </div>
      )}

      <div role="tablist" aria-label="Assessment sections" className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t, index) => {
          const problem = tabHasProblem(t.id);
          return (
            <button
              key={t.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`as-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`as-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(event) => onTabKeys(event, index)}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium focus:outline-hidden focus-visible:rounded-t-lg focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 ${tab === t.id ? 'border-amber-600 text-slate-900' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}
            >
              {t.label}
              {t.id === 'questions' && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">{total}</span>}
              {problem && (
                <span className="inline-flex items-center rounded-full bg-rose-100 px-1.5 py-0.5 text-xs font-semibold text-rose-900">
                  <span aria-hidden="true">!</span>
                  <span className="sr-only">has problems to fix</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Every panel stays mounted (only the chosen one is shown), so nothing typed or opened is lost by switching tabs. */}
      <div role="tabpanel" id="as-panel-overview" aria-labelledby="as-tab-overview" hidden={tab !== 'overview'} tabIndex={0} className="focus:outline-hidden">
        <AssessmentOverviewTab editor={editor} detail={detail} readOnly={readOnly} issueCount={editorIssues.length} onPreview={() => setPreviewOpen(true)} onOpenTab={setTab} />
      </div>
      <div role="tabpanel" id="as-panel-questions" aria-labelledby="as-tab-questions" hidden={tab !== 'questions'} tabIndex={0} className="focus:outline-hidden">
        <AssessmentQuestionsTab editor={editor} readOnly={readOnly} focusQuestion={focusQuestion} />
      </div>
      <div role="tabpanel" id="as-panel-scoring" aria-labelledby="as-tab-scoring" hidden={tab !== 'scoring'} tabIndex={0} className="focus:outline-hidden">
        <AssessmentScoringTab editor={editor} detail={detail} readOnly={readOnly} />
      </div>
      <div role="tabpanel" id="as-panel-publishing" aria-labelledby="as-tab-publishing" hidden={tab !== 'publishing'} tabIndex={0} className="focus:outline-hidden">
        <AssessmentPublishingTab detail={detail} dirty={dirty} editorIssues={editorIssues} onChanged={onWorkflowChanged} onStale={onStale} onGoTo={goTo} onGoToTarget={goToTarget} onPreview={() => setPreviewOpen(true)} />
      </div>

      {!readOnly && (editor.saveError || editor.saved || dirty) && (
        <div className="sticky bottom-0 z-10 -mx-1 space-y-2 border-t border-slate-200 bg-slate-50/95 px-1 py-3 backdrop-blur">
          {editor.saveError && (
            <div role="alert" className="space-y-1.5 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
              <p>{editor.saveError}</p>
              {editor.problems.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5">
                  {editor.problems.map((p, i) => (
                    <li key={`${p.code}-${p.path ?? i}-${i}`}>
                      {fieldIdForPath(p.path) ? (
                        <button type="button" onClick={() => goTo(p.path)} className="text-left underline">
                          {p.message}
                        </button>
                      ) : (
                        p.message
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {editor.saveConflict && (
                <button type="button" onClick={askReload} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                  Reload latest (discards my edits)
                </button>
              )}
            </div>
          )}
          {editor.saved && !dirty && (
            <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              {editor.saved}
            </p>
          )}
          {dirty && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <span className="text-xs font-medium text-amber-900">Unsaved changes</span>
              {detail && detail.status !== 'DRAFT' && <span className="text-xs text-slate-700">Saving returns this assessment to Draft. Learners keep the published version until a new one is approved and published.</span>}
              <button type="button" onClick={askDiscard} disabled={saving} className={SECONDARY}>
                {detail ? 'Discard changes' : 'Cancel'}
              </button>
              <button type="button" onClick={() => void editor.save()} disabled={saving} aria-busy={saving} className={PRIMARY}>
                {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none" aria-hidden="true" />}
                {saving ? 'Saving…' : detail ? 'Save Changes' : 'Create Draft'}
              </button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={discardOpen}
        onClose={() => setDiscardOpen(false)}
        onConfirm={() => {
          setDiscardOpen(false);
          editor.discard();
        }}
        title="Discard unsaved changes?"
        message={detail ? 'Your unsaved edits to this assessment will be lost. The saved assessment stays as it is.' : 'Your unsaved edits will be lost. Nothing has been created.'}
        confirmLabel="Discard Changes"
        cancelLabel="Keep Editing"
        isDestructive
        safeFocus
      />
      <ConfirmDialog
        isOpen={reloadOpen}
        onClose={() => setReloadOpen(false)}
        onConfirm={() => {
          setReloadOpen(false);
          onReload();
        }}
        title="Reload the latest saved version?"
        message="Your unsaved edits to this assessment will be discarded and replaced by the latest saved version. This cannot be undone."
        confirmLabel="Reload and discard my edits"
        cancelLabel="Keep my edits"
        isDestructive
        safeFocus
      />
      <ConfirmDialog
        isOpen={editor.confirmClearScoring}
        onClose={editor.cancelClearScoring}
        onConfirm={() => {
          editor.cancelClearScoring();
          void editor.save(true);
        }}
        title="Remove the scoring configuration?"
        message="You switched scoring off. Saving removes the saved scoring configuration (tie-break, required-questions setting and result messages), and the assessment cannot be published until a valid configuration is set again. The points on the answers are kept."
        confirmLabel="Save without scoring"
        isDestructive
        safeFocus
      />

      {previewOpen && <AssessmentPhonePreview state={state} dirty={dirty} isNew={!detail} onClose={() => setPreviewOpen(false)} onFix={fixFromPreview} />}
    </div>
  );
}
