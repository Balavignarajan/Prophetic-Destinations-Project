'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '../../../lib/auth';
import { type AssessmentDetail, assessmentsApi, describeError, isNotFound } from '../../../lib/assessments';
import AssessmentWorkspace from '../../../components/assessments/AssessmentWorkspace';
import { LoadingSpinner } from '../../../components/ui';

/**
 * One assessment, in the assessment workspace (Overview, Questions, Scoring, Publishing): its editable WORKING copy, the publishing checks, the review/publish workflow, the immutable published
 * versions and the audit trail. This page loads the assessment and keeps it fresh; the workspace edits it. Every save and every workflow action is confirmed by the API before anything here says
 * it worked, and the page is refreshed from the server afterwards.
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

  // The workspace has already asked (with its own confirmation dialog) when unsaved edits would be lost.
  const reloadLatest = () => {
    void load(true);
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

  return (
    <div className="space-y-5">
      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm">
          {error} <button type="button" className="underline font-medium" onClick={() => void load()}>Try again</button>
        </div>
      )}

      <AssessmentWorkspace
        key={editorKey}
        detail={detail}
        canWrite={canWrite}
        message={message}
        onDismissMessage={() => setMessage(null)}
        onSaved={(saved) => {
          setDetail(saved);
          latestVersion.current = saved.version;
          setMessage(null);
        }}
        onReload={reloadLatest}
        onWorkflowChanged={(text) => {
          setMessage(text);
          void load();
        }}
        onStale={() => void load()}
      />
    </div>
  );
}
