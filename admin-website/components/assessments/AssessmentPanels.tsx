'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACTION_LABEL,
  type AssessmentAction,
  type AssessmentDetail,
  type AssessmentSummary,
  type Problem,
  type Publication,
  type ValidationReport,
  type WorkflowEvent,
  assessmentsApi,
  describeError,
  fieldIdForPath,
  formatWhen,
  isConflict,
  problemsFromError,
} from '../../lib/assessments';
import { Modal, StatusBadge } from '../ui';

const SMALL_BTN = 'px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';
const short = (id: string) => id.slice(0, 8);

// ============================================================================================================================ validation

interface ValidationProps {
  assessmentId: string;
  /** Changes whenever the saved assessment changed, so the report is fetched again. */
  refreshKey: string;
  /** Unsaved edits exist: the report covers the SAVED copy only. */
  dirty: boolean;
  onGoTo: (path?: string) => void;
}

/** The backend's publishing report for the saved working copy: blocking problems and non-blocking warnings. The backend stays the final authority. */
export function ValidationPanel({ assessmentId, refreshKey, dirty, onGoTo }: ValidationProps) {
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
    <li key={`${p.code}-${p.path ?? ''}-${i}`} className="text-sm">
      <span className={tone === 'problem' ? 'text-rose-900' : 'text-amber-900'}>{p.message}</span>{' '}
      {fieldIdForPath(p.path) && (
        <button type="button" onClick={() => onGoTo(p.path)} className="text-xs underline text-slate-700">Go to it</button>
      )}
      <span className="block text-[11px] text-slate-500 font-mono">{p.code}{p.path ? ` · ${p.path}` : ''}</span>
    </li>
  );

  return (
    <section aria-labelledby="as-validation-h" className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs" aria-busy={loading}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="as-validation-h" className="font-serif text-lg font-bold text-slate-900">Publishing checks</h2>
        <button type="button" className={SMALL_BTN} onClick={() => void load()} disabled={loading}>{loading ? 'Checking…' : 'Check again'}</button>
      </div>
      <p className="text-xs text-slate-700">These checks cover the <strong>saved</strong> assessment{dirty ? ' (your unsaved edits are not included; save first)' : ''}. The server decides when you publish.</p>

      {error && (
        <div role="alert" className="p-3 rounded-lg border border-rose-300 bg-rose-50 text-sm text-rose-900">
          {error} This is not the same as &ldquo;no problems&rdquo;. <button type="button" className="underline" onClick={() => void load()}>Try again</button>
        </div>
      )}
      {!report && !error && <p className="text-sm text-slate-700">Running the checks…</p>}
      {report && (
        <>
          {report.valid ? (
            <p role="status" className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-900"><strong>No blocking problems.</strong> The saved assessment meets the publishing checks. It still needs approval before it can be published.</p>
          ) : (
            <div>
              <p className="text-sm font-semibold text-rose-900 mb-1">{report.problems.length} blocking {report.problems.length === 1 ? 'problem' : 'problems'}. It cannot be published until they are fixed.</p>
              <ul className="space-y-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3">{report.problems.map((p, i) => item(p, i, 'problem'))}</ul>
            </div>
          )}
          {report.warnings.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-amber-900 mb-1">{report.warnings.length} {report.warnings.length === 1 ? 'warning' : 'warnings'} (do not block publishing)</p>
              <ul className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">{report.warnings.map((p, i) => item(p, i, 'warning'))}</ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ============================================================================================================================ workflow

const EXPLANATION: Record<AssessmentAction, string> = {
  SUBMIT_FOR_REVIEW: 'Sends the saved assessment to a reviewer. Editing it afterwards returns it to Draft and cancels the review.',
  REQUEST_CHANGES: 'Sends the assessment back to Draft with your note, so the author knows what to change.',
  APPROVE: 'Marks the saved assessment as approved. Approving does not publish it; any later edit returns it to Draft and the approval is lost.',
  PUBLISH: 'Publishes the saved, approved assessment.',
  UNPUBLISH: 'Withdraws this assessment from learners.',
};

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

  const open = async (next: AssessmentAction) => {
    setAction(next);
    setNote('');
    setError(null);
    setProblems([]);
    setReport(null);
    setReplacing(undefined);
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
      setAction(null);
      onChanged(
        action === 'PUBLISH'
          ? `Published as version ${result.publication?.version ?? ''}. It is now the assessment mobile learners receive.`
          : action === 'UNPUBLISH'
            ? 'Unpublished. Learners no longer receive this assessment.'
            : `${ACTION_LABEL[action]}: done. Status is now ${result.status.replace(/_/g, ' ').toLowerCase()}.`,
      );
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

  return (
    <section aria-labelledby="as-workflow-h" className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
      <h2 id="as-workflow-h" className="font-serif text-lg font-bold text-slate-900">Review and publishing</h2>
      <p className="text-sm text-slate-800 flex flex-wrap items-center gap-2">
        Working copy: <StatusBadge status={detail.status} /> <span className="font-mono text-xs text-slate-600">v{detail.version}</span>
        <span className="text-slate-400">·</span>
        {detail.activePublication ? <>Active for learners: <strong>published version {detail.activePublication.version}</strong></> : <>Not active for learners</>}
      </p>
      <p className="text-xs text-slate-700">Flow: Draft &rarr; Ready for review &rarr; Approved &rarr; Published. <strong>Only an Approved assessment can be published</strong>, for every role. Editing returns it to Draft. Learners always get an immutable published version, never the working copy.</p>

      {dirty && <p role="note" className="text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-900 p-2.5">You have unsaved changes. Save or discard them first: these actions apply to the saved assessment.</p>}

      {actions.length === 0 ? (
        <p className="text-sm text-slate-700">No action is available to your role in this status.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <li key={a}>
              <button type="button" disabled={dirty} onClick={() => void open(a)} className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2">
                {ACTION_LABEL[a]}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={action !== null} onClose={close} title={action ? `Confirm: ${ACTION_LABEL[action]}` : ''} maxWidth="lg">
        {action && (
          <div className="space-y-4">
            {error && (
              <div role="alert" className="p-3 rounded-lg border border-rose-300 bg-rose-50 text-sm text-rose-900 space-y-1">
                <p>{error}</p>
                {problems.length > 0 && <ul className="list-disc pl-5">{problems.map((p, i) => <li key={`${p.code}-${i}`}>{p.message}</li>)}</ul>}
              </div>
            )}

            <p className="text-sm text-slate-800">{EXPLANATION[action]}</p>

            {action === 'PUBLISH' && (
              <div className="space-y-2 text-sm text-slate-800">
                <p>
                  <strong>This activates the assessment for mobile learners</strong> as published version {(detail.latestPublishedVersion ?? 0) + 1}, using the saved content shown on this page. Only one assessment is
                  active at a time, so it <strong>replaces the assessment that is active now</strong>
                  {replacing ? <> (&ldquo;{replacing.title}&rdquo;, version {replacing.activePublishedVersion}), which is withdrawn and returns to Approved</> : replacing === null ? <> (none is active right now)</> : <> (if there is one; it could not be looked up)</>}.
                  {detail.activePublication && <> Its own previous version {detail.activePublication.version} is replaced.</>}
                </p>
                {checking && <p role="status">Running the publishing checks…</p>}
                {report && !report.valid && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                    <p className="font-semibold text-rose-900 mb-1">It cannot be published yet:</p>
                    <ul className="list-disc pl-5 text-rose-900">{report.problems.map((p, i) => <li key={`${p.code}-${i}`}>{p.message}</li>)}</ul>
                  </div>
                )}
                {report && report.valid && report.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="font-semibold text-amber-900 mb-1">Warnings (they do not block publishing):</p>
                    <ul className="list-disc pl-5 text-amber-900">{report.warnings.map((p, i) => <li key={`${p.code}-${i}`}>{p.message}</li>)}</ul>
                  </div>
                )}
              </div>
            )}
            {action === 'UNPUBLISH' && (
              <p className="text-sm text-slate-800"><strong>Mobile learners will receive no assessment</strong> until one is published again. Published versions are kept; only this one stops being active.</p>
            )}

            {(action === 'REQUEST_CHANGES' || action === 'APPROVE' || action === 'SUBMIT_FOR_REVIEW') && (
              <div>
                <label htmlFor="as-wf-note" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                  Note {action === 'REQUEST_CHANGES' ? '*' : '(optional)'}
                </label>
                <textarea id="as-wf-note" rows={3} maxLength={2000} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/40" />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button type="button" onClick={close} disabled={busy} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={busy || blocked || (action === 'REQUEST_CHANGES' && !note.trim())}
                aria-busy={busy}
                className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
              >
                {busy && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
                {ACTION_LABEL[action]}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

// ============================================================================================================================ history

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
    <section aria-labelledby="as-pub-h" className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
      <h2 id="as-pub-h" className="font-serif text-lg font-bold text-slate-900">Published versions</h2>
      <p className="text-xs text-slate-700">Each published version is <strong>immutable</strong>: later edits to the working copy never change it. Answers are always scored against the exact version the app received.</p>
      {error ? (
        <p role="alert" className="text-sm text-rose-900">{error} <button type="button" className="underline" onClick={() => setReload((n) => n + 1)}>Try again</button></p>
      ) : items === null ? (
        <p className="text-sm text-slate-700">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-700">This assessment has never been published.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-600">
                <th scope="col" className="pb-1 pr-3 font-semibold">Version</th>
                <th scope="col" className="pb-1 pr-3 font-semibold">State</th>
                <th scope="col" className="pb-1 pr-3 font-semibold">Published</th>
                <th scope="col" className="pb-1 pr-3 font-semibold">Ended</th>
                <th scope="col" className="pb-1 font-semibold">Published by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((p) => (
                <tr key={p.id}>
                  <td className="py-1.5 pr-3 font-semibold">v{p.version}</td>
                  <td className="py-1.5 pr-3">
                    {p.active ? <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">Active</span> : <span className="text-slate-700">{p.endedReason === 'SUPERSEDED' ? 'Replaced' : 'Unpublished'}</span>}
                  </td>
                  <td className="py-1.5 pr-3">{formatWhen(p.publishedAt)}</td>
                  <td className="py-1.5 pr-3">{formatWhen(p.endedAt)}</td>
                  <td className="py-1.5 font-mono text-xs text-slate-600" title={p.publishedBy}>{short(p.publishedBy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    <section aria-labelledby="as-events-h" className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
      <h2 id="as-events-h" className="font-serif text-lg font-bold text-slate-900">Workflow history</h2>
      {error ? (
        <p role="alert" className="text-sm text-rose-900">{error} <button type="button" className="underline" onClick={() => setReload((n) => n + 1)}>Try again</button></p>
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
                <span className="text-slate-600">{e.fromStatus.replace(/_/g, ' ').toLowerCase()} &rarr; {e.toStatus.replace(/_/g, ' ').toLowerCase()}</span>
              </p>
              <p className="text-xs text-slate-600">
                {formatWhen(e.createdAt)} · {e.actorRole.toLowerCase()} <span className="font-mono" title={e.actorAdminId}>{short(e.actorAdminId)}</span> · working copy v{e.assessmentVersion}
              </p>
              {e.note && <p className="mt-1 text-slate-800 whitespace-pre-wrap">{e.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
