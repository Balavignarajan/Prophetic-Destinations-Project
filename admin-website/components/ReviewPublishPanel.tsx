'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { friendlyBlockName } from '../lib/block-catalog';
import {
  ACTION_EXPLANATION,
  actionLabelFor,
  visibleActions,
  GENERAL_NOTES,
  type LessonStatus,
  type LevelVisibility,
  STATUS_LABEL,
  VISIBILITY_TEXT,
  catalogListsLesson,
  groupIssues,
  noActionExplanation,
  statusExplanation,
} from '../lib/review-guidance';
import type { LearningLevel, LessonBlock, ReadinessReport, WorkflowState } from '../lib/types';
import { friendlyError, readableLevel, readinessMessage } from '../lib/ui-messages';
import { StatusBadge } from './ui';

interface PublicationInfo {
  version: number;
  active: boolean;
  publishedAt: string;
  sourceContentRevision: number;
  levels: { level: LearningLevel }[];
}
interface CatalogInfo {
  version: number;
  active: boolean;
  levels: { level: LearningLevel }[];
}

interface Props {
  lessonId: string;
  courseId: string;
  workflowState: WorkflowState | null;
  blocks: LessonBlock[];
  /** Changes whenever the lesson content or status changed, so the checks are repeated. */
  refreshKey: string;
  /** Opens the confirmation for a workflow action. */
  onAction: (action: string) => void;
  /** Scrolls to and focuses a block. */
  onGoToBlock: (blockId: string, level?: LearningLevel) => void;
  /** Opens the existing editor of a block. */
  onEditBlock: (blockId: string) => void;
  canWrite: boolean;
  /** The signed-in role: administrators publish directly, so the review steps are not offered to them. */
  role?: string | null;
  /** Told every time the readiness result changes, so other views (the level coverage table) can show it without asking the server again. */
  onReadiness?: (state: { report: ReadinessReport | null; failed: string | null; checking: boolean }) => void;
}

const LINK_BTN = 'px-2 py-1 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

const typeName = friendlyBlockName;

/**
 * The review-and-publish part of the lesson page: where the lesson is in the workflow, what each step does, what still needs fixing (grouped
 * by lesson and by learning level, with a way to jump to the exact block the server named), and what learners can actually see. It reuses the
 * existing readiness, workflow, publication and catalog endpoints and the existing block editors; it adds no rule. Previous results stay on
 * screen while the checks repeat, and a failed request is shown as a failure, not as "no problems".
 */
