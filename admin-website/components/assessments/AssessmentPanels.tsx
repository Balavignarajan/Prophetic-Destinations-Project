'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FixTarget } from '../../lib/assessment-builder';
import type { PreviewIssue } from '../../lib/assessment-preview-scoring';
import {
  ACTION_LABEL,
  ACTION_WHO,
  type AssessmentAction,
  type AssessmentDetail,
  type AssessmentStatus,
  type AssessmentSummary,
  type Problem,
  type Publication,
  STATUS_LABEL,
  type ValidationReport,
  type WorkflowEvent,
  assessmentsApi,
  describeError,
  fieldIdForPath,
  formatWhen,
  isConflict,
  problemsFromError,
} from '../../lib/assessments';
import { Modal } from '../ui';
import Icon from '../quizzes/icons';
import AssessmentWorkflowSteps from './AssessmentWorkflowSteps';

const SMALL_BTN = 'px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';
const CARD = 'bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs';
const short = (id: string) => id.slice(0, 8);
const statusName = (status: string) => STATUS_LABEL[status as AssessmentStatus] ?? status;
/** How many of the editor's own findings are listed at once; the rest are counted. */
const EDITOR_SHOWN = 8;

// ============================================================================================================================ validation

interface ValidationProps {
  assessmentId: string;
  /** Changes whenever the saved assessment changed, so the report is fetched again. */
  refreshKey: string;
  /** Unsaved edits exist: the server's report covers the SAVED copy only. */
  dirty: boolean;
  /** What the editor itself finds missing in the content as it is now (including unsaved edits). Not the server's opinion. */
  editorIssues: PreviewIssue[];
  onGoTo: (path?: string) => void;
  onGoToTarget: (target: FixTarget) => void;
}

/**
 * Publishing readiness. Two different things are kept apart and labelled: the SERVER's publishing checks of the SAVED working copy (the report the backend would apply when publishing, which stays the
 * authority) and, only when the editor holds unsaved edits, what the EDITOR finds in that unsaved content (the same rules run in the browser, so an author can fix things before saving). The status says
 * Ready or Needs attention with the number of blocking issues; each issue that has a place in the editor has a "Go to issue" button; warnings never block.
 */
