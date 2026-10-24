'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { WORKFLOW_ENDPOINT, catalogTransitionBody, type WorkflowAction } from '../../../lib/workflow';
import { useAuth } from '../../../lib/auth';
import AddLessonFlow from '../../../components/AddLessonFlow';
import DirectLessonLists from '../../../components/DirectLessonLists';
import StatusSectionedList from '../../../components/StatusSectionedList';
import { STALE_CATALOG_MESSAGE, actionLabelFor, catalogPublishExplanation, visibleActions } from '../../../lib/review-guidance';
import { Course, CourseBook, ModuleItem, LessonSummary, LearningLevel, WorkflowState, WorkflowEvent } from '../../../lib/types';
import { LoadingSpinner, StatusBadge, EmptyState, Modal, ConfirmDialog } from '../../../components/ui';
import { friendlyError } from '../../../lib/ui-messages';
import DuplicateLessonDialog from '../../../components/DuplicateLessonDialog';
import CoverImageField from '../../../components/CoverImageField';
import CourseBookField from '../../../components/CourseBookField';
import LessonTagsField from '../../../components/LessonTagsField';
import LessonMetadataFields, { EMPTY_LESSON_METADATA, type LessonMetadataValues, durationProblem, lessonMetadataPayload, lessonMetadataTouched } from '../../../components/LessonMetadataFields';