export default function ReviewPublishPanel({ lessonId, courseId, workflowState, blocks, refreshKey, onAction, onGoToBlock, onEditBlock, canWrite, role, onReadiness }: Props) {
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [reportFailed, setReportFailed] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [publication, setPublication] = useState<PublicationInfo | null | undefined>(undefined);
  const [visibility, setVisibility] = useState<LevelVisibility[] | null>(null);
  const [visibilityNote, setVisibilityNote] = useState<string | null>(null);
  const runRef = useRef(0);

  const check = useCallback(async () => {
    const run = ++runRef.current;
    setChecking(true);
    // 1. Readiness (its own request, so a failure here is reported as a failure).
    try {
      const next = await api.request<ReadinessReport>(`/admin/lessons/${lessonId}/readiness`);
      if (run === runRef.current) {
        setReport(next);
        setReportFailed(null);
      }
    } catch (err: unknown) {
      if (run === runRef.current) setReportFailed(friendlyError(err, 'The publishing checks could not be run.'));
    }
    // 2. What is published and who can see it (existing history endpoints; any failure means "could not be checked", never a guess).
    try {
      const pubs = await api.request<{ items: PublicationInfo[] }>(`/admin/lessons/${lessonId}/publications?limit=20`);
      const active = pubs.items.find((p) => p.active) ?? null;
      if (run !== runRef.current) return;
      setPublication(active);
      if (!active) {
        setVisibility([]);
        setVisibilityNote(null);
        return;
      }
      let catalog: CatalogInfo | null = null;
      const cats = await api.request<{ items: CatalogInfo[] }>(`/admin/courses/${courseId}/publications?limit=20`);
      catalog = cats.items.find((c) => c.active) ?? null;
      const results: LevelVisibility[] = [];
      for (const { level } of active.levels) {
        if (!catalog) {
          results.push({ level, kind: 'COURSE_NOT_PUBLISHED' });
          continue;
        }
        if (!catalog.levels.some((l) => l.level === level)) {
          results.push({ level, kind: 'NOT_IN_CATALOG' });
          continue;
        }
        try {
          const snap = await api.request<{ content: unknown }>(`/admin/courses/${courseId}/publications/${catalog.version}/levels/${level}`);
          results.push({ level, kind: catalogListsLesson(snap.content, lessonId) ? 'VISIBLE' : 'NOT_IN_CATALOG' });
        } catch {
          results.push({ level, kind: 'UNKNOWN' });
        }
      }
      if (run === runRef.current) {
        setVisibility(results);
        setVisibilityNote(null);
      }
    } catch {
      if (run === runRef.current) {
        setVisibility(null);
        setVisibilityNote('Who can see this lesson could not be checked right now. Try "Check again".');
      }
    } finally {
      if (run === runRef.current) setChecking(false);
    }
  }, [lessonId, courseId]);

  useEffect(() => {
    void check();
  }, [check, refreshKey]);

  useEffect(() => {
    onReadiness?.({ report, failed: reportFailed, checking });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, reportFailed, checking]);

  const status = (workflowState?.status ?? 'DRAFT') as LessonStatus;
  const actions = visibleActions(workflowState?.allowedActions ?? [], role);
  const hasPublished = Boolean(workflowState?.activePublication);
  const groups = report ? groupIssues(report.issues) : [];
  const blockInfo = (id?: string) => {
    if (!id) return null;
    const index = blocks.findIndex((b) => b.id === id);
    return index < 0 ? null : { block: blocks[index], position: index + 1 };
  };
  const workingChanged = publication && workflowState?.contentRevision !== undefined && workflowState.contentRevision !== publication.sourceContentRevision;

  return (
    <div className="mt-5 pt-4 border-t border-slate-100 space-y-5" aria-busy={checking}>
      <h2 id="review-panel-heading" tabIndex={-1} className="text-sm font-semibold text-slate-900 focus:outline-hidden">
        Review and publishing
      </h2>

      {/* Where the lesson is */}
      <section aria-labelledby="rp-status" className="space-y-2">
        <h3 id="rp-status" className="text-xs font-semibold uppercase tracking-wider text-slate-600">Where this lesson is now</h3>
        <p className="text-sm text-slate-800 flex flex-wrap items-center gap-2">
          <StatusBadge status={status} /> <strong>{STATUS_LABEL[status]}</strong>
        </p>
        <p className="text-sm text-slate-700">{statusExplanation(status)}</p>
        <ul className="list-disc pl-5 text-xs text-slate-700 space-y-0.5">
          {GENERAL_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>

      {/* What can be done */}
      <section aria-labelledby="rp-actions" className="space-y-2">
        <h3 id="rp-actions" className="text-xs font-semibold uppercase tracking-wider text-slate-600">What you can do</h3>
        {actions.length === 0 ? (
          <p className="text-sm text-slate-700">{noActionExplanation(status)}</p>
        ) : (
          <ul className="space-y-2">
            {actions.map((action) => (
              <li key={action} className="flex flex-wrap items-start gap-3">
                <button
                  type="button"
                  onClick={() => onAction(action)}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                >
                  {actionLabelFor(action, hasPublished)}
                </button>
                <span className="min-w-0 flex-1 text-xs text-slate-700">{ACTION_EXPLANATION[action]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Readiness */}
      <section aria-labelledby="rp-ready" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="rp-ready" className="text-xs font-semibold uppercase tracking-wider text-slate-600">Publishing checks (for the working copy)</h3>
          <button type="button" className={LINK_BTN} onClick={() => void check()} disabled={checking}>
            {checking ? 'Checking…' : 'Check again'}
          </button>
        </div>
        <p role="status" className="sr-only">{checking ? 'Checking the lesson' : 'Checks finished'}</p>

        {reportFailed && (
          <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
            <p className="font-semibold">The checks could not be run</p>
            <p>{reportFailed} This is not the same as &ldquo;no problems found&rdquo;. {report ? 'The result below is from the last successful check.' : ''}</p>
          </div>
        )}

        {report === null ? (
          !reportFailed && <p className="text-sm text-slate-700">Running the checks…</p>
        ) : report.ready ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <strong>No problems found.</strong> The working copy meets the publishing checks as it is now. This says nothing yet about review or approval.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-amber-900">
              <strong>{report.issues.length} {report.issues.length === 1 ? 'thing needs' : 'things need'} fixing before this lesson can be published.</strong>
            </p>
            {groups.map((group) => (
              <div key={group.level ?? 'lesson'} className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
                <h4 className="text-xs font-semibold text-amber-900 mb-1.5">
                  {group.level ? `For ${readableLevel(group.level)} learners` : 'About the whole lesson'}
                </h4>
                <ul className="space-y-2.5">
                  {group.issues.map((issue, index) => {
                    const info = blockInfo(issue.blockId);
                    const problems = issue.problems?.map((p) => p.message).filter(Boolean) ?? [];
                    return (
                      <li key={`${issue.code}-${issue.blockId ?? 'x'}-${index}`} className="text-sm text-amber-950">
                        {info && (
                          <p className="text-xs font-semibold text-amber-900">
                            Block {info.position} &middot; {typeName(info.block.type)}
                          </p>
                        )}
                        {problems.length > 0 ? (
                          <ul className="list-disc pl-5 space-y-0.5">
                            {problems.map((message) => (
                              <li key={message}>{message}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>{readinessMessage(issue)}</p>
                        )}
                        {info && (
                          <div className="mt-1 flex flex-wrap gap-2">
                            <button type="button" className={LINK_BTN} onClick={() => onGoToBlock(info.block.id, issue.level)} aria-label={`Go to block ${info.position}, ${typeName(info.block.type)}`}>
                              Go to content
                            </button>
                            {canWrite && (
                              <button type="button" className={LINK_BTN} onClick={() => onEditBlock(info.block.id)} aria-label={`Edit block ${info.position}, ${typeName(info.block.type)}`}>
                                Edit this block
                              </button>
                            )}
                          </div>
                        )}
                        <details className="mt-1 text-xs text-amber-800">
                          <summary className="cursor-pointer underline">Technical details</summary>
                          <p className="mt-0.5">{issue.code}: {issue.message}</p>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Published vs working */}
      <section aria-labelledby="rp-published" className="space-y-2">
        <h3 id="rp-published" className="text-xs font-semibold uppercase tracking-wider text-slate-600">What is published, and who can see this lesson</h3>
        <p className="text-xs text-slate-700">
          The learner preview on this page shows your <strong>working copy</strong>, not the published version. Publishing the lesson and including it in
          the course&rsquo;s published catalog are two separate steps: learners see a lesson only when both are done. The lesson&rsquo;s cover image and related
          lessons are published together with the lesson.
        </p>
        {publication === undefined ? (
          <p className="text-sm text-slate-700">Checking what is published…</p>
        ) : publication === null ? (
          visibilityNote ? (
            <p className="text-sm text-amber-900">{visibilityNote}</p>
          ) : (
            <p className="text-sm text-slate-800">This lesson has no published version. Learners cannot see it.</p>
          )
        ) : (
          <div className="space-y-1.5">
            <p className="text-sm text-slate-800">
              Published version {publication.version}, on {new Date(publication.publishedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}, at{' '}
              {publication.levels.map((l) => readableLevel(l.level)).join(', ') || 'no levels'}.
            </p>
            {workingChanged && (
              <p className="text-sm text-amber-900">The working copy has changes that are not published. Learners still see version {publication.version}.</p>
            )}
            {visibility && visibility.length > 0 ? (
              <ul className="space-y-0.5 text-sm text-slate-800">
                {visibility.map((v) => (
                  <li key={v.level}>
                    <strong>{readableLevel(v.level)}:</strong> {VISIBILITY_TEXT[v.kind]}
                  </li>
                ))}
              </ul>
            ) : (
              visibilityNote && <p className="text-sm text-amber-900">{visibilityNote}</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
