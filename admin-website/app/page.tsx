'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Course, QuizSummary, MediaAsset, AccountItem } from '../lib/types';
import { LoadingSpinner, StatusBadge } from '../components/ui';

export default function DashboardPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [accountCount, setAccountCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const role = user?.role;

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch courses (available to all read roles)
      const coursesRes = await api.request<{ items: Course[]; total: number }>(
        '/admin/courses?limit=10'
      );
      setCourses(coursesRes.items);

      // Fetch quizzes
      const quizzesRes = await api.request<{ items: QuizSummary[]; total: number }>(
        '/admin/quizzes?limit=5'
      );
      setQuizzes(quizzesRes.items);

      // Fetch media
      const mediaRes = await api.request<{ items: MediaAsset[]; total: number }>(
        '/admin/media?limit=5'
      );
      setMediaAssets(mediaRes.items);

      // Fetch accounts if ADMIN
      if (role === 'ADMIN') {
        const accountsRes = await api.request<{ items: AccountItem[]; total: number }>(
          '/admin/accounts?limit=1'
        );
        setAccountCount(accountsRes.total);
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to load dashboard overview data.');
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  if (loading) {
    return <LoadingSpinner text="Loading curriculum dashboard..." />;
  }

  const publishedCourses = courses.filter((c) => c.status === 'PUBLISHED').length;
  const draftCourses = courses.filter((c) => c.status === 'DRAFT').length;
  const inReviewCourses = courses.filter(
    (c) => c.status === 'READY_FOR_REVIEW' || c.status === 'APPROVED'
  ).length;

  return (
    <div className="space-y-8">
      {/* Editorial Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="font-serif text-3xl font-bold text-slate-900 tracking-tight">
            Editorial Overview
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Welcome back, <span className="font-medium text-slate-800">{user?.email}</span>.
            Role: <span className="font-semibold text-amber-700">{user?.role}</span>
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-3">
          {(user?.role === 'ADMIN' || user?.role === 'EDITOR') && (
            <Link
              href="/courses"
              className="px-4 py-2 text-sm font-medium bg-slate-950 hover:bg-slate-800 text-white rounded-lg shadow-sm transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Manage Curriculum
            </Link>
          )}
          <Link
            href="/media"
            className="px-4 py-2 text-sm font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg shadow-xs transition-colors"
          >
            Media Library
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          {error}
        </div>
      )}

      {/* KPI Cards (derived strictly from backend queries) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Total Loaded Courses
          </p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-serif font-bold text-slate-900">
              {courses.length}
            </span>
            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              {publishedCourses} Published
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            {inReviewCourses} awaiting review / approval · {draftCourses} draft
          </p>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Authoring Quizzes
          </p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-serif font-bold text-slate-900">
              {quizzes.length}
            </span>
            <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              {quizzes.filter((q) => q.status === 'PUBLISHED').length} Published
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Available in Quiz catalog
          </p>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Media Assets
          </p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-serif font-bold text-slate-900">
              {mediaAssets.length}
            </span>
            <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
              Stored
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Strict verified file uploads
          </p>
        </div>

        {user?.role === 'ADMIN' ? (
          <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Staff Accounts
            </p>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-3xl font-serif font-bold text-slate-900">
                {accountCount ?? '—'}
              </span>
              <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                Active Staff
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              ADMIN, EDITOR & REVIEWER roles
            </p>
          </div>
        ) : (
          <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Your Permission Set
            </p>
            <div className="mt-2">
              <span className="text-xl font-serif font-bold text-amber-700">
                {user?.role}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              {user?.role === 'EDITOR'
                ? 'Create, edit & submit curriculum content'
                : 'Review content & request changes'}
            </p>
          </div>
        )}
      </div>

      {/* Recent Courses List */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 font-serif">
              Curriculum Courses
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Available courses and their editorial lifecycle state
            </p>
          </div>
          <Link
            href="/courses"
            className="text-xs font-medium text-amber-700 hover:text-amber-800"
          >
            View all courses &rarr;
          </Link>
        </div>

        {courses.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No courses found. Create your first course in Curriculum.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200/80">
                <tr>
                  <th className="px-6 py-3">Title</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Version</th>
                  <th className="px-6 py-3">Last Modified</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {courses.map((course) => (
                  <tr key={course.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">
                      <div>
                        <span>{course.title}</span>
                        {course.description && (
                          <p className="text-xs text-slate-400 font-normal line-clamp-1 mt-0.5">
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
                      {new Date(course.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/courses/${course.id}`}
                        className="text-xs font-semibold text-amber-700 hover:text-amber-900"
                      >
                        Open Course &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