export function ValidationPanel({ assessmentId, refreshKey, dirty, editorIssues, onGoTo, onGoToTarget }: ValidationProps) {
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const run = useRef(0);

  const load = useCallback(async () => {
    const mine = ++run.current;
    setLoading(true);
    setError(null);
    try {
      const next = await assessmentsApi.validate(assessmentId);
      if (mine === run.current) setReport(next);
    } catch (err: unknown) {
      if (mine === run.current) setError(describeError(err, 'The validation report could not be loaded.'));
    } finally {
      if (mine === run.current) setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const item = (p: Problem, i: number, tone: 'problem' | 'warning') => (
    <li key={`${p.code}-${p.path ?? ''}-${i}`} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-sm">
      <span className="min-w-0 flex-1">
        <span className={tone === 'problem' ? 'text-rose-950' : 'text-amber-950'}>{p.message}</span>
        <span className="block font-mono text-[11px] text-slate-600">
          {p.code}
          {p.path ? ` · ${p.path}` : ''}
        </span>
      </span>
      {fieldIdForPath(p.path) && (
        <button type="button" onClick={() => onGoTo(p.path)} className={SMALL_BTN}>
          Go to issue
        </button>
      )}
    </li>
  );

  const blocking = report ? report.problems.length : 0;
  const shownEditor = editorIssues.slice(0, EDITOR_SHOWN);

  return (
    <section aria-labelledby="as-validation-h" className={CARD} aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="as-validation-h" className="font-serif text-lg font-bold text-slate-900">
          Publishing readiness
        </h2>
        <button type="button" className={SMALL_BTN} onClick={() => void load()} disabled={loading}>
          {loading ? 'Checking…' : 'Check again'}
        </button>
      </div>

      <div role="status" aria-live="polite">
        {error ? null : !report ? (
          <p className="text-sm text-slate-700">Running the checks…</p>
        ) : report.valid ? (
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-900">
            <Icon name="check" className="h-4 w-4" />
            Ready{dirty ? ' (saved version)' : ''}
          </p>
        ) : (
          <p className="inline-flex items-center gap-2 rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-900">
            <Icon name="alert" className="h-4 w-4" />
            Needs attention · {blocking} blocking {blocking === 1 ? 'issue' : 'issues'}
            {dirty ? ' (saved version)' : ''}
          </p>
        )}
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-lg border border-rose-300 bg-rose-50 text-sm text-rose-900">
          {error} This is not the same as &ldquo;no problems&rdquo;.{' '}
          <button type="button" className="underline" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}

      {report && (
        <>
          <p className="text-xs text-slate-700">
            <strong>Server checks of the saved version.</strong> {report.valid ? 'The saved assessment meets the publishing checks. It still needs approval before it can be published.' : 'The assessment cannot be published until these are fixed.'}
          </p>
          {!report.valid && <ul className="space-y-2.5 rounded-lg border border-rose-200 bg-rose-50/60 p-3">{report.problems.map((p, i) => item(p, i, 'problem'))}</ul>}
          {report.warnings.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-semibold text-amber-950">
                {report.warnings.length} {report.warnings.length === 1 ? 'warning' : 'warnings'} (they do not block publishing)
              </p>
              <ul className="space-y-2.5 rounded-lg border border-amber-200 bg-amber-50/60 p-3">{report.warnings.map((p, i) => item(p, i, 'warning'))}</ul>
            </div>
          )}
        </>
      )}

      {dirty && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3">
          <p className="text-sm font-semibold text-amber-950">Your unsaved edits</p>
          <p className="text-xs text-slate-800">The server cannot see these yet. This is the editor&rsquo;s own check of the content as it is now; save to have the server check it.</p>
          {editorIssues.length === 0 ? (
            <p className="text-sm text-slate-900">The editor finds nothing missing in your unsaved content.</p>
          ) : (
            <>
              <p className="text-sm font-medium text-rose-950">
                {editorIssues.length} {editorIssues.length === 1 ? 'thing needs' : 'things need'} attention in the editor
              </p>
              <ul className="space-y-2">
                {shownEditor.map((issue) => (
                  <li key={issue.key} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-sm text-slate-900">
                    <span className="min-w-0 flex-1">{issue.message}</span>
                    <button type="button" onClick={() => onGoToTarget(issue.target)} className={SMALL_BTN}>
                      Go to issue
                    </button>
                  </li>
                ))}
              </ul>
              {editorIssues.length > shownEditor.length && <p className="text-xs text-slate-700">and {editorIssues.length - shownEditor.length} more. Fix these and the rest will show.</p>}
            </>
          )}
        </div>
      )}

      <p className="text-xs text-slate-700">The server decides again at the moment of publishing; this list is guidance.</p>
    </section>
  );
}

// ============================================================================================================================ workflow

const TITLE: Record<AssessmentAction, string> = {
  SUBMIT_FOR_REVIEW: 'Submit for review?',
  REQUEST_CHANGES: 'Request changes?',
  APPROVE: 'Approve this assessment?',
  PUBLISH: 'Publish this assessment?',
  UNPUBLISH: 'Unpublish this assessment?',
};

const EXPLANATION: Record<AssessmentAction, string> = {
  SUBMIT_FOR_REVIEW: 'Sends the saved assessment to a reviewer. Editing it afterwards returns it to Draft and cancels the review.',
  REQUEST_CHANGES: 'Sends the assessment back to Draft with your note, so the author knows what to change.',
  APPROVE: 'Marks the saved assessment as approved. Approving does not publish it; any later edit returns it to Draft and the approval is lost.',
  PUBLISH: 'Publishes the saved, approved assessment as a new, immutable published version.',
  UNPUBLISH: 'Withdraws this assessment from learners.',
};

