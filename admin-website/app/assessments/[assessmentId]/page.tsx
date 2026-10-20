'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '../../../lib/auth';
import { type AssessmentDetail, assessmentsApi, describeError, fieldIdForPath, formatWhen, isNotFound } from '../../../lib/assessments';
import AssessmentEditor from '../../../components/assessments/AssessmentEditor';
import { EventHistory, PublicationHistory, ValidationPanel, WorkflowPanel } from '../../../components/assessments/AssessmentPanels';
import { LoadingSpinner, StatusBadge } from '../../../components/ui';

/**
 * One assessment: its editable WORKING copy, the publishing checks, the review/publish workflow, the immutable published versions and the audit trail.
 * Every save and every workflow action is confirmed by the API before anything here says it worked, and the page is refreshed from the server afterwards.
 */
export default function AssessmentDetailPage() {
  const params = useParams<{ assessmentId: string }>();
  const id = params?.assessmentId as string;
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';

  const [detail, setDetail] = useState<AssessmentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Bumped to rebuild the editor from the server's copy (an explicit "reload latest"), which discards unsaved edits.
  const [editorKey, setEditorKey] = useState(0);
  const run = useRef(0);
  const latestVersion = useRef<number>(0);

  const load = useCallback(
    async (rebuildEditor = false) => {
      if (!id) return;
      const mine = ++run.current;
      setError(null);
      try {
        const next = await assessmentsApi.get(id);
        if (mine !== run.current) return;
        setDetail(next);
        latestVersion.current = next.version;
        setMissing(false);
        if (rebuildEditor) setEditorKey((k) => k + 1);
      } catch (err: unknown) {
        if (mine !== run.current) return;
        if (isNotFound(err)) setMissing(true);
        else setError(describeError(err, 'The assessment could not be loaded.'));
      }
    },
    [id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Someone else may have saved while this tab was in the background: when it regains focus, look at the server once. A NEWER version is handed to the editor, which
  // replaces its content if there are no unsaved edits and otherwise shows its "saved elsewhere" banner (the edits are never overwritten silently).
  useEffect(() => {
    if (!id) return;
    const check = async () => {
      if (document.visibilityState === 'hidden' || latestVersion.current === 0) return;
      try {
        const next = await assessmentsApi.get(id);
        if (next.version > latestVersion.current) {
          latestVersion.current = next.version;
          setDetail(next);
          setMessage('This assessment was saved elsewhere, so the page was refreshed.');
        }
      } catch {
        // a failed background check changes nothing; the next save or action reports real problems
      }
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [id]);

  const reloadLatest = () => {
    if (dirty && !window.confirm('Reload the latest saved version? Your unsaved edits will be lost.')) return;
    void load(true);
  };

  const goTo = (path?: string) => {
    const target = fieldIdForPath(path);
    const el = target ? document.getElementById(target) : null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el as HTMLElement).focus({ preventScroll: true });
    }
  };

  if (missing) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-lg font-bold text-slate-800">Assessment not found</h1>
        <p className="mt-2 text-sm text-slate-700">It may have been removed, or the link is wrong.</p>
        <Link href="/assessments" className="mt-4 inline-block text-sm text-amber-700 underline">&larr; Back to Assessments</Link>
      </div>
    );
  }
  if (!detail) {
    return error ? (
      <div role="alert" className="p-6 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-900">
        {error} <button type="button" className="underline font-medium" onClick={() => void load()}>Try again</button>
        <div className="mt-3"><Link href="/assessments" className="underline">&larr; Back to Assessments</Link></div>
      </div>
    ) : (
      <LoadingSpinner text="Loading assessment..." />
    );
  }

  const refreshKey = `${detail.version}:${detail.status}:${detail.activePublication?.version ?? ''}:${detail.latestPublishedVersion ?? ''}`;

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-slate-600">
        <Link href="/assessments" className="hover:text-slate-900">Assessments</Link>
        <span aria-hidden="true">/</span>
        <span className="text-slate-900 truncate max-w-xs">{detail.title}</span>
      </nav>

      {message && (
        <div role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-center justify-between gap-3">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message" className="text-emerald-800">&times;</button>
        </div>
      )}
      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm">
          {error} <button type="button" className="underline font-medium" onClick={() => void load()}>Try again</button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-2xl font-bold text-slate-900 break-words">{detail.title}</h1>
          <StatusBadge status={detail.status} />
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-700">
          <div><dt className="inline font-semibold">Working copy: </dt><dd className="inline font-mono">v{detail.version}</dd></div>
          <div><dt className="inline font-semibold">Active for learners: </dt><dd className="inline">{detail.activePublication ? `published version ${detail.activePublication.version}` : 'no'}</dd></div>
          <div><dt className="inline font-semibold">Questions: </dt><dd className="inline">{detail.questions.length}</dd></div>
          <div><dt className="inline font-semibold">Updated: </dt><dd className="inline">{formatWhen(detail.updatedAt)}</dd></div>
        </dl>
        <p className="text-xs text-slate-700">
          This page edits the <strong>working copy</strong>. Learners receive an immutable <strong>published version</strong>; editing never changes it, and saving returns this copy to Draft.
          {!canWrite && ' Your role can read but not change assessments.'}
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 min-w-0">
          <AssessmentEditor
            key={editorKey}
            detail={detail}
            readOnly={!canWrite}
            onDirtyChange={setDirty}
            onSaved={(saved) => {
              setDetail(saved);
              setMessage(null);
            }}
            onReload={reloadLatest}
          />
        </div>
        <div className="space-y-6 min-w-0">
          <WorkflowPanel
            detail={detail}
            dirty={dirty}
            onChanged={(text) => {
              setMessage(text);
              void load();
            }}
            onStale={() => void load()}
          />
          <ValidationPanel assessmentId={detail.id} refreshKey={refreshKey} dirty={dirty} onGoTo={goTo} />
          <PublicationHistory assessmentId={detail.id} refreshKey={refreshKey} />
          <EventHistory assessmentId={detail.id} refreshKey={refreshKey} />
        </div>
      </div>
    </div>
  );
}