export default function CourseDetailPage() {
  const params = useParams();
  const courseId = params?.courseId as string;
  const { user } = useAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [directLessons, setDirectLessons] = useState<LessonSummary[]>([]);
  const [workflowState, setWorkflowState] = useState<WorkflowState | null>(null);
  const [workflowEvents, setWorkflowEvents] = useState<WorkflowEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  // Edit course metadata
  const [editCourseModalOpen, setEditCourseModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCoverMediaId, setEditCoverMediaId] = useState<string | null>(null);
  const [editBook, setEditBook] = useState<CourseBook | null>(null);
  const [updatingCourse, setUpdatingCourse] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Create Module
  const [createModuleModalOpen, setCreateModuleModalOpen] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [newModuleDescription, setNewModuleDescription] = useState('');
  const [creatingModule, setCreatingModule] = useState(false);
  const [createModuleError, setCreateModuleError] = useState<string | null>(null);

  // Direct course lesson (modules are optional containers).
  const [createLessonModalOpen, setCreateLessonModalOpen] = useState(false);
  const [addLessonFlowOpen, setAddLessonFlowOpen] = useState(false);
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [newLessonCover, setNewLessonCover] = useState<string | null>(null);
  const [newLessonMeta, setNewLessonMeta] = useState<LessonMetadataValues>(EMPTY_LESSON_METADATA);
  const [newLessonTags, setNewLessonTags] = useState<string[]>([]);
  const [newLessonLevels, setNewLessonLevels] = useState<LearningLevel[]>(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
  const [creatingLesson, setCreatingLesson] = useState(false);
  const [createLessonError, setCreateLessonError] = useState<string | null>(null);

  // Delete Module
  const [duplicateTarget, setDuplicateTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleteModuleId, setDeleteModuleId] = useState<string | null>(null);
  const [deletingModule, setDeletingModule] = useState(false);
  const [deleteModuleError, setDeleteModuleError] = useState<string | null>(null);

  // Workflow transition
  const [transitionAction, setTransitionAction] = useState<string | null>(null);
  const [transitionNote, setTransitionNote] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const fetchCourseData = useCallback(async () => {
    if (!courseId) return;
    setLoading(!hasLoadedRef.current);
    setError(null);

    try {
      const [courseRes, modulesRes, directLessonsRes, wfStateRes, wfEventsRes] = await Promise.all([
        api.request<Course>(`/admin/courses/${courseId}`),
        api.request<{ items: ModuleItem[] }>(`/admin/courses/${courseId}/modules`),
        api.request<{ items: LessonSummary[] }>(`/admin/courses/${courseId}/lessons`),
        api.request<WorkflowState>(`/admin/courses/${courseId}/workflow`),
        api.request<{ items: WorkflowEvent[] }>(`/admin/courses/${courseId}/workflow/events?limit=10`),
      ]);

      setCourse(courseRes);
      setModules(modulesRes.items);
      setDirectLessons(directLessonsRes.items);
      setWorkflowState(wfStateRes);
      setWorkflowEvents(wfEventsRes.items);
      setEditTitle(courseRes.title);
      setEditCoverMediaId(courseRes.coverMediaId ?? null);
      setEditBook(courseRes.book ?? null);
      setEditDescription(courseRes.description || '');
    } catch (err: unknown) {
      setError(friendlyError(err, 'Failed to load course details.'));
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchCourseData();
  }, [fetchCourseData]);

  // Unsaved changes protection
  useEffect(() => {
    const isDirty = Boolean(
      (createModuleModalOpen && newModuleTitle.trim().length > 0) ||
      (editCourseModalOpen && course && (
        editTitle !== course.title ||
        editDescription !== (course.description || '') ||
        editCoverMediaId !== (course.coverMediaId ?? null) ||
        editBook !== (course.book ?? null)
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
  }, [createModuleModalOpen, newModuleTitle, editCourseModalOpen, course, editTitle, editDescription, editCoverMediaId, editBook]);

  const confirmDiscard = (hasChanges: boolean, close: () => void) => {
    if (!hasChanges || window.confirm('Discard your unsaved changes?')) close();
  };

  const handleUpdateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!course) return;
    setUpdateError(null);
    setUpdatingCourse(true);

    try {
      const updated = await api.request<Course>(`/admin/courses/${courseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          coverMediaId: editCoverMediaId,
          book: editBook,
          version: course.version,
        }),
      });

      setCourse(updated);
      setEditCourseModalOpen(false);
      setSuccessMessage('Course details saved.');
      fetchCourseData();
    } catch (err: unknown) {
      setUpdateError(friendlyError(err, 'Failed to update course.'));
    } finally {
      setUpdatingCourse(false);
    }
  };

  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateModuleError(null);
    setCreatingModule(true);

    try {
      await api.request(`/admin/courses/${courseId}/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newModuleTitle.trim(),
          description: newModuleDescription.trim() || null,
        }),
      });

      setCreateModuleModalOpen(false);
      setNewModuleTitle('');
      setNewModuleDescription('');
      setSuccessMessage('Module created.');
      fetchCourseData();
    } catch (err: unknown) {
      setCreateModuleError(friendlyError(err, 'Failed to create module.'));
    } finally {
      setCreatingModule(false);
    }
  };

  const handleCreateDirectLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingLesson) return;
    if (!newLessonLevels.length) { setCreateLessonError('Choose at least one learning level.'); return; }
    const durationError = durationProblem(newLessonMeta.estimatedMinutes);
    if (durationError) { setCreateLessonError(durationError); return; }
    setCreatingLesson(true); setCreateLessonError(null);
    try {
      // Everything is saved by this one create request (no second update); a failure keeps every entered value and the chosen cover.
      await api.request(`/admin/courses/${courseId}/lessons`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newLessonTitle.trim(), ...lessonMetadataPayload(newLessonMeta), ...(newLessonTags.length > 0 ? { tags: newLessonTags } : {}), levels: newLessonLevels, ...(newLessonCover ? { coverMediaId: newLessonCover } : {}) }) });
      setCreateLessonModalOpen(false); setNewLessonTitle(''); setNewLessonCover(null); setNewLessonMeta(EMPTY_LESSON_METADATA); setNewLessonTags([]); setSuccessMessage('Lesson added directly to this course.'); fetchCourseData();
    } catch (err: unknown) { setCreateLessonError(friendlyError(err, 'Failed to add lesson.')); }
    finally { setCreatingLesson(false); }
  };

  const handleDeleteModule = async () => {
    if (!deleteModuleId) return;
    setDeletingModule(true);
    setDeleteModuleError(null);

    try {
      await api.request(`/admin/courses/${courseId}/modules/${deleteModuleId}`, {
        method: 'DELETE',
      });
      setDeleteModuleId(null);
      setSuccessMessage('Module deleted.');
      fetchCourseData();
    } catch (err: unknown) {
      setDeleteModuleError(friendlyError(err, 'Failed to delete module. Modules with lessons or publication history cannot be deleted.'));
    } finally {
      setDeletingModule(false);
    }
  };

  const handleWorkflowTransition = async () => {
    if (!transitionAction || !course) return;
    setTransitioning(true);
    setTransitionError(null);

    const endpoint = WORKFLOW_ENDPOINT[transitionAction as WorkflowAction];

    try {
      // Backend CatalogTransitionDto accepts only { note?, expectedVersion? } (forbidNonWhitelisted).
      const body = catalogTransitionBody(transitionAction as WorkflowAction, workflowState, transitionNote);

      await api.request(`/admin/courses/${courseId}/workflow/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      setTransitionAction(null);
      setTransitionNote('');
      setSuccessMessage('Course status updated.');
      fetchCourseData();
    } catch (err: unknown) {
      if ((err as { status?: number }).status === 409) {
        // Nothing was changed. The note the user typed is kept; the page data is refreshed so the next try uses the current version.
        setTransitionError(friendlyError(err, STALE_CATALOG_MESSAGE));
        fetchCourseData();
      } else {
        setTransitionError(friendlyError(err, 'This status change could not be completed.'));
      }
    } finally {
      setTransitioning(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading course details..." />;
  }

  if (!course) {
    return (
      <div className="p-8 text-center">
        <h3 className="text-lg font-bold text-slate-800">{error ? 'Course could not be loaded' : 'Course Not Found'}</h3>
        <p className="mt-2 text-sm text-slate-600">{error || 'This course may have been removed.'}</p>
        {error ? <button onClick={() => fetchCourseData()} className="mt-4 px-3 py-1.5 text-sm font-semibold text-white bg-slate-900 rounded-lg">Retry</button> : <Link href="/courses" className="mt-4 inline-block text-sm text-amber-700 underline">&larr; Back to Courses</Link>}
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
          <button onClick={() => fetchCourseData()} className="px-3 py-1 text-xs font-semibold border border-rose-300 rounded-md hover:bg-rose-100">Retry</button>
        </div>
      )}
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Link href="/courses" className="hover:text-slate-800">
          Courses
        </Link>
        <span>/</span>
        <span className="text-slate-800 truncate max-w-xs">{course.title}</span>
      </div>

      {/* Main Course Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="font-serif text-2xl font-bold text-slate-900">
                {course.title}
              </h1>
              <StatusBadge status={course.status} />
              <span className="text-xs font-mono text-slate-400">v{course.version}</span>
            </div>
            {course.description && (
              <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
                {course.description}
              </p>
            )}
            <div className="flex items-center gap-4 text-xs text-slate-400 pt-1">
              <span>Created: {new Date(course.createdAt).toLocaleDateString()}</span>
              <span>•</span>
              <span>Updated: {new Date(course.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canWrite && (
              <button
                onClick={() => setEditCourseModalOpen(true)}
                className="px-3.5 py-2 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg shadow-xs"
              >
                Edit Course Details
              </button>
            )}
          </div>
        </div>

        {/* Workflow Action Bar */}
        {workflowState && (
          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Workflow Actions:
              </span>
              {visibleActions(workflowState.allowedActions, user?.role).length === 0 ? (
                <span className="text-xs text-slate-400 italic">No transitions available for your role</span>
              ) : (
                visibleActions(workflowState.allowedActions, user?.role).map((action) => {
                  const labelMap: Record<string, string> = {
                    SUBMIT_FOR_REVIEW: 'Submit for Review',
                    REQUEST_CHANGES: 'Request Changes',
                    APPROVE: 'Approve Course',
                    PUBLISH: actionLabelFor('PUBLISH', Boolean(workflowState.published)),
                    UNPUBLISH: 'Unpublish Catalog',
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

            <Link
              href={`/publishing`}
              className="text-xs font-medium text-amber-700 hover:underline"
            >
              Catalog Consistency Check &rarr;
            </Link>
          </div>
        )}
      </div>

      {deleteModuleError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start justify-between">
          <span>{deleteModuleError}</span>
          <button onClick={() => setDeleteModuleError(null)} className="text-rose-500 font-bold ml-2">
            &times;
          </button>
        </div>
      )}

      {/* Direct lessons: Published (ordered by drag and drop), In review, Draft. */}
      <DirectLessonLists
        courseId={courseId}
        lessons={directLessons}
        canWrite={canWrite}
        onAddLesson={() => setAddLessonFlowOpen(true)}
        onDuplicate={setDuplicateTarget}
        onSaved={setDirectLessons}
        onReload={() => fetchCourseData()}
        onPublishCatalog={workflowState?.allowedActions.includes('PUBLISH') ? () => setTransitionAction('PUBLISH') : undefined}
      />

      {/* Modules Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-xl font-bold text-slate-900">
              Curriculum Modules
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Modules are optional groups of lessons.
            </p>
          </div>

          {canWrite && (
            <button
              onClick={() => setCreateModuleModalOpen(true)}
              className="px-3.5 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-lg flex items-center gap-1.5 shadow-xs"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Module
            </button>
          )}
        </div>

        {modules.length === 0 ? (
          <EmptyState
            title="No modules yet"
            description="Modules are optional groups of lessons. You can add one whenever it helps organize this course."
            action={
              canWrite ? (
                <button
                  onClick={() => setCreateModuleModalOpen(true)}
                  className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg"
                >
                  Add module
                </button>
              ) : undefined
            }
          />
        ) : (
          <StatusSectionedList
            noun="module"
            items={modules}
            canWrite={canWrite}
            listLabel="Curriculum modules, in order"
            itemLabel={(mod) => `module ${mod.title}`}
            save={async (ids, previousIds) =>
              (await api.request<{ items: ModuleItem[] }>(`/admin/courses/${courseId}/modules/order`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ moduleIds: ids, previousModuleIds: previousIds }),
              })).items
            }
            onSaved={(items) => {
              setModules(items);
              fetchCourseData();
            }}
            onReload={() => fetchCourseData()}
            savedNote="Order saved. The module order is part of the course, so a published course returns to Draft. Learners keep seeing the previously published order until the course is published again."
            onPublish={workflowState?.allowedActions.includes('PUBLISH') ? () => setTransitionAction('PUBLISH') : undefined}
            renderItem={(mod) => (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <Link href={`/courses/${courseId}/modules/${mod.id}`} className="font-semibold text-base text-slate-900 hover:text-amber-700 transition-colors">
                      {mod.title}
                    </Link>
                    <StatusBadge status={mod.status} />
                    <span className="text-xs font-mono text-slate-400">v{mod.version}</span>
                  </div>
                  {mod.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2 max-w-xl">{mod.description}</p>}
                </div>
                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <Link href={`/courses/${courseId}/modules/${mod.id}`} className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1">
                    <span>Lessons</span>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                  {canWrite && (
                    <button onClick={() => setDeleteModuleId(mod.id)} className="text-xs font-medium text-rose-600 hover:text-rose-800 p-1.5" title="Delete module" aria-label={`Delete module ${mod.title}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            )}
          />
        )}
      </div>

      {/* Workflow History Audit Trail */}
      {workflowEvents.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
          <h3 className="font-serif text-base font-bold text-slate-900">
            Course Workflow History
          </h3>
          <div className="divide-y divide-slate-100">
            {workflowEvents.map((evt) => (
              <div key={evt.id} className="py-3 flex items-start justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">{evt.action}</span>
                    <span className="text-slate-400">
                      ({evt.fromStatus} &rarr; {evt.toStatus})
                    </span>
                  </div>
                  {evt.note && (
                    <p className="text-slate-600 mt-1 italic">&ldquo;{evt.note}&rdquo;</p>
                  )}
                </div>
                <span className="text-slate-400">
                  {new Date(evt.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Course Modal */}
      <Modal
        isOpen={editCourseModalOpen}
        onClose={() => confirmDiscard(editTitle !== course.title || editDescription !== (course.description || '') || editCoverMediaId !== (course.coverMediaId ?? null) || editBook !== (course.book ?? null), () => setEditCourseModalOpen(false))}
        title="Edit Course Details"
        maxWidth="xl"
        description="Saving changes returns this course to Draft, so it must be reviewed again before publishing."
      >
        <form onSubmit={handleUpdateCourse} className="space-y-4">
          {updateError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {updateError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Course Title *
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

          <CoverImageField subject="course" mode="edit" saveLabel="Save Changes" value={editCoverMediaId} onChange={setEditCoverMediaId} disabled={updatingCourse} />

          <CourseBookField id="edit-course-book" value={editBook} onChange={setEditBook} disabled={updatingCourse} />

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => confirmDiscard(editTitle !== course.title || editDescription !== (course.description || '') || editCoverMediaId !== (course.coverMediaId ?? null) || editBook !== (course.book ?? null), () => setEditCourseModalOpen(false))}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updatingCourse}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {updatingCourse && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </Modal>

      <DuplicateLessonDialog
        lesson={duplicateTarget}
        destination={`${course?.title ?? 'This course'} (directly in the course)`}
        onClose={() => setDuplicateTarget(null)}
      />

      <AddLessonFlow
        isOpen={addLessonFlowOpen}
        onClose={() => setAddLessonFlowOpen(false)}
        destination={{ courseId }}
        destinationLabel="this course"
        onCreateNew={() => setCreateLessonModalOpen(true)}
      />

      <Modal isOpen={createLessonModalOpen} onClose={() => confirmDiscard(Boolean(newLessonTitle.trim() || newLessonCover || newLessonTags.length > 0 || lessonMetadataTouched(newLessonMeta)), () => setCreateLessonModalOpen(false))} title="Add lesson" description="Add a lesson directly to this course. Modules are optional groups of lessons.">
        <form onSubmit={handleCreateDirectLesson} className="space-y-4">
          {createLessonError && <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">{createLessonError}</div>}
          <div><label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Lesson title *</label><input required value={newLessonTitle} onChange={(e) => setNewLessonTitle(e.target.value)} disabled={creatingLesson} className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm" /></div>
          <LessonMetadataFields idPrefix="direct-lesson" values={newLessonMeta} onChange={setNewLessonMeta} disabled={creatingLesson} />
          <LessonTagsField value={newLessonTags} onChange={setNewLessonTags} disabled={creatingLesson} />
          <div><span className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">Available learning levels *</span><div className="flex flex-wrap gap-2">{(['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as LearningLevel[]).map((level) => <button key={level} type="button" onClick={() => setNewLessonLevels((current) => current.includes(level) ? current.filter((item) => item !== level) : [...current, level])} className={`px-3 py-2 rounded-lg text-xs font-semibold border ${newLessonLevels.includes(level) ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-white text-slate-600 border-slate-200'}`}>{level}</button>)}</div></div>
          <CoverImageField subject="lesson" mode="create" saveLabel="Add lesson" value={newLessonCover} onChange={setNewLessonCover} disabled={creatingLesson} />
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100"><button type="button" onClick={() => confirmDiscard(Boolean(newLessonTitle.trim() || newLessonCover || newLessonTags.length > 0 || lessonMetadataTouched(newLessonMeta)), () => setCreateLessonModalOpen(false))} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg">Cancel</button><button type="submit" disabled={creatingLesson} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg disabled:opacity-50">{creatingLesson ? 'Adding…' : 'Add lesson'}</button></div>
        </form>
      </Modal>

      {/* Create Module Modal */}
      <Modal
        isOpen={createModuleModalOpen}
        onClose={() => confirmDiscard(Boolean(newModuleTitle.trim() || newModuleDescription.trim()), () => setCreateModuleModalOpen(false))}
        title="Add Course Module"
        description="Add a curriculum module under this course."
      >
        <form onSubmit={handleCreateModule} className="space-y-4">
          {createModuleError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {createModuleError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Module Title *
            </label>
            <input
              type="text"
              required
              value={newModuleTitle}
              onChange={(e) => setNewModuleTitle(e.target.value)}
              placeholder="e.g. Module 1: The Covenant Framework"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Description (Optional)
            </label>
            <textarea
              rows={3}
              value={newModuleDescription}
              onChange={(e) => setNewModuleDescription(e.target.value)}
              placeholder="Outline of module curriculum topics..."
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => confirmDiscard(Boolean(newModuleTitle.trim() || newModuleDescription.trim()), () => setCreateModuleModalOpen(false))}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creatingModule}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {creatingModule && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Create Module
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Module Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteModuleId)}
        onClose={() => setDeleteModuleId(null)}
        onConfirm={handleDeleteModule}
        title="Delete Module"
        message="Are you sure you want to delete this module? Only modules without lessons or publication history can be deleted."
        confirmLabel="Delete"
        isDestructive
        isLoading={deletingModule}
      />

      {/* Workflow Action Modal */}
      <Modal
        isOpen={Boolean(transitionAction)}
        onClose={() => setTransitionAction(null)}
        title={`Confirm Action: ${transitionAction?.replace(/_/g, ' ')}`}
        description="Verify this transition. Backend authorization rules will strictly enforce state transitions."
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
                placeholder="Explain what needs revision prior to approval..."
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
              />
            </div>
          )}

          <p className="text-sm text-slate-600">
            {transitionAction === 'PUBLISH' && catalogPublishExplanation('course', Boolean(workflowState?.published))}
            {transitionAction === 'UNPUBLISH' &&
              'Unpublishing will remove this course from learner catalog availability.'}
            {transitionAction === 'APPROVE' &&
              'Approving indicates content review has been completed and verified.'}
            {transitionAction === 'SUBMIT_FOR_REVIEW' &&
              'Submitting moves this course from DRAFT to READY_FOR_REVIEW.'}
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
              {transitionAction === 'PUBLISH' ? actionLabelFor('PUBLISH', Boolean(workflowState?.published)) : 'Confirm Transition'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