const BRIEF: Record<AssessmentAction, string> = {
  SUBMIT_FOR_REVIEW: 'Send the saved assessment to a reviewer.',
  REQUEST_CHANGES: 'Send it back to Draft with a note.',
  APPROVE: 'Mark the saved assessment as approved. It is not published yet.',
  PUBLISH: 'Make the approved assessment the one learners receive.',
  UNPUBLISH: 'Stop learners receiving this assessment.',
};

/** What comes next from each status, for the explanation above the buttons. Which of these the signed-in role may do is the server's `allowedActions`. */
const NEXT: Record<AssessmentStatus, { title: string; text: string; actions: AssessmentAction[] }> = {
  DRAFT: { title: 'Submit for review', text: 'When the saved assessment is ready, send it to a reviewer.', actions: ['SUBMIT_FOR_REVIEW'] },
  READY_FOR_REVIEW: { title: 'Approve, or request changes', text: 'A reviewer checks the saved assessment, then approves it or sends it back to Draft with a note.', actions: ['APPROVE', 'REQUEST_CHANGES'] },
  APPROVED: { title: 'Publish', text: 'Publishing makes the saved, approved assessment the one learners receive. Only an Approved assessment can be published, for every role.', actions: ['PUBLISH'] },
  PUBLISHED: { title: 'Nothing more to do', text: 'This working copy is published. Editing it returns it to Draft; it then needs review and approval again before a new version can be published.', actions: [] },
};

const FORWARD: AssessmentAction[] = ['SUBMIT_FOR_REVIEW', 'APPROVE', 'PUBLISH'];

interface WorkflowProps {
  detail: AssessmentDetail;
  /** The editor holds unsaved edits: actions would act on the saved copy, not on them, so they are paused. */
  dirty: boolean;
  /** Called after the API confirmed a transition. */
  onChanged: (message: string) => void;
  /** Called when the server refused because the assessment changed since this page loaded (409): the page reloads it. */
  onStale: () => void;
}

