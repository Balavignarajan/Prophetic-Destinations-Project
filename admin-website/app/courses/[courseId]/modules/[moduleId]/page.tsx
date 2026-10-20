'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { WORKFLOW_ENDPOINT, catalogTransitionBody, type WorkflowAction } from '@/lib/workflow';
import { useAuth } from '@/lib/auth';
import {
  Course,
  ModuleItem,
  LessonSummary,
  WorkflowState,
  WorkflowEvent,
  LearningLevel,
} from '@/lib/types';
import { LoadingSpinner, StatusBadge, EmptyState, Modal, ConfirmDialog } from '@/components/ui';
import { friendlyError } from '@/lib/ui-messages';
import DuplicateLessonDialog from '@/components/DuplicateLessonDialog';
import CoverThumb from '@/components/CoverThumb';
import CoverImageField from '@/components/CoverImageField';

export default function ModuleDetailPage() {
  const params = useParams();
  const courseId = params?.courseId as string;
  const moduleId = params?.moduleId as string;
  const { user } = useAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [moduleData, setModuleData] = useState<ModuleItem | null>(null);
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [workflowState, setWorkflowState] = useState<WorkflowState | null>(null);
  const [workflowEvents, setWorkflowEvents] = useState<WorkflowEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  // Edit module
  const [editModuleModalOpen, setEditModuleModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [updatingModule, setUpdatingModule] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Create lesson modal
  const [createLessonModalOpen, setCreateLessonModalOpen] = useState(false);
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [newLessonCover, setNewLessonCover] = useState<string | null>(null);
  const [newShortTitle, setNewShortTitle] = useState('');
  const [newSubtitle, setNewSubtitle] = useState('');
  const [newIntroduction, setNewIntroduction] = useState('');
  const [newEstimatedMinutes, setNewEstimatedMinutes] = useState<string>('');
  const [newLevels, setNewLevels] = useState<LearningLevel[]>([
    'BEGINNER',
    'INTERMEDIATE',
    'ADVANCED',
  ]);
  const [creatingLesson, setCreatingLesson] = useState(false);
  const [createLessonError, setCreateLessonError] = useState<string | null>(null);

  // Delete lesson
  const [duplicateTarget, setDuplicateTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleteLessonId, setDeleteLessonId] = useState<string | null>(null);
  const [deletingLesson, setDeletingLesson] = useState(false);
  const [deleteLessonError, setDeleteLessonError] = useState<string | null>(null);

  // Workflow transition
  const [transitionAction, setTransitionAction] = useState<string | null>(null);
  const [transitionNote, setTransitionNote] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const fetchModuleData = useCallback(async () => {
    if (!courseId || !moduleId) return;
    setLoading(!hasLoadedRef.current);
    setError(null);

    try {
      const [courseRes, modRes, lessonsRes, wfStateRes, wfEventsRes] =
        await Promise.all([
          api.request<Course>(`/admin/courses/${courseId}`),
          api.request<ModuleItem>(`/admin/courses/${courseId}/modules/${moduleId}`),
          api.request<{ items: LessonSummary[] }>(
            `/admin/courses/${courseId}/modules/${moduleId}/lessons`
          ),
          api.request<WorkflowState>(
            `/admin/courses/${courseId}/modules/${moduleId}/workflow`
          ),
          api.request<{ items: WorkflowEvent[] }>(
            `/admin/courses/${courseId}/modules/${moduleId}/workflow/events?limit=10`
          ),
        ]);

      setCourse(courseRes);
      setModuleData(modRes);
      setLessons(lessonsRes.items);
      setWorkflowState(wfStateRes);
      setWorkflowEvents(wfEventsRes.items);
      setEditTitle(modRes.title);
      setEditDescription(modRes.description || '');
    } catch (err: unknown) {
      setError(friendlyError(err, 'Failed to load module details.'));
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [courseId, moduleId]);

  useEffect(() => {
    fetchModuleData();
  }, [fetchModuleData]);

  // Unsaved changes protection
  useEffect(() => {
    const isDirty = Boolean(
      (createLessonModalOpen && (newLessonTitle.trim().length > 0 || newLessonCover !== null)) ||
      (editModuleModalOpen && moduleData && (
        editTitle !== moduleData.title ||
        editDescription !== (moduleData.description || '')
      ))
    );

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [createLessonModalOpen, newLessonTitle, newLessonCover, editModuleModalOpen, moduleData, editTitle, editDescription]);

  const confirmDiscard = (hasChanges: boolean, close: () => void) => {
    if (!hasChanges || window.confirm('Discard your unsaved changes?')) close();
  };

  const handleUpdateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moduleData) return;
    setUpdateError(null);
    setUpdatingModule(true);

    try {
      const updated = await api.request<ModuleItem>(
        `/admin/courses/${courseId}/modules/${moduleId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: editTitle.trim(),
            description: editDescription.trim() || null,
            version: moduleData.version,
          }),
        }
      );

      setModuleData(updated);
      setEditModuleModalOpen(false);
      setSuccessMessage('Module details saved.');
      fetchModuleData();
    } catch (err: unknown) {
      setUpdateError(friendlyError(err, 'Failed to update module.'));
    } finally {
      setUpdatingModule(false);
    }
  };

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLessonError(null);

    if (newLevels.length === 0) {
      setCreateLessonError('Please select at least one learning level.');
      return;
    }

    setCreatingLesson(true);

    try {
      await api.request(
        `/admin/courses/${courseId}/modules/${moduleId}/lessons`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: newLessonTitle.trim(),
            shortTitle: newShortTitle.trim() || undefined,
            subtitle: newSubtitle.trim() || undefined,
            introduction: newIntroduction.trim() || undefined,
            estimatedMinutes: newEstimatedMinutes ? parseInt(newEstimatedMinutes, 10) : undefined,
            levels: newLevels,
            ...(newLessonCover ? { coverMediaId: newLessonCover } : {}),
          }),
        }
      );

      setCreateLessonModalOpen(false);
      setNewLessonTitle('');
      setNewLessonCover(null);
      setNewShortTitle('');
      setNewSubtitle('');
      setNewIntroduction('');
      setNewEstimatedMinutes('');
      setSuccessMessage('Lesson created.');
      fetchModuleData();
    } catch (err: unknown) {
      setCreateLessonError(friendlyError(err, 'Failed to create lesson.'));
    } finally {
      setCreatingLesson(false);
    }
  };

  const handleDeleteLesson = async () => {
    if (!deleteLessonId) return;
    setDeletingLesson(true);
    setDeleteLessonError(null);

    try {
      await api.request(`/admin/lessons/${deleteLessonId}`, {
        method: 'DELETE',
      });
      setDeleteLessonId(null);
      setSuccessMessage('Lesson deleted.');
      fetchModuleData();
    } catch (err: unknown) {
      setDeleteLessonError(friendlyError(err, 'Failed to delete lesson. Lessons with publication history cannot be deleted.'));
    } finally {
      setDeletingLesson(false);
    }
  };

  const handleReorderLessons = async (index: number, direction: 'up' | 'down') => {
    const newLessons = [...lessons];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newLessons.length) return;

    const temp = newLessons[index];
    newLessons[index] = newLessons[targetIndex];
    newLessons[targetIndex] = temp;

    try {
      const res = await api.request<{ items: LessonSummary[] }>(
        `/admin/courses/${courseId}/modules/${moduleId}/lessons/order`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lessonIds: newLessons.map((l) => l.id),
          }),
        }
      );
      setLessons(res.items);
      setSuccessMessage('Lesson order saved.');
      fetchModuleData();
    } catch (err: unknown) {
      setError(friendlyError(err, 'Failed to update lesson order.'));
    }
  };

  const handleWorkflowTransition = async () => {
    if (!transitionAction || !moduleData) return;
    setTransitioning(true);
    setTransitionError(null);

    const endpoint = WORKFLOW_ENDPOINT[transitionAction as WorkflowAction];

    try {
      // Backend CatalogTransitionDto accepts only { note?, expectedVersion? } (forbidNonWhitelisted).
      const body = catalogTransitionBody(transitionAction as WorkflowAction, workflowState, transitionNote);

      await api.request(
        `/admin/courses/${courseId}/modules/${moduleId}/workflow/${endpoint}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      setTransitionAction(null);
      setTransitionNote('');
      setSuccessMessage('Module status updated.');
      fetchModuleData();
    } catch (err: unknown) {
      setTransitionError(friendlyError(err, 'This status change could not be completed.'));
    } finally {
      setTransitioning(false);
    }
  };

  const toggleLevel = (level: LearningLevel) => {
    if (newLevels.includes(level)) {
      setNewLevels(newLevels.filter((l) => l !== level));
    } else {
      setNewLevels([...newLevels, level]);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading module details..." />;
  }

  if (!moduleData) {
    return (
      <div className="p-8 text-center">
        <h3 className="text-lg font-bold text-slate-800">{error ? 'Module could not be loaded' : 'Module Not Found'}</h3>
        <p className="mt-2 text-sm text-slate-600">{error || 'This module may have been removed.'}</p>
        {error ? <button onClick={() => fetchModuleData()} className="mt-4 px-3 py-1.5 text-sm font-semibold text-white bg-slate-900 rounded-lg">Retry</button> : <Link href={`/courses/${courseId}`} className="mt-4 inline-block text-sm text-amber-700 underline">&larr; Back to Course</Link>}
      </div>
    );
  }

  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';

  return (
    <div className="space-y-8">
      {successMessage && <div role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex justify-between gap-3"><span>{successMessage}</span><button onClick={() => setSuccessMessage(null)} aria-label="Dismiss success message">&times;</button></div>}
      {error && (
        <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => fetchModuleData()} className="px-3 py-1 text-xs font-semibold border border-rose-300 rounded-md hover:bg-rose-100">Retry</button>
        </div>
      )}
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Link href="/courses" className="hover:text-slate-800">
          Courses
        </Link>
        <span>/</span>
        <Link href={`/courses/${courseId}`} className="hover:text-slate-800 truncate max-w-xs">
          {course?.title || 'Course'}
        </Link>
        <span>/</span>
        <span className="text-slate-800 truncate max-w-xs">{moduleData.title}</span>
      </div>

      {/* Module Overview Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="font-serif text-2xl font-bold text-slate-900">
                {moduleData.title}
              </h1>
              <StatusBadge status={moduleData.status} />
              <span className="text-xs font-mono text-slate-400">v{moduleData.version}</span>
            </div>
            {moduleData.description && (
              <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
                {moduleData.description}
              </p>
            )}
            <div className="flex items-center gap-4 text-xs text-slate-400 pt-1">
              <span>Position: {moduleData.position}</span>
              <span>•</span>
              <span>Updated: {new Date(moduleData.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canWrite && (
              <button
                onClick={() => setEditModuleModalOpen(true)}
                className="px-3.5 py-2 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg shadow-xs"
              >
                Edit Module Details
              </button>
            )}
          </div>
        </div>

        {/* Workflow Actions */}
        {workflowState && (
          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Module Workflow:
              </span>
              {workflowState.allowedActions.length === 0 ? (
                <span className="text-xs text-slate-400 italic">No transitions available</span>
              ) : (
                workflowState.allowedActions.map((action) => {
                  const labelMap: Record<string, string> = {
                    SUBMIT_FOR_REVIEW: 'Submit Module',
                    REQUEST_CHANGES: 'Request Changes',
                    APPROVE: 'Approve Module',
                    PUBLISH: 'Publish Module',
                    UNPUBLISH: 'Unpublish Module',
                  };
                  const colorMap: Record<string, string> = {
                    SUBMIT_FOR_REVIEW: 'bg-blue-600 hover:bg-blue-700 text-white',
                    REQUEST_CHANGES: 'bg-amber-600 hover:bg-amber-700 text-white',
                    APPROVE: 'bg-emerald-600 hover:bg-emerald-700 text-white',
                    PUBLISH: 'bg-slate-900 hover:bg-slate-800 text-white',
                    UNPUBLISH: 'bg-rose-600 hover:bg-rose-700 text-white',
                  };
                  return (
                    <button
                      key={action}
                      onClick={() => setTransitionAction(action)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg shadow-xs transition-colors ${
                        colorMap[action] || 'bg-slate-800 text-white'
                      }`}
                    >
                      {labelMap[action] || action}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {deleteLessonError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start justify-between">
          <span>{deleteLessonError}</span>
          <button onClick={() => setDeleteLessonError(null)} className="text-rose-500 font-bold ml-2">
            &times;
          </button>
        </div>
      )}

      {/* Lessons Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-xl font-bold text-slate-900">
              Module Lessons
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Individual lesson content units, learning levels, and blocks.
            </p>
          </div>

          {canWrite && (
            <button
              onClick={() => setCreateLessonModalOpen(true)}
              className="px-3.5 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-lg flex items-center gap-1.5 shadow-xs"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Lesson
            </button>
          )}
        </div>

        {lessons.length === 0 ? (
          <EmptyState
            title="No Lessons in this Module"
            description="Create the first lesson to begin adding content blocks."
            action={
              canWrite ? (
                <button
                  onClick={() => setCreateLessonModalOpen(true)}
                  className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg"
                >
                  Create First Lesson
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <div className="divide-y divide-slate-100">
              {lessons.map((lesson, index) => (
                <div
                  key={lesson.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    {/* Position and reorder */}
                    <div className="flex flex-col items-center">
                      <span className="w-7 h-7 rounded-md bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center border border-slate-200 font-mono">
                        {index + 1}
                      </span>
                      {canWrite && (
                        <div className="flex gap-1 mt-1.5">
                          <button
                            disabled={index === 0}
                            onClick={() => handleReorderLessons(index, 'up')}
                            className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                            title="Move up"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          <button
                            disabled={index === lessons.length - 1}
                            onClick={() => handleReorderLessons(index, 'down')}
                            className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                            title="Move down"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>

                    <CoverThumb mediaId={lesson.coverMediaId} />
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <Link
                          href={`/lessons/${lesson.id}`}
                          className="font-semibold text-base text-slate-900 hover:text-amber-700 transition-colors"
                        >
                          {lesson.title}
                        </Link>
                        <StatusBadge status={lesson.status} />
                        <span className="text-xs font-mono text-slate-400">v{lesson.version}</span>
                      </div>
                      {lesson.subtitle && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {lesson.subtitle}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        {lesson.levels.map((lvl) => (
                          <span
                            key={lvl}
                            className="px-2 py-0.5 text-[10px] font-semibold tracking-wider rounded-md bg-amber-50 text-amber-800 border border-amber-200 uppercase"
                          >
                            {lvl}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <Link
                      href={`/lessons/${lesson.id}`}
                      className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <span>Author Content</span>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </Link>

                    {canWrite && (
                      <button
                        onClick={() => setDuplicateTarget({ id: lesson.id, title: lesson.title })}
                        aria-label={`Duplicate lesson ${lesson.title}`}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
                      >
                        Duplicate lesson
                      </button>
                    )}

                    {canWrite && (
                      <button
                        onClick={() => setDeleteLessonId(lesson.id)}
                        className="text-xs font-medium text-rose-600 hover:text-rose-800 p-1.5"
                        title="Delete lesson"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <DuplicateLessonDialog
        lesson={duplicateTarget}
        destination={`${moduleData?.title ?? 'This module'}${course ? ` in ${course.title}` : ''}`}
        onClose={() => setDuplicateTarget(null)}
      />

      {/* Edit Module Modal */}
      <Modal
        isOpen={editModuleModalOpen}
        onClose={() => confirmDiscard(editTitle !== moduleData.title || editDescription !== (moduleData.description || ''), () => setEditModuleModalOpen(false))}
        title="Edit Module Details"
        description="Saving changes returns this module to Draft, so it must be reviewed again before publishing."
      >
        <form onSubmit={handleUpdateModule} className="space-y-4">
          {updateError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {updateError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Module Title *
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
            <textarea
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => confirmDiscard(editTitle !== moduleData.title || editDescription !== (moduleData.description || ''), () => setEditModuleModalOpen(false))}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updatingModule}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {updatingModule && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </Modal>

      {/* Create Lesson Modal */}
      <Modal
        isOpen={createLessonModalOpen}
        onClose={() => confirmDiscard(Boolean(newLessonTitle.trim() || newShortTitle.trim() || newSubtitle.trim() || newIntroduction.trim() || newEstimatedMinutes || newLessonCover), () => setCreateLessonModalOpen(false))}
        title="Create New Lesson"
        description="Add a lesson with title and target learning levels."
      >
        <form onSubmit={handleCreateLesson} className="space-y-4">
          {createLessonError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {createLessonError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Lesson Title *
            </label>
            <input
              type="text"
              required
              value={newLessonTitle}
              onChange={(e) => setNewLessonTitle(e.target.value)}
              placeholder="e.g. Lesson 1: The Day of the Lord in Joel"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Short Title (Optional)
              </label>
              <input
                type="text"
                value={newShortTitle}
                onChange={(e) => setNewShortTitle(e.target.value)}
                placeholder="Joel: Day of the Lord"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Subtitle (Optional)
              </label>
              <input
                type="text"
                value={newSubtitle}
                onChange={(e) => setNewSubtitle(e.target.value)}
                placeholder="Judgment, Repentance, Restoration"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Introduction (Optional)
            </label>
            <textarea
              rows={2}
              value={newIntroduction}
              onChange={(e) => setNewIntroduction(e.target.value)}
              placeholder="Multi-paragraph orientation to the lesson theme..."
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Estimated Duration (Minutes, Optional)
            </label>
            <input
              type="number"
              min={1}
              max={600}
              value={newEstimatedMinutes}
              onChange={(e) => setNewEstimatedMinutes(e.target.value)}
              placeholder="e.g. 25"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
              Available Learning Levels *
            </label>
            <div className="flex gap-2">
              {(['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as LearningLevel[]).map(
                (lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => toggleLevel(lvl)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      newLevels.includes(lvl)
                        ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-xs'
                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {lvl}
                  </button>
                )
              )}
            </div>
          </div>

          <CoverImageField subject="lesson" value={newLessonCover} onChange={setNewLessonCover} disabled={creatingLesson} />

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => confirmDiscard(Boolean(newLessonTitle.trim() || newShortTitle.trim() || newSubtitle.trim() || newIntroduction.trim() || newEstimatedMinutes || newLessonCover), () => setCreateLessonModalOpen(false))}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creatingLesson}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {creatingLesson && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Create Lesson
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Lesson Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteLessonId)}
        onClose={() => setDeleteLessonId(null)}
        onConfirm={handleDeleteLesson}
        title="Delete Lesson"
        message="Are you sure you want to delete this lesson? Only lessons without publication history can be deleted."
        confirmLabel="Delete"
        isDestructive
        isLoading={deletingLesson}
      />

      {/* Workflow Action Modal */}
      <Modal
        isOpen={Boolean(transitionAction)}
        onClose={() => setTransitionAction(null)}
        title={`Confirm Action: ${transitionAction?.replace(/_/g, ' ')}`}
      >
        <div className="space-y-4">
          {transitionError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {transitionError}
            </div>
          )}

          {transitionAction === 'REQUEST_CHANGES' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Feedback / Change Request Note *
              </label>
              <textarea
                rows={3}
                required
                value={transitionNote}
                onChange={(e) => setTransitionNote(e.target.value)}
                placeholder="Explain what requires adjustments..."
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
              />
            </div>
          )}

          <p className="text-sm text-slate-600">
            Confirm module lifecycle state change.
          </p>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setTransitionAction(null)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleWorkflowTransition}
              disabled={
                transitioning ||
                (transitionAction === 'REQUEST_CHANGES' && !transitionNote.trim())
              }
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {transitioning && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Confirm Transition
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
