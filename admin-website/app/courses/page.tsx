'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Course } from '../../lib/types';
import { LoadingSpinner, StatusBadge, EmptyState, Modal, ConfirmDialog } from '../../components/ui';
import { friendlyError } from '../../lib/ui-messages';

export default function CoursesPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  // Search & filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Create course modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Delete course state
  const [deleteCourseId, setDeleteCourseId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchCourses = useCallback(async () => {
    setLoading(!hasLoadedRef.current);
    setError(null);
    try {
      const res = await api.request<{ items: Course[]; total: number }>(
        '/admin/courses?limit=100'
      );
      setCourses(res.items);
    } catch (err: unknown) {
      setError(friendlyError(err, 'Failed to load courses.'));
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);

    try {
      await api.request('/admin/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim() || null,
        }),
      });

      setCreateModalOpen(false);
      setNewTitle('');
      setNewDescription('');
      setSuccessMessage('Course created.');
      fetchCourses();
    } catch (err: unknown) {
      setCreateError(friendlyError(err, 'Failed to create course.'));
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCourse = async () => {
    if (!deleteCourseId) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      await api.request(`/admin/courses/${deleteCourseId}`, {
        method: 'DELETE',
      });
      setDeleteCourseId(null);
      setSuccessMessage('Course deleted.');
      fetchCourses();
    } catch (err: unknown) {
      setDeleteError(friendlyError(err, 'Failed to delete course. Courses with modules or publication history cannot be deleted.'));
    } finally {
      setDeleting(false);
    }
  };

  const filteredCourses = courses.filter((c) => {
    const matchesSearch =
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';

  return (
    <div className="space-y-6">
      {successMessage && <div role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex justify-between gap-3"><span>{successMessage}</span><button onClick={() => setSuccessMessage(null)} aria-label="Dismiss success message">&times;</button></div>}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-serif text-2xl font-bold text-slate-900">
            Curriculum Courses
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage comprehensive theological courses, modules, and lessons.
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
            Create Course
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
        <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => fetchCourses()} className="px-3 py-1 text-xs font-semibold border border-rose-300 rounded-md hover:bg-rose-100">Retry</button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search courses by title or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
          />
          <svg
            className="w-4 h-4 text-slate-400 absolute left-3 top-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
        >
          <option value="ALL">All Lifecycle Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="READY_FOR_REVIEW">Ready for Review</option>
          <option value="APPROVED">Approved</option>
          <option value="PUBLISHED">Published</option>
        </select>
      </div>

      {/* Courses Table / List */}
      {loading ? (
        <LoadingSpinner text="Fetching course catalog..." />
      ) : error ? null : filteredCourses.length === 0 ? (
        <EmptyState
          title="No Courses Found"
          description={
            courses.length === 0
              ? 'Get started by creating your first course in the curriculum catalog.'
              : 'No courses match your current search criteria.'
          }
          action={
            courses.length === 0 && canWrite ? (
              <button
                onClick={() => setCreateModalOpen(true)}
                className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg"
              >
                Create First Course
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Course Title</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Version</th>
                  <th className="px-6 py-3">Created</th>
                  <th className="px-6 py-3">Updated</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCourses.map((course) => (
                  <tr key={course.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <Link
                          href={`/courses/${course.id}`}
                          className="font-semibold text-slate-900 hover:text-amber-700 transition-colors"
                        >
                          {course.title}
                        </Link>
                        {course.description && (
                          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1 max-w-md">
                            {course.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={course.status} />
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-500">
                      v{course.version}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {new Date(course.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {new Date(course.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/courses/${course.id}`}
                          className="text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-md transition-colors"
                        >
                          View & Edit
                        </Link>
                        {user?.role === 'ADMIN' && (
                          <button
                            onClick={() => setDeleteCourseId(course.id)}
                            className="text-xs font-medium text-rose-600 hover:text-rose-800 p-1 rounded-sm"
                            title="Delete course"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Course Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New Course"
        description="Add a foundational curriculum course."
      >
        <form onSubmit={handleCreateCourse} className="space-y-4">
          {createError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {createError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Course Title *
            </label>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Foundations of Biblical Prophecy"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Description (Optional)
            </label>
            <textarea
              rows={3}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Overview of course themes and objectives..."
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            />
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
              Create Course
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteCourseId)}
        onClose={() => setDeleteCourseId(null)}
        onConfirm={handleDeleteCourse}
        title="Delete Course"
        message="Are you sure you want to delete this course? This action cannot be undone. Only courses without modules and without publication history can be deleted."
        confirmLabel="Delete"
        isDestructive
        isLoading={deleting}
      />
    </div>
  );
}
