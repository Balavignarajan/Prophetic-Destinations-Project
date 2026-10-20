'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth';
import AssessmentEditor from '../../../components/assessments/AssessmentEditor';

/** Creates a new DRAFT assessment (POST /admin/assessments). Only ADMIN and EDITOR may; the server enforces it. */
export default function NewAssessmentPage() {
  const { user } = useAuth();
  const router = useRouter();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-slate-600">
        <Link href="/assessments" className="hover:text-slate-900">Assessments</Link>
        <span aria-hidden="true">/</span>
        <span className="text-slate-900">New assessment</span>
      </nav>
      <div>
        <h1 className="font-serif text-2xl font-bold text-slate-900">Create Assessment</h1>
        <p className="text-sm text-slate-700 mt-0.5">It is saved as a Draft. Nothing reaches learners until it is approved and published.</p>
      </div>
      {!canWrite ? (
        <p role="alert" className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-sm text-amber-900">Your role can view assessments but not create them.</p>
      ) : (
        <AssessmentEditor detail={null} readOnly={false} onSaved={(saved) => router.push(`/assessments/${saved.id}`)} onReload={() => undefined} onCancelNew={() => router.push('/assessments')} />
      )}
    </div>
  );
}