export function WorkflowPanel({ detail, dirty, onChanged, onStale }: WorkflowProps) {
  const [action, setAction] = useState<AssessmentAction | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [replacing, setReplacing] = useState<AssessmentSummary | null | undefined>(undefined);
  const [done, setDone] = useState<string | null>(null);

  const open = async (next: AssessmentAction) => {
    setAction(next);
    setNote('');
    setError(null);
    setProblems([]);
    setReport(null);
    setReplacing(undefined);
    setDone(null);
    if (next === 'PUBLISH') {
      // Validate again right before publishing, and find out which active assessment this will replace.
      setChecking(true);
      try {
        const [r, list] = await Promise.all([
          assessmentsApi.validate(detail.id),
          assessmentsApi.list({ limit: 100 }).catch(() => null),
        ]);
        setReport(r);
        setReplacing(list ? (list.items.find((a) => a.id !== detail.id && a.activePublishedVersion !== null) ?? null) : undefined);
      } catch (err: unknown) {
        setError(describeError(err, 'The publishing checks could not be run, so the assessment was not published.'));
      } finally {
        setChecking(false);
      }
    }
  };

  const close = () => {
    if (!busy) setAction(null);
  };

  const confirm = async () => {
    if (!action || busy) return;
    if (action === 'REQUEST_CHANGES' && !note.trim()) {
      setError('Say what needs to change: a note is required.');
      return;
    }
    setBusy(true);
    setError(null);
    setProblems([]);
    try {
      const body = { ...(action === 'REQUEST_CHANGES' || note.trim() ? { note: note.trim() } : {}), expectedVersion: detail.version };
      const result = await assessmentsApi.perform(detail.id, action, body);
      const text =
        action === 'PUBLISH'
          ? `Published as version ${result.publication?.version ?? ''}. It is now the assessment mobile learners receive.`
          : action === 'UNPUBLISH'
            ? 'Unpublished. Learners no longer receive this assessment.'
            : `${ACTION_LABEL[action]}: done. Status is now ${statusName(result.status)}.`;
      setAction(null);
      setDone(text);
      onChanged(text);
    } catch (err: unknown) {
      // Nothing was changed; the note stays. A publish that fails validation lists the server's problems.
      if (isConflict(err)) {
        // The assessment moved (another save, or another transition): nothing was changed here. Reload it so the next try uses the current version and status.
        setError(describeError(err, 'This assessment changed.') + ' Nothing was changed. The page has been refreshed; check the assessment and try again if the action still applies.');
        onStale();
      } else {
        setError(describeError(err, 'This action could not be completed.'));
        setProblems(problemsFromError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const actions = detail.allowedActions;
  const blocked = action === 'PUBLISH' && (checking || !report || !report.valid);
  const next = NEXT[detail.status];
  const canNext = next.actions.some((a) => actions.includes(a));
  const who = Array.from(new Set(next.actions.map((a) => ACTION_WHO[a]))).join(' · ');
  const forward = actions.filter((a) => FORWARD.includes(a));
  const other = actions.filter((a) => !FORWARD.includes(a));
  const paused = dirty || action !== null;

  const button = (a: AssessmentAction) => (
    <li key={a} className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={paused}
        onClick={() => void open(a)}
        className={`rounded-lg px-3.5 py-2 text-sm font-semibold focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:opacity-40 ${
          FORWARD.includes(a) ? 'bg-slate-900 text-white hover:bg-slate-800' : a === 'UNPUBLISH' ? 'border border-rose-300 bg-white text-rose-900 hover:bg-rose-50' : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
        }`}
      >
        {ACTION_LABEL[a]}
      </button>
      <span className="text-xs text-slate-700">
        {BRIEF[a]} <span className="text-slate-600">({ACTION_WHO[a]})</span>
      </span>
    </li>
  );

  return (
    <section aria-labelledby="as-workflow-h" className={CARD}>
      <h2 id="as-workflow-h" className="font-serif text-lg font-bold text-slate-900">
        Review and publishing
      </h2>
      <AssessmentWorkflowSteps status={detail.status} />
      <p className="text-xs text-slate-700">
        The working copy moves one step at a time; <strong>only an Approved assessment can be published</strong>, for every role. Request changes sends a Ready for Review assessment back to Draft, and editing at any stage returns it to Draft. Saving never approves or publishes.
      </p>

      <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm font-semibold text-slate-900">
          Next step: {next.title}
          {who && next.actions.length > 0 && <span className="font-normal text-slate-700"> · {who}</span>}
        </p>
        <p className="text-sm text-slate-800">{next.text}</p>
        {next.actions.length > 0 && !canNext && <p className="text-sm font-medium text-slate-900">Your role cannot do this step; it is for: {who}.</p>}
      </div>

      {dirty && (
        <p role="note" className="text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-950 p-2.5">
          You have unsaved changes. Save or discard them first: these actions apply to the saved assessment, not to your unsaved edits.
        </p>
      )}

      {actions.length === 0 ? (
        <p className="text-sm text-slate-700">No action is available to your role in this status.</p>
      ) : (
        <div className="space-y-3">
          {forward.length > 0 && <ul className="grid gap-3 sm:grid-cols-2">{forward.map(button)}</ul>}
          {other.length > 0 && <ul className="grid gap-3 sm:grid-cols-2">{other.map(button)}</ul>}
          {actions.includes('PUBLISH') && <p className="text-xs text-slate-700">Publishing replaces the assessment learners receive now. The version being replaced stays on record, unchanged.</p>}
        </div>
      )}

      <p role="status" aria-live="polite" className={done ? 'rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900' : 'sr-only'}>
        {done}
      </p>

      <Modal isOpen={action !== null} onClose={close} title={action ? TITLE[action] : ''} maxWidth="lg">
        {action && (
          <div className="space-y-4">
            {error && (
              <div role="alert" className="p-3 rounded-lg border border-rose-300 bg-rose-50 text-sm text-rose-900 space-y-1">
                <p>{error}</p>
                {problems.length > 0 && (
                  <ul className="list-disc pl-5">
                    {problems.map((p, i) => (
                      <li key={`${p.code}-${i}`}>{p.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <p className="text-sm text-slate-800">{EXPLANATION[action]}</p>

            {action === 'PUBLISH' && (
              <div className="space-y-2 text-sm text-slate-800">
                <p>
                  <strong>This activates the assessment for mobile learners</strong> as published version {(detail.latestPublishedVersion ?? 0) + 1}, using the saved content shown on this page. Only one assessment is active at a time, so it{' '}
                  <strong>replaces the assessment that is active now</strong>
                  {replacing ? (
                    <>
                      {' '}
                      (&ldquo;{replacing.title}&rdquo;, version {replacing.activePublishedVersion}), which is withdrawn and returns to Approved
                    </>
                  ) : replacing === null ? (
                    <> (none is active right now)</>
                  ) : (
                    <> (if there is one; it could not be looked up)</>
                  )}
                  .{detail.activePublication && <> Its own previous version {detail.activePublication.version} is replaced.</>} Every version already published stays on record, unchanged.
                </p>
                {checking && <p role="status">Running the publishing checks…</p>}
                {report && !report.valid && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                    <p className="font-semibold text-rose-900 mb-1">It cannot be published yet:</p>
                    <ul className="list-disc pl-5 text-rose-900">
                      {report.problems.map((p, i) => (
                        <li key={`${p.code}-${i}`}>{p.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {report && report.valid && report.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="font-semibold text-amber-900 mb-1">Warnings (they do not block publishing):</p>
                    <ul className="list-disc pl-5 text-amber-900">
                      {report.warnings.map((p, i) => (
                        <li key={`${p.code}-${i}`}>{p.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {action === 'UNPUBLISH' && (
              <p className="text-sm text-slate-800">
                <strong>Mobile learners will receive no assessment</strong> until one is published again. Published versions are kept; only this one stops being active.
              </p>
            )}

            {(action === 'REQUEST_CHANGES' || action === 'APPROVE' || action === 'SUBMIT_FOR_REVIEW') && (
              <div>
                <label htmlFor="as-wf-note" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                  Note {action === 'REQUEST_CHANGES' ? '*' : '(optional)'}
                </label>
                <textarea
                  id="as-wf-note"
                  rows={3}
                  maxLength={2000}
                  value={note}
                  disabled={busy}
                  data-autofocus=""
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/40"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={close}
                disabled={busy}
                data-autofocus={action === 'PUBLISH' || action === 'UNPUBLISH' ? '' : undefined}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={busy || blocked || (action === 'REQUEST_CHANGES' && !note.trim())}
                aria-busy={busy}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg flex items-center gap-2 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${action === 'UNPUBLISH' ? 'bg-rose-700 hover:bg-rose-800' : 'bg-slate-900 hover:bg-slate-800'}`}
              >
                {busy && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {busy ? 'Working…' : ACTION_LABEL[action]}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

// ============================================================================================================================ history

/** Every version this assessment has been published as. Real records only: the version, when it was published, whether it is still the active one or was replaced / withdrawn, and who published it. */
export function PublicationHistory({ assessmentId, refreshKey }: { assessmentId: string; refreshKey: string }) {
  const [items, setItems] = useState<Publication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    assessmentsApi
      .publications(assessmentId)
      .then((r) => !cancelled && setItems(r.items))
      .catch((err: unknown) => !cancelled && setError(describeError(err, 'The publication history could not be loaded.')));
    return () => {
      cancelled = true;
    };
  }, [assessmentId, refreshKey, reload]);

  return (
    <section aria-labelledby="as-pub-h" className={CARD}>
      <h2 id="as-pub-h" className="font-serif text-lg font-bold text-slate-900">
        Published versions
      </h2>
      <p className="text-xs text-slate-700">
        Each published version is <strong>immutable</strong>: later edits to the working copy never change it, and answers are always scored against the exact version the app received. This list shows when each was published; the content of an older version is not shown here.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-rose-900">
          {error}{' '}
          <button type="button" className="underline" onClick={() => setReload((n) => n + 1)}>
            Try again
          </button>
        </p>
      ) : items === null ? (
        <p className="text-sm text-slate-700">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-700">This assessment has never been published.</p>
      ) : (
        <ul className="space-y-2" aria-label="Published versions, newest first">
          {items.map((p) => (
            <li key={p.id} className={`rounded-lg border p-3 ${p.active ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-sm font-semibold text-slate-900">Published version {p.version}</p>
                {p.active ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-2 py-0.5 text-xs font-semibold text-emerald-800">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                    Active
                  </span>
                ) : (
                  <span className="rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">{p.endedReason === 'UNPUBLISHED' ? 'Unpublished' : 'Superseded'}</span>
                )}
              </div>
              <dl className="mt-1.5 grid gap-x-6 gap-y-0.5 text-xs text-slate-700 sm:grid-cols-2">
                <div>
                  <dt className="inline font-semibold">Published: </dt>
                  <dd className="inline">{formatWhen(p.publishedAt)}</dd>
                </div>
                {!p.active && (
                  <div>
                    <dt className="inline font-semibold">{p.endedReason === 'UNPUBLISHED' ? 'Withdrawn: ' : 'Replaced: '}</dt>
                    <dd className="inline">{formatWhen(p.endedAt)}</dd>
                  </div>
                )}
                <div>
                  <dt className="inline font-semibold">Published by: </dt>
                  <dd className="inline font-mono" title={p.publishedBy}>
                    {short(p.publishedBy)}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function EventHistory({ assessmentId, refreshKey }: { assessmentId: string; refreshKey: string }) {
  const [items, setItems] = useState<WorkflowEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    assessmentsApi
      .events(assessmentId)
      .then((r) => !cancelled && setItems(r.items))
      .catch((err: unknown) => !cancelled && setError(describeError(err, 'The workflow history could not be loaded.')));
    return () => {
      cancelled = true;
    };
  }, [assessmentId, refreshKey, reload]);

  return (
    <section aria-labelledby="as-events-h" className={CARD}>
      <h2 id="as-events-h" className="font-serif text-lg font-bold text-slate-900">
        Workflow history
      </h2>
      {error ? (
        <p role="alert" className="text-sm text-rose-900">
          {error}{' '}
          <button type="button" className="underline" onClick={() => setReload((n) => n + 1)}>
            Try again
          </button>
        </p>
      ) : items === null ? (
        <p className="text-sm text-slate-700">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-700">No workflow actions have been recorded yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((e) => (
            <li key={e.id} className="py-2.5 text-sm">
              <p className="text-slate-900">
                <strong>{ACTION_LABEL[e.action] ?? e.action}</strong>{' '}
                <span className="text-slate-700">
                  {statusName(e.fromStatus)} &rarr; {statusName(e.toStatus)}
                </span>
              </p>
              <p className="text-xs text-slate-700">
                {formatWhen(e.createdAt)} · {e.actorRole.toLowerCase()}{' '}
                <span className="font-mono" title={e.actorAdminId}>
                  {short(e.actorAdminId)}
                </span>{' '}
                · working copy v{e.assessmentVersion}
              </p>
              {e.note && <p className="mt-1 text-slate-800 whitespace-pre-wrap wrap-break-word">{e.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
