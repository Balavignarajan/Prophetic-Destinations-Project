'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { QuizSummary, AdminQuiz, QuizQuestion } from '../../lib/types';
import { LoadingSpinner, StatusBadge, EmptyState, Modal, ConfirmDialog } from '../../components/ui';
import QuestionLevelsField, { levelsText, questionLevelSet } from '../../components/QuestionLevelsField';

export default function QuizzesPage() {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & filter
  const [quizSearch, setQuizSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'PUBLISHED'>('ALL');

  // Active quiz view & edit
  const [activeQuiz, setActiveQuiz] = useState<AdminQuiz | null>(null);
  const [loadingQuizDetails, setLoadingQuizDetails] = useState(false);

  // Create quiz modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newQuestions, setNewQuestions] = useState<QuizQuestion[]>([
    {
      id: 'q1',
      type: 'SINGLE_CHOICE',
      prompt: '',
      explanation: '',
      options: [
        { id: 'o1', text: '', correct: true },
        { id: 'o2', text: '', correct: false },
      ],
    },
  ]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit quiz modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editQuestions, setEditQuestions] = useState<QuizQuestion[]>([]);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Delete draft quiz
  const [deleteQuizId, setDeleteQuizId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Publishing / Unpublishing action
  const [publishingQuizId, setPublishingQuizId] = useState<string | null>(null);
  const [publishAction, setPublishAction] = useState<'publish' | 'unpublish'>('publish');
  const [togglingPublish, setTogglingPublish] = useState(false);

  const fetchQuizzes = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await api.request<{ items: QuizSummary[]; total: number }>(
        '/admin/quizzes?limit=100'
      );
      setQuizzes(res.items);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to load quizzes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuizzes();
  }, [fetchQuizzes]);

  // Unsaved changes protection
  useEffect(() => {
    const isDirty = Boolean(
      (createModalOpen && (newTitle.trim() || newQuestions.some((q) => q.prompt.trim()))) ||
      (editModalOpen && (editTitle.trim() || editQuestions.some((q) => q.prompt.trim())))
    );

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [createModalOpen, newTitle, newQuestions, editModalOpen, editTitle, editQuestions]);

  const fetchQuizDetails = async (quizId: string) => {
    setLoadingQuizDetails(true);
    try {
      const quiz = await api.request<AdminQuiz>(`/admin/quizzes/${quizId}`);
      setActiveQuiz(quiz);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to load quiz details.');
    } finally {
      setLoadingQuizDetails(false);
    }
  };

  const handleOpenEdit = (quiz: AdminQuiz) => {
    setEditTitle(quiz.title);
    setEditDescription(quiz.description || '');
    setEditQuestions(
      quiz.questions.map((q) => ({
        ...q,
        options: q.options.map((o) => ({ ...o })),
      }))
    );
    setUpdateError(null);
    setEditModalOpen(true);
  };

  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    // Validation
    for (const q of newQuestions) {
      if (!q.prompt.trim()) {
        setCreateError('Every question must have a prompt.');
        return;
      }
      if (q.levels && q.levels.length === 0) {
        setCreateError('Every question needs at least one level.');
        return;
      }
      if (q.options.length < 2 || q.options.length > 6) {
        setCreateError('Each question must have between 2 and 6 options.');
        return;
      }
      const correctCount = q.options.filter((o) => o.correct).length;
      if (correctCount !== 1) {
        setCreateError('Each question must have exactly one correct option.');
        return;
      }
      for (const o of q.options) {
        if (!o.text.trim()) {
          setCreateError('Option text cannot be empty.');
          return;
        }
      }
    }

    setCreating(true);

    try {
      await api.request('/admin/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          questions: newQuestions.map((q) => ({
            levels: q.levels ?? null,
            prompt: q.prompt.trim(),
            explanation: q.explanation?.trim() || null,
            options: q.options.map((o) => ({
              text: o.text.trim(),
              correct: o.correct,
            })),
          })),
        }),
      });

      setCreateModalOpen(false);
      setNewTitle('');
      setNewDescription('');
      fetchQuizzes();
    } catch (err: unknown) {
      const e = err as { payload?: { message?: string }; message?: string };
      setCreateError(e.payload?.message || e.message || 'Failed to create quiz draft.');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeQuiz) return;
    setUpdateError(null);

    // Validation
    for (const q of editQuestions) {
      if (!q.prompt.trim()) {
        setUpdateError('Every question must have a prompt.');
        return;
      }
      if (q.levels && q.levels.length === 0) {
        setUpdateError('Every question needs at least one level.');
        return;
      }
      if (q.options.length < 2 || q.options.length > 6) {
        setUpdateError('Each question must have between 2 and 6 options.');
        return;
      }
      const correctCount = q.options.filter((o) => o.correct).length;
      if (correctCount !== 1) {
        setUpdateError('Each question must have exactly one correct option.');
        return;
      }
    }

    setUpdating(true);

    try {
      const updated = await api.request<AdminQuiz>(
        `/admin/quizzes/${activeQuiz.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: editTitle.trim(),
            description: editDescription.trim() || null,
            version: activeQuiz.version,
            questions: editQuestions.map((q) => ({
              levels: q.levels ?? null,
              prompt: q.prompt.trim(),
              explanation: q.explanation?.trim() || null,
              options: q.options.map((o) => ({
                text: o.text.trim(),
                correct: o.correct,
              })),
            })),
          }),
        }
      );

      setActiveQuiz(updated);
      setEditModalOpen(false);
      fetchQuizzes();
    } catch (err: unknown) {
      const e = err as { payload?: { message?: string }; message?: string };
      setUpdateError(e.payload?.message || e.message || 'Failed to update draft quiz.');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteQuiz = async () => {
    if (!deleteQuizId) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      await api.request(`/admin/quizzes/${deleteQuizId}`, {
        method: 'DELETE',
      });
      setDeleteQuizId(null);
      if (activeQuiz?.id === deleteQuizId) {
        setActiveQuiz(null);
      }
      fetchQuizzes();
    } catch (err: unknown) {
      const e = err as { payload?: { message?: string }; message?: string };
      setDeleteError(
        e.payload?.message ||
          e.message ||
          'Failed to delete quiz. Only draft quizzes can be deleted.'
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!publishingQuizId) return;
    setTogglingPublish(true);

    try {
      const updated = await api.request<AdminQuiz>(
        `/admin/quizzes/${publishingQuizId}/${publishAction}`,
        {
          method: 'POST',
        }
      );

      if (activeQuiz?.id === publishingQuizId) {
        setActiveQuiz(updated);
      }
      setPublishingQuizId(null);
      fetchQuizzes();
    } catch (err: unknown) {
      const e = err as { payload?: { message?: string }; message?: string };
      setError(e.payload?.message || e.message || `Failed to ${publishAction} quiz.`);
    } finally {
      setTogglingPublish(false);
    }
  };

  const handleDuplicateQuiz = async (quiz: AdminQuiz) => {
    try {
      await api.request('/admin/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${quiz.title} (Copy)`,
          description: quiz.description,
          questions: quiz.questions.map((q) => ({
            // a copy keeps every question's level setting (null = every level)
            levels: q.levels ?? null,
            prompt: q.prompt,
            explanation: q.explanation,
            options: q.options.map((o) => ({
              text: o.text,
              correct: o.correct,
            })),
          })),
        }),
      });
      fetchQuizzes();
    } catch (err: unknown) {
      const e = err as { payload?: { message?: string }; message?: string };
      setError(e.payload?.message || e.message || 'Failed to duplicate quiz.');
    }
  };

  const filteredQuizzes = quizzes.filter((q) => {
    const matchesSearch =
      q.title.toLowerCase().includes(quizSearch.toLowerCase()) ||
      (q.description && q.description.toLowerCase().includes(quizSearch.toLowerCase()));
    const matchesStatus = statusFilter === 'ALL' || q.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';
  const canPublish = user?.role === 'ADMIN';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-serif text-2xl font-bold text-slate-900">
            Quiz Management
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Author single-choice quizzes with explanations and publication controls.
          </p>
        </div>

        {canWrite && (
          <button
            onClick={() => setCreateModalOpen(true)}
            className="px-4 py-2.5 text-sm font-medium bg-slate-950 hover:bg-slate-800 text-white rounded-lg shadow-xs transition-colors flex items-center gap-2 self-start sm:self-auto"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Draft Quiz
          </button>
        )}
      </div>

      {deleteError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start justify-between">
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="text-rose-500 font-bold ml-2">
            &times;
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Quizzes List (Left Column) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Quizzes Catalog ({filteredQuizzes.length})
            </h2>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search quizzes..."
              value={quizSearch}
              onChange={(e) => setQuizSearch(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'DRAFT' | 'PUBLISHED')}
              className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-hidden"
            >
              <option value="ALL">All Status</option>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
            </select>
          </div>

          {loading ? (
            <LoadingSpinner text="Loading quizzes..." />
          ) : filteredQuizzes.length === 0 ? (
            <EmptyState
              title="No Quizzes Available"
              description="No quizzes match your search criteria."
            />
          ) : (
            <div className="space-y-2.5">
              {filteredQuizzes.map((quiz) => (
                <div
                  key={quiz.id}
                  onClick={() => fetchQuizDetails(quiz.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    activeQuiz?.id === quiz.id
                      ? 'bg-amber-500/10 border-amber-500/40 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm text-slate-900 line-clamp-1">
                      {quiz.title}
                    </h3>
                    <StatusBadge status={quiz.status} />
                  </div>
                  {quiz.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {quiz.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-3 pt-2 border-t border-slate-100">
                    <span>{quiz.questionCount} Questions</span>
                    <span className="font-mono">v{quiz.version}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Quiz Viewer / Inspector (Right Column) */}
        <div className="lg:col-span-7">
          {loadingQuizDetails ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8">
              <LoadingSpinner text="Fetching full quiz questions..." />
            </div>
          ) : activeQuiz ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="font-serif text-xl font-bold text-slate-900">
                      {activeQuiz.title}
                    </h2>
                    <StatusBadge status={activeQuiz.status} />
                    <span className="text-xs font-mono text-slate-400">v{activeQuiz.version}</span>
                  </div>
                  {activeQuiz.description && (
                    <p className="text-sm text-slate-600 mt-1">
                      {activeQuiz.description}
                    </p>
                  )}
                  <div className="text-[11px] text-slate-400 mt-2 font-mono">
                    ID: {activeQuiz.id}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {canWrite && activeQuiz.status === 'DRAFT' && (
                    <button
                      onClick={() => handleOpenEdit(activeQuiz)}
                      className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                    >
                      Edit Draft
                    </button>
                  )}

                  {canWrite && (
                    <button
                      onClick={() => handleDuplicateQuiz(activeQuiz)}
                      className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                      title="Duplicate this quiz as a new draft"
                    >
                      Duplicate
                    </button>
                  )}

                  {canPublish && (
                    <button
                      onClick={() => {
                        setPublishingQuizId(activeQuiz.id);
                        setPublishAction(
                          activeQuiz.status === 'PUBLISHED' ? 'unpublish' : 'publish'
                        );
                      }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors text-white ${
                        activeQuiz.status === 'PUBLISHED'
                          ? 'bg-rose-600 hover:bg-rose-700'
                          : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                    >
                      {activeQuiz.status === 'PUBLISHED' ? 'Unpublish' : 'Publish Quiz'}
                    </button>
                  )}

                  {canWrite && activeQuiz.status === 'DRAFT' && (
                    <button
                      onClick={() => setDeleteQuizId(activeQuiz.id)}
                      className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg"
                      title="Delete draft quiz"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Questions List */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Questions ({activeQuiz.questions.length})
                </h3>
                <p className="text-xs text-slate-700">
                  Questions learners get at each level:{' '}
                  {(['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const)
                    .map((lv) => `${lv.charAt(0)}${lv.slice(1).toLowerCase()} ${activeQuiz.questions.filter((q) => questionLevelSet(q.levels).includes(lv)).length}`)
                    .join(', ')}
                  . A question without a setting is given at every level. This is separate from the quiz block&rsquo;s level setting in each lesson.
                </p>

                {activeQuiz.questions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No questions defined in this quiz draft.</p>
                ) : (
                  activeQuiz.questions.map((q, idx) => (
                    <div
                      key={q.id}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-md bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center font-mono shrink-0">
                          {idx + 1}
                        </span>
                        <h4 className="font-medium text-sm text-slate-900 leading-snug">
                          {q.prompt}
                        </h4>
                      </div>
                      <p className="pl-7 text-[11px] text-slate-600">Shown at: {levelsText(q.levels)}</p>

                      {/* Options with correct indicator */}
                      <div className="pl-7 space-y-1.5">
                        {q.options.map((opt) => (
                          <div
                            key={opt.id}
                            className={`p-2.5 rounded-lg text-xs flex items-center justify-between border ${
                              opt.correct
                                ? 'bg-emerald-50 text-emerald-900 border-emerald-300 font-medium'
                                : 'bg-white text-slate-700 border-slate-200'
                            }`}
                          >
                            <span>{opt.text}</span>
                            {opt.correct && (
                              <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                                Correct Answer
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      {q.explanation && (
                        <div className="pl-7 pt-1 text-xs text-slate-500 italic">
                          <strong className="not-italic font-semibold text-slate-600">Explanation:</strong>{' '}
                          {q.explanation}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm">
              Select a quiz from the left column to view questions, explanations, and publication status.
            </div>
          )}
        </div>
      </div>

      {/* Create Quiz Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create Draft Quiz"
        description="Add a quiz with 2–6 options per question and mark exactly one correct option."
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateQuiz} className="space-y-5">
          {createError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {createError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Quiz Title *
            </label>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Minor Prophets Comprehension Check"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Description (Optional)
            </label>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Brief assessment description..."
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            />
          </div>

          {/* Questions Editor */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Questions Builder
              </span>
              <button
                type="button"
                onClick={() =>
                  setNewQuestions([
                    ...newQuestions,
                    {
                      id: `q${newQuestions.length + 1}`,
                      type: 'SINGLE_CHOICE',
                      prompt: '',
                      explanation: '',
                      options: [
                        { id: 'o1', text: '', correct: true },
                        { id: 'o2', text: '', correct: false },
                      ],
                    },
                  ])
                }
                className="text-xs font-semibold text-amber-700 hover:text-amber-800"
              >
                + Add Question
              </button>
            </div>

            {newQuestions.map((q, qIndex) => (
              <div
                key={qIndex}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 font-mono">
                    Question #{qIndex + 1}
                  </span>
                  {newQuestions.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setNewQuestions(newQuestions.filter((_, i) => i !== qIndex))
                      }
                      className="text-xs text-rose-600 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  required
                  placeholder="Question prompt..."
                  value={q.prompt}
                  onChange={(e) => {
                    const updated = [...newQuestions];
                    updated[qIndex].prompt = e.target.value;
                    setNewQuestions(updated);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
                />

                <input
                  type="text"
                  placeholder="Optional answer explanation..."
                  value={q.explanation || ''}
                  onChange={(e) => {
                    const updated = [...newQuestions];
                    updated[qIndex].explanation = e.target.value;
                    setNewQuestions(updated);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                />

                <QuestionLevelsField
                  idPrefix={`new-q${qIndex}`}
                  questionLabel={`Question ${qIndex + 1}`}
                  value={q.levels}
                  onChange={(levels) => {
                    const updated = [...newQuestions];
                    updated[qIndex] = { ...updated[qIndex], levels };
                    setNewQuestions(updated);
                  }}
                  disabled={creating}
                />

                {/* Options */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase">
                      Options (select the single correct option)
                    </span>
                    {q.options.length < 6 && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...newQuestions];
                          updated[qIndex].options.push({
                            id: `o${updated[qIndex].options.length + 1}`,
                            text: '',
                            correct: false,
                          });
                          setNewQuestions(updated);
                        }}
                        className="text-[11px] font-semibold text-amber-700 hover:underline"
                      >
                        + Add Option
                      </button>
                    )}
                  </div>

                  {q.options.map((opt, oIndex) => (
                    <div key={oIndex} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-opt-${qIndex}`}
                        checked={opt.correct}
                        onChange={() => {
                          const updated = [...newQuestions];
                          updated[qIndex].options.forEach((o, i) => {
                            o.correct = i === oIndex;
                          });
                          setNewQuestions(updated);
                        }}
                        className="w-4 h-4 text-emerald-600"
                      />
                      <input
                        type="text"
                        required
                        placeholder={`Option ${oIndex + 1}`}
                        value={opt.text}
                        onChange={(e) => {
                          const updated = [...newQuestions];
                          updated[qIndex].options[oIndex].text = e.target.value;
                          setNewQuestions(updated);
                        }}
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                      {q.options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...newQuestions];
                            updated[qIndex].options = updated[qIndex].options.filter(
                              (_, i) => i !== oIndex
                            );
                            if (opt.correct && updated[qIndex].options.length > 0) {
                              updated[qIndex].options[0].correct = true;
                            }
                            setNewQuestions(updated);
                          }}
                          className="text-slate-400 hover:text-rose-600 text-xs px-1"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {creating && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Save Draft Quiz
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Quiz Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Draft Quiz"
        description="Replaces draft quiz content and updates its version."
        maxWidth="2xl"
      >
        <form onSubmit={handleUpdateQuiz} className="space-y-5">
          {updateError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {updateError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Quiz Title *
            </label>
            <input
              type="text"
              required
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Description
            </label>
            <input
              type="text"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            />
          </div>

          {/* Edit Questions */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Questions
              </span>
              <button
                type="button"
                onClick={() =>
                  setEditQuestions([
                    ...editQuestions,
                    {
                      id: `q${editQuestions.length + 1}`,
                      type: 'SINGLE_CHOICE',
                      prompt: '',
                      explanation: '',
                      options: [
                        { id: 'o1', text: '', correct: true },
                        { id: 'o2', text: '', correct: false },
                      ],
                    },
                  ])
                }
                className="text-xs font-semibold text-amber-700 hover:text-amber-800"
              >
                + Add Question
              </button>
            </div>

            {editQuestions.map((q, qIndex) => (
              <div
                key={qIndex}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 font-mono">
                    Question #{qIndex + 1}
                  </span>
                  {editQuestions.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditQuestions(editQuestions.filter((_, i) => i !== qIndex))
                      }
                      className="text-xs text-rose-600 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  required
                  value={q.prompt}
                  onChange={(e) => {
                    const updated = [...editQuestions];
                    updated[qIndex].prompt = e.target.value;
                    setEditQuestions(updated);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
                />

                <input
                  type="text"
                  placeholder="Optional explanation..."
                  value={q.explanation || ''}
                  onChange={(e) => {
                    const updated = [...editQuestions];
                    updated[qIndex].explanation = e.target.value;
                    setEditQuestions(updated);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                />

                <QuestionLevelsField
                  idPrefix={`edit-q${qIndex}`}
                  questionLabel={`Question ${qIndex + 1}`}
                  value={q.levels}
                  onChange={(levels) => {
                    const updated = [...editQuestions];
                    updated[qIndex] = { ...updated[qIndex], levels };
                    setEditQuestions(updated);
                  }}
                  disabled={updating}
                />

                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase">
                      Options (select single correct)
                    </span>
                    {q.options.length < 6 && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...editQuestions];
                          updated[qIndex].options.push({
                            id: `o${updated[qIndex].options.length + 1}`,
                            text: '',
                            correct: false,
                          });
                          setEditQuestions(updated);
                        }}
                        className="text-[11px] font-semibold text-amber-700 hover:underline"
                      >
                        + Add Option
                      </button>
                    )}
                  </div>

                  {q.options.map((opt, oIndex) => (
                    <div key={oIndex} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`edit-correct-opt-${qIndex}`}
                        checked={opt.correct}
                        onChange={() => {
                          const updated = [...editQuestions];
                          updated[qIndex].options.forEach((o, i) => {
                            o.correct = i === oIndex;
                          });
                          setEditQuestions(updated);
                        }}
                        className="w-4 h-4 text-emerald-600"
                      />
                      <input
                        type="text"
                        required
                        value={opt.text}
                        onChange={(e) => {
                          const updated = [...editQuestions];
                          updated[qIndex].options[oIndex].text = e.target.value;
                          setEditQuestions(updated);
                        }}
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                      {q.options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...editQuestions];
                            updated[qIndex].options = updated[qIndex].options.filter(
                              (_, i) => i !== oIndex
                            );
                            if (opt.correct && updated[qIndex].options.length > 0) {
                              updated[qIndex].options[0].correct = true;
                            }
                            setEditQuestions(updated);
                          }}
                          className="text-slate-400 hover:text-rose-600 text-xs px-1"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setEditModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updating}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {updating && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Save Draft
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Quiz Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteQuizId)}
        onClose={() => setDeleteQuizId(null)}
        onConfirm={handleDeleteQuiz}
        title="Delete Draft Quiz"
        message="Are you sure you want to delete this draft quiz? This cannot be undone."
        confirmLabel="Delete Draft"
        isDestructive
        isLoading={deleting}
      />

      {/* Publish/Unpublish Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(publishingQuizId)}
        onClose={() => setPublishingQuizId(null)}
        onConfirm={handleTogglePublish}
        title={`${publishAction === 'publish' ? 'Publish' : 'Unpublish'} Quiz`}
        message={`Are you sure you want to ${publishAction} this quiz? ${
          publishAction === 'publish'
            ? 'It must have at least one valid question and will become available to learners.'
            : 'It will no longer be visible on public learner routes.'
        }`}
        confirmLabel={publishAction === 'publish' ? 'Publish' : 'Unpublish'}
        isLoading={togglingPublish}
      />
    </div>
  );
}
