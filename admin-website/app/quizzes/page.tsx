'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { questionPayload } from '../../lib/quiz-question';
import type { AdminQuiz, QuizSummary } from '../../lib/types';
import { friendlyError } from '../../lib/ui-messages';
import { ConfirmDialog, LoadingSpinner } from '../../components/ui';
import Icon from '../../components/quizzes/icons';
import QuizBuilder from '../../components/quizzes/QuizBuilder';
import QuizCatalog, { type StatusFilter } from '../../components/quizzes/QuizCatalog';
import QuizWorkspace from '../../components/quizzes/QuizWorkspace';

/** The quiz list route takes up to 100 a page (backend ListQuizzesQueryDto). */
const PAGE = 100;

type BuilderState = { mode: 'create' } | { mode: 'edit'; questionId?: string };

/**
 * Quiz Management. The quiz catalog is on the left; the selected quiz on the right as Overview, Questions and Publishing; creating and editing happen in the full-screen Quiz Builder
 * (components/quizzes/QuizBuilder.tsx). Everything the old page could do is still here and goes through the same API with the same rules and roles: ADMIN and EDITOR create, edit a
 * DRAFT, duplicate and delete a draft; only ADMIN publishes and unpublishes; a REVIEWER can read. A published quiz is read-only, as the server requires. Nothing here changes how quizzes are
 * scored, published, versioned or used by lessons.
 */
