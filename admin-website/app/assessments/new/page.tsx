'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth';
import AssessmentWorkspace from '../../../components/assessments/AssessmentWorkspace';

/** Creates a new DRAFT assessment (POST /admin/assessments) in the assessment workspace. Only ADMIN and EDITOR may; the server enforces it. */
export default function NewAssessmentPage() {
  const { user } = useAuth();
  const router = useRouter();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sr-only">Create Assessment</h1>
        <p className="text-sm text-slate-700">Create Assessment: it is saved as a Draft. Nothing reaches learners until it is approved and published.</p>
      </div>
      {!canWrite ? (
        <div className="space-y-3">
          <p role="alert" className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-sm text-amber-900">Your role can view assessments but not create them.</p>
          <Link href="/assessments" className="inline-block text-sm text-amber-700 underline">&larr; Back to Assessments</Link>
        </div>
      ) : (
        <AssessmentWorkspace
          detail={null}
          canWrite
          onSaved={(saved) => router.push(`/assessments/${saved.id}`)}
          onReload={() => undefined}
          onCancelNew={() => router.push('/assessments')}
          onWorkflowChanged={() => undefined}
          onStale={() => undefined}
        />
      )}
    </div>
  );
}