export default function QuizzesPage() {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<AdminQuiz | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [builder, setBuilder] = useState<BuilderState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // An action that failed and has no tab to show it in (duplicating), and one that has: publishing, unpublishing and deleting show theirs in the Publishing tab.
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [publishAction, setPublishAction] = useState<'publish' | 'unpublish' | null>(null);

  // Every request for the first page and every request for a quiz's details gets a number; an answer for an older number is ignored.
  const listRequest = useRef(0);
  const detailsRequest = useRef(0);

  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';
  const canPublish = user?.role === 'ADMIN';

  const fetchQuizzes = useCallback(async () => {
    const mine = ++listRequest.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.request<{ items: QuizSummary[]; total: number }>(`/admin/quizzes?limit=${PAGE}`);
      if (mine !== listRequest.current) return;
      setQuizzes(res.items);
      setTotal(res.total ?? res.items.length);
    } catch (err: unknown) {
      if (mine === listRequest.current) setError(friendlyError(err, 'Failed to load quizzes.'));
    } finally {
      if (mine === listRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchQuizzes();
  }, [fetchQuizzes]);

  const loadMore = async () => {
    const mine = listRequest.current;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await api.request<{ items: QuizSummary[]; total: number }>(`/admin/quizzes?limit=${PAGE}&offset=${quizzes.length}`);
      if (mine !== listRequest.current) return;
      setQuizzes((current) => [...current, ...res.items.filter((item) => !current.some((c) => c.id === item.id))]);
      setTotal(res.total ?? total);
    } catch (err: unknown) {
      if (mine === listRequest.current) setError(friendlyError(err, 'Failed to load more quizzes.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const openQuiz = useCallback(async (quizId: string) => {
    const mine = ++detailsRequest.current;
    setActiveId(quizId);
    setLoadingDetails(true);
    setDetailsError(null);
    setActionError(null);
    try {
      const quiz = await api.request<AdminQuiz>(`/admin/quizzes/${quizId}`);
      if (mine === detailsRequest.current) setActiveQuiz(quiz);
    } catch (err: unknown) {
      if (mine === detailsRequest.current) {
        setActiveQuiz(null);
        setDetailsError(friendlyError(err, 'Failed to load quiz details.'));
      }
    } finally {
      if (mine === detailsRequest.current) setLoadingDetails(false);
    }
  }, []);

  /** The Quiz Builder saved: what the server now holds becomes the selected quiz, and the list is refreshed. */
  const handleSaved = (saved: AdminQuiz) => {
    const created = builder?.mode === 'create';
    setBuilder(null);
    detailsRequest.current += 1;
    setActiveId(saved.id);
    setActiveQuiz(saved);
    setLoadingDetails(false);
    setDetailsError(null);
    setNotice(created ? `“${saved.title}” was saved as a draft quiz.` : `“${saved.title}” was saved.`);
    void fetchQuizzes();
  };

  const handleDuplicate = async (quiz: AdminQuiz) => {
    setWorking(true);
    setActionError(null);
    setPageError(null);
    try {
      const copy = await api.request<AdminQuiz>('/admin/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${quiz.title} (Copy)`,
          description: quiz.description,
          // a copy keeps every question's level setting (null = every level), its Scripture reference and each option's feedback
          questions: quiz.questions.map(questionPayload),
        }),
      });
      detailsRequest.current += 1;
      setActiveId(copy.id);
      setActiveQuiz(copy);
      setNotice(`A draft copy, “${copy.title}”, was created.`);
      void fetchQuizzes();
    } catch (err: unknown) {
      setNotice(null);
      setPageError(friendlyError(err, 'Failed to duplicate quiz.'));
    } finally {
      setWorking(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    setActionError(null);
    try {
      await api.request(`/admin/quizzes/${deleteId}`, { method: 'DELETE' });
      if (activeId === deleteId) {
        detailsRequest.current += 1;
        setActiveId(null);
        setActiveQuiz(null);
      }
      setDeleteId(null);
      setNotice('The draft quiz was deleted.');
      void fetchQuizzes();
    } catch (err: unknown) {
      // The quiz stays: the reason (for example that a lesson uses it) is shown where the button is.
      setDeleteId(null);
      setActionError(friendlyError(err, 'Failed to delete quiz. Only draft quizzes can be deleted.'));
    } finally {
      setDeleting(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!activeQuiz || !publishAction) return;
    const action = publishAction;
    setWorking(true);
    setActionError(null);
    try {
      const updated = await api.request<AdminQuiz>(`/admin/quizzes/${activeQuiz.id}/${action}`, { method: 'POST' });
      setActiveQuiz(updated);
      setPublishAction(null);
      setNotice(action === 'publish' ? `“${updated.title}” is now published.` : `“${updated.title}” was unpublished and is a draft again.`);
      void fetchQuizzes();
    } catch (err: unknown) {
      setPublishAction(null);
      setActionError(friendlyError(err, `Failed to ${action} quiz.`));
    } finally {
      setWorking(false);
    }
  };

  const create = () => {
    setNotice(null);
    setBuilder({ mode: 'create' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-slate-900">Quiz Management</h1>
          <p className="mt-0.5 text-sm text-slate-700">Create, organize and publish quizzes for your learning content.</p>
        </div>
        {canWrite && (
          <button type="button" onClick={create} className="flex items-center gap-2 self-start rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 sm:self-auto">
            <Icon name="plus" />
            Create Quiz
          </button>
        )}
      </div>

      {pageError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          <span>{pageError}</span>
          <button type="button" onClick={() => setPageError(null)} aria-label="Dismiss this message" className="rounded-lg p-1 hover:bg-rose-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            <Icon name="close" />
          </button>
        </div>
      )}

      {notice && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss this message" className="rounded-lg p-1 hover:bg-emerald-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            <Icon name="close" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5 xl:col-span-4">
          <QuizCatalog
            quizzes={quizzes}
            total={total}
            loading={loading}
            loadingMore={loadingMore}
            error={error}
            activeId={activeId}
            search={search}
            status={status}
            canWrite={canWrite}
            onSearch={setSearch}
            onStatus={setStatus}
            onSelect={(id) => void openQuiz(id)}
            onRetry={() => void fetchQuizzes()}
            onLoadMore={() => void loadMore()}
            onCreate={create}
          />
        </div>

        <div className="lg:col-span-7 xl:col-span-8" aria-live="polite">
          {loadingDetails ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8">
              <LoadingSpinner text="Loading the quiz..." />
            </div>
          ) : detailsError ? (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
              <span>{detailsError}</span>
              {activeId && (
                <button type="button" onClick={() => void openQuiz(activeId)} className="shrink-0 rounded-lg border border-rose-300 bg-white px-3 py-1 font-medium hover:bg-rose-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                  Try again
                </button>
              )}
            </div>
          ) : activeQuiz ? (
            <QuizWorkspace
              key={activeQuiz.id}
              quiz={activeQuiz}
              canWrite={canWrite}
              canPublish={canPublish}
              publishError={actionError}
              busy={working || deleting}
              onEdit={(questionId) => setBuilder({ mode: 'edit', questionId })}
              onDuplicate={() => void handleDuplicate(activeQuiz)}
              onPublish={() => setPublishAction('publish')}
              onUnpublish={() => setPublishAction('unpublish')}
              onDelete={() => setDeleteId(activeQuiz.id)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500">
                <Icon name="quiz" className="h-6 w-6" />
              </span>
              <h2 className="text-base font-semibold text-slate-900">Select a quiz to get started</h2>
              <p className="mt-1 max-w-sm text-sm text-slate-700">Choose a quiz from the list to review its questions, edit content or manage publishing.</p>
              {canWrite && (
                <button type="button" onClick={create} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                  <Icon name="plus" />
                  Create Quiz
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {builder && (
        <QuizBuilder
          mode={builder.mode}
          quiz={builder.mode === 'edit' ? activeQuiz : null}
          initialQuestionId={builder.mode === 'edit' ? builder.questionId : undefined}
          onClose={() => setBuilder(null)}
          onSaved={handleSaved}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void handleDelete()}
        title="Delete Draft Quiz"
        message="Are you sure you want to delete this draft quiz? This cannot be undone."
        confirmLabel="Delete Draft"
        isDestructive
        isLoading={deleting}
      />

      <ConfirmDialog
        isOpen={publishAction !== null}
        onClose={() => setPublishAction(null)}
        onConfirm={() => void handleTogglePublish()}
        title={`${publishAction === 'unpublish' ? 'Unpublish' : 'Publish'} Quiz`}
        message={`Are you sure you want to ${publishAction ?? 'publish'} this quiz? ${
          publishAction === 'unpublish' ? 'It will no longer be visible on public learner routes.' : 'It must have at least one valid question and will become available to learners.'
        }`}
        confirmLabel={publishAction === 'unpublish' ? 'Unpublish' : 'Publish'}
        isLoading={working}
      />
    </div>
  );
}
