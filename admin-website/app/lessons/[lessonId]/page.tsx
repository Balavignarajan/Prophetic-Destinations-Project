'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import {
  LessonSummary,
  LessonBlock,
  LearningLevel,
  WorkflowState,
  WorkflowEvent,
  ReadinessReport,
} from '../../../lib/types';
import { LoadingSpinner, StatusBadge, EmptyState, Modal, ConfirmDialog } from '../../../components/ui';
import { editorTextToRichText, isEditable, richTextToEditorText } from '../../../lib/rich-text';
import { WORKFLOW_ENDPOINT, lessonTransitionBody, type WorkflowAction } from '../../../lib/workflow';
import RichTextEditor from '../../../components/RichTextEditor';
import RichTextView, { hasRichTextContent } from '../../../components/RichTextView';
import ImageBlockDialog from '../../../components/ImageBlockDialog';
import MediaImage from '../../../components/MediaImage';
import { friendlyMediaError, readImageContent } from '../../../lib/image-block';
import { supportsLevelVariants } from '../../../lib/block-capabilities';
import { hasLegacyMarkers, legacyMarkdownToRichText } from '../../../lib/legacy-markdown';
import { validateScriptureReference, CANONICAL_BOOKS, ParseResult } from '../../../lib/scripture';

export default function LessonAuthoringPage() {
  const params = useParams();
  const lessonId = params?.lessonId as string;
  const { user } = useAuth();

  const [lesson, setLesson] = useState<LessonSummary | null>(null);
  const [blocks, setBlocks] = useState<LessonBlock[]>([]);
  const [workflowState, setWorkflowState] = useState<WorkflowState | null>(null);
  const [workflowEvents, setWorkflowEvents] = useState<WorkflowEvent[]>([]);
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active level tab for authoring & preview
  const [selectedLevel, setSelectedLevel] = useState<LearningLevel>('BEGINNER');

  // Preview data
  const [previewData, setPreviewData] = useState<{
    level: LearningLevel;
    blocks: {
      blockId: string;
      type: string;
      ordinal: number;
      source: 'VARIANT' | 'SHARED' | null;
      content: Record<string, unknown> | null;
    }[];
  } | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Edit Lesson Metadata
  const [editLessonModalOpen, setEditLessonModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editShortTitle, setEditShortTitle] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [editIntroduction, setEditIntroduction] = useState('');
  const [editEstimatedMinutes, setEditEstimatedMinutes] = useState<string>('');
  const [updatingMetadata, setUpdatingMetadata] = useState(false);
  const [updateMetaError, setUpdateMetaError] = useState<string | null>(null);

  // Manage Lesson Levels
  const [editLevelsModalOpen, setEditLevelsModalOpen] = useState(false);
  const [editLevels, setEditLevels] = useState<LearningLevel[]>([]);
  const [updatingLevels, setUpdatingLevels] = useState(false);
  const [updateLevelsError, setUpdateLevelsError] = useState<string | null>(null);

  // Block creation
  const [createBlockModalOpen, setCreateBlockModalOpen] = useState(false);
  const [newBlockText, setNewBlockText] = useState('');
  const [newBlockLevels, setNewBlockLevels] = useState<LearningLevel[]>([]);
  const [creatingBlock, setCreatingBlock] = useState(false);
  const [createBlockError, setCreateBlockError] = useState<string | null>(null);

  // Block editing
  const [editingBlock, setEditingBlock] = useState<LessonBlock | null>(null);
  const [editingContentText, setEditingContentText] = useState('');
  const [updatingBlock, setUpdatingBlock] = useState(false);
  const [updateBlockError, setUpdateBlockError] = useState<string | null>(null);

  // Block Level Variant editing
  const [variantModalBlock, setVariantModalBlock] = useState<LessonBlock | null>(null);
  const [variantLevel, setVariantLevel] = useState<LearningLevel>('BEGINNER');
  const [variantMode, setVariantMode] = useState<'shared' | 'variant' | 'hidden'>('shared');
  const [variantText, setVariantText] = useState('');
  const [variantLocked, setVariantLocked] = useState(false);
  const [savingVariant, setSavingVariant] = useState(false);
  const [variantError, setVariantError] = useState<string | null>(null);

  // Image blocks: add or edit without leaving the lesson
  const [imageDialog, setImageDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [savingImage, setSavingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Delete Block
  const [deleteBlockId, setDeleteBlockId] = useState<string | null>(null);
  const [deletingBlock, setDeletingBlock] = useState(false);

  // Scripture reference validator & helper
  const [scriptureModalOpen, setScriptureModalOpen] = useState(false);
  const [scriptureInput, setScriptureInput] = useState('');
  const [scriptureTarget, setScriptureTarget] = useState<'create' | 'edit' | 'variant' | null>(null);
  const [scriptureValidation, setScriptureValidation] = useState<ParseResult | null>(null);

  // Workflow transition
  const [transitionAction, setTransitionAction] = useState<string | null>(null);
  const [transitionNote, setTransitionNote] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const fetchLessonData = useCallback(async () => {
    if (!lessonId) return;
    setLoading(true);
    setError(null);

    try {
      const [lessonRes, blocksRes, wfStateRes, wfEventsRes, readinessRes] =
        await Promise.all([
          api.request<LessonSummary>(`/admin/lessons/${lessonId}`),
          api.request<{ items: LessonBlock[] }>(`/admin/lessons/${lessonId}/blocks`),
          api.request<WorkflowState>(`/admin/lessons/${lessonId}/workflow`),
          api.request<{ items: WorkflowEvent[] }>(
            `/admin/lessons/${lessonId}/workflow/events?limit=10`
          ),
          api.request<ReadinessReport>(`/admin/lessons/${lessonId}/readiness`),
        ]);

      setLesson(lessonRes);
      setBlocks(blocksRes.items);
      setWorkflowState(wfStateRes);
      setWorkflowEvents(wfEventsRes.items);
      setReadiness(readinessRes);

      setEditTitle(lessonRes.title);
      setEditShortTitle(lessonRes.shortTitle || '');
      setEditSubtitle(lessonRes.subtitle || '');
      setEditIntroduction(lessonRes.introduction || '');
      setEditEstimatedMinutes(lessonRes.estimatedMinutes ? String(lessonRes.estimatedMinutes) : '');
      setEditLevels(lessonRes.levels);
      if (lessonRes.levels.length > 0 && !lessonRes.levels.includes(selectedLevel)) {
        setSelectedLevel(lessonRes.levels[0]);
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to load lesson authoring workspace.');
    } finally {
      setLoading(false);
    }
  }, [lessonId, selectedLevel]);

  useEffect(() => {
    fetchLessonData();
  }, [fetchLessonData]);

  // Unsaved changes warning for dirty modal forms
  useEffect(() => {
    const isDirty = Boolean(
      (createBlockModalOpen && newBlockText.trim().length > 0) ||
      (editingBlock && editingContentText.trim().length > 0) ||
      (variantModalBlock && variantMode === 'variant' && variantText.trim().length > 0) ||
      (editLessonModalOpen && lesson && (
        editTitle !== lesson.title ||
        editShortTitle !== (lesson.shortTitle || '') ||
        editSubtitle !== (lesson.subtitle || '') ||
        editIntroduction !== (lesson.introduction || '')
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
  }, [
    createBlockModalOpen,
    newBlockText,
    editingBlock,
    editingContentText,
    variantModalBlock,
    variantMode,
    variantText,
    editLessonModalOpen,
    lesson,
    editTitle,
    editShortTitle,
    editSubtitle,
    editIntroduction,
  ]);

  // Editor text <-> backend RICH_TEXT document. Lossless for bold, italic, links and lists (see lib/rich-text.ts).
  const textToRichTextDoc = (text: string) => editorTextToRichText(text);
  const richTextDocToText = (sharedContent: Record<string, unknown> | null): string => richTextToEditorText(sharedContent);

  const openScriptureModal = (target: 'create' | 'edit' | 'variant') => {
    setScriptureTarget(target);
    setScriptureInput('');
    setScriptureValidation(null);
    setScriptureModalOpen(true);
  };

  const handleValidateScriptureInput = (val: string) => {
    setScriptureInput(val);
    if (!val.trim()) {
      setScriptureValidation(null);
      return;
    }
    const res = validateScriptureReference(val);
    setScriptureValidation(res);
  };

  const handleInsertScripture = () => {
    if (!scriptureValidation || !scriptureValidation.ok) return;
    const refText = `[Scripture: ${scriptureValidation.formatted}]`;

    if (scriptureTarget === 'create') {
      setNewBlockText((prev) => (prev ? `${prev}\n\n${refText}` : refText));
    } else if (scriptureTarget === 'edit') {
      setEditingContentText((prev) => (prev ? `${prev}\n\n${refText}` : refText));
    } else if (scriptureTarget === 'variant') {
      setVariantText((prev) => (prev ? `${prev}\n\n${refText}` : refText));
    }

    setScriptureModalOpen(false);
    setScriptureInput('');
    setScriptureValidation(null);
    setScriptureTarget(null);
  };

  const handleUpdateMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lesson) return;
    setUpdateMetaError(null);
    setUpdatingMetadata(true);

    try {
      const updated = await api.request<LessonSummary>(`/admin/lessons/${lessonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          shortTitle: editShortTitle.trim() || null,
          subtitle: editSubtitle.trim() || null,
          introduction: editIntroduction.trim() || null,
          estimatedMinutes: editEstimatedMinutes ? parseInt(editEstimatedMinutes, 10) : null,
          version: lesson.version,
        }),
      });

      setLesson(updated);
      setEditLessonModalOpen(false);
      fetchLessonData();
    } catch (err: unknown) {
      const e = err as { payload?: { message?: string }; message?: string };
      setUpdateMetaError(e.payload?.message || e.message || 'Failed to update lesson metadata.');
    } finally {
      setUpdatingMetadata(false);
    }
  };

  const handleUpdateLevels = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lesson) return;
    setUpdateLevelsError(null);
    setUpdatingLevels(true);

    try {
      const updated = await api.request<LessonSummary>(
        `/admin/lessons/${lessonId}/levels`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            levels: editLevels,
            version: lesson.version,
          }),
        }
      );

      setLesson(updated);
      setEditLevelsModalOpen(false);
      fetchLessonData();
    } catch (err: unknown) {
      const e = err as { payload?: { message?: string }; message?: string };
      setUpdateLevelsError(e.payload?.message || e.message || 'Failed to replace learning levels.');
    } finally {
      setUpdatingLevels(false);
    }
  };

  const handleCreateBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateBlockError(null);
    setCreatingBlock(true);

    try {
      const doc = textToRichTextDoc(newBlockText);

      await api.request(`/admin/lessons/${lessonId}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'RICH_TEXT',
          sharedContent: doc,
          levels: newBlockLevels.length > 0 ? newBlockLevels : lesson?.levels,
        }),
      });

      setCreateBlockModalOpen(false);
      setNewBlockText('');
      setNewBlockLevels([]);
      fetchLessonData();
    } catch (err: unknown) {
      const e = err as { payload?: { message?: string }; message?: string };
      setCreateBlockError(e.payload?.message || e.message || 'Failed to create lesson block.');
    } finally {
      setCreatingBlock(false);
    }
  };

  const handleUpdateBlockContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBlock) return;
    setUpdateBlockError(null);
    setUpdatingBlock(true);

    try {
      const doc = textToRichTextDoc(editingContentText);

      await api.request(
        `/admin/lessons/${lessonId}/blocks/${editingBlock.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sharedContent: doc,
            version: editingBlock.version,
          }),
        }
      );

      setEditingBlock(null);
      fetchLessonData();
    } catch (err: unknown) {
      const e = err as { payload?: { message?: string }; message?: string };
      setUpdateBlockError(e.payload?.message || e.message || 'Failed to save block content.');
    } finally {
      setUpdatingBlock(false);
    }
  };

  const openImageDialog = (next: { mode: 'create' } | { mode: 'edit'; block: LessonBlock }) => {
    setImageError(null);
    setImageDialog(next);
  };

  const handleSaveImage = async (content: Record<string, string>, levels: LearningLevel[]) => {
    if (!imageDialog) return;
    setSavingImage(true);
    setImageError(null);
    try {
      if (imageDialog.mode === 'create') {
        await api.request(`/admin/lessons/${lessonId}/blocks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'IMAGE',
            sharedContent: content,
            levels: levels.length > 0 ? levels : lesson?.levels,
          }),
        });
      } else {
        await api.request(`/admin/lessons/${lessonId}/blocks/${imageDialog.block.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sharedContent: content, version: imageDialog.block.version }),
        });
      }
      setImageDialog(null);
      fetchLessonData();
    } catch (err: unknown) {
      setImageError(friendlyMediaError(err, 'Could not save the image.'));
    } finally {
      setSavingImage(false);
    }
  };

  const handleDuplicateBlock = async (blockId: string) => {
    try {
      await api.request(`/admin/lessons/${lessonId}/blocks/${blockId}/duplicate`, {
        method: 'POST',
      });
      fetchLessonData();
    } catch (err: unknown) {
      const e = err as { payload?: { message?: string }; message?: string };
      setError(e.payload?.message || e.message || 'Failed to duplicate block.');
    }
  };

  const handleDeleteBlock = async () => {
    if (!deleteBlockId) return;
    setDeletingBlock(true);

    try {
      await api.request(`/admin/lessons/${lessonId}/blocks/${deleteBlockId}`, {
        method: 'DELETE',
      });
      setDeleteBlockId(null);
      fetchLessonData();
    } catch (err: unknown) {
      const e = err as { payload?: { message?: string }; message?: string };
      setError(e.payload?.message || e.message || 'Failed to delete block.');
    } finally {
      setDeletingBlock(false);
    }
  };

  const handleReorderBlocks = async (index: number, direction: 'up' | 'down') => {
    const newBlocks = [...blocks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newBlocks.length) return;

    const temp = newBlocks[index];
    newBlocks[index] = newBlocks[targetIndex];
    newBlocks[targetIndex] = temp;

    try {
      const res = await api.request<{ items: LessonBlock[] }>(
        `/admin/lessons/${lessonId}/blocks/order`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blockIds: newBlocks.map((b) => b.id),
          }),
        }
      );
      setBlocks(res.items);
      fetchLessonData();
    } catch (err: unknown) {
      const e = err as { payload?: { message?: string }; message?: string };
      setError(e.payload?.message || e.message || 'Failed to update block order.');
    }
  };

  const openVariantEditor = (block: LessonBlock, level: LearningLevel) => {
    setVariantModalBlock(block);
    setVariantLevel(level);
    const existingVariant = block.levels.find((l) => l.level === level);
    // A variant seeded from content the editor cannot reproduce exactly is read-only (never silently rewritten).
    setVariantLocked(!isEditable(existingVariant?.content ?? block.sharedContent));
    if (!existingVariant) {
      setVariantMode('hidden');
      setVariantText(richTextDocToText(block.sharedContent));
    } else if (existingVariant.content && supportsLevelVariants(block.type)) {
      setVariantMode('variant');
      setVariantText(richTextDocToText(existingVariant.content));
    } else {
      setVariantMode('shared');
      setVariantText(richTextDocToText(block.sharedContent));
    }
    setVariantError(null);
  };

  const handleSaveVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!variantModalBlock) return;
    setSavingVariant(true);
    setVariantError(null);

    try {
      const isCurrentlyPresent = variantModalBlock.levels.some(
        (l) => l.level === variantLevel
      );

      if (variantMode === 'hidden') {
        if (isCurrentlyPresent) {
          // DELETE /admin/lessons/:lessonId/blocks/:blockId/levels/:level?version=...&discardVariant=true
          await api.request(
            `/admin/lessons/${lessonId}/blocks/${variantModalBlock.id}/levels/${variantLevel}?version=${variantModalBlock.version}&discardVariant=true`,
            {
              method: 'DELETE',
            }
          );
        }
      } else {
        const content = variantMode === 'variant' ? textToRichTextDoc(variantText) : null;

        await api.request(
          `/admin/lessons/${lessonId}/blocks/${variantModalBlock.id}/levels/${variantLevel}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content,
              version: variantModalBlock.version,
            }),
          }
        );
      }

      setVariantModalBlock(null);
      fetchLessonData();
    } catch (err: unknown) {
      const e = err as { payload?: { message?: string }; message?: string };
      setVariantError(e.payload?.message || e.message || 'Failed to update level variant.');
    } finally {
      setSavingVariant(false);
    }
  };

  const handlePreview = async (level: LearningLevel) => {
    setLoadingPreview(true);
    setPreviewModalOpen(true);

    try {
      const res = await api.request<{
        level: LearningLevel;
        blocks: {
          blockId: string;
          type: string;
          ordinal: number;
          source: 'VARIANT' | 'SHARED' | null;
          content: Record<string, unknown> | null;
        }[];
      }>(`/admin/lessons/${lessonId}/preview?level=${level}`);
      setPreviewData(res);
    } catch (err: unknown) {
      const e = err as { payload?: { message?: string }; message?: string };
      setError(e.payload?.message || e.message || 'Failed to load preview.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleWorkflowTransition = async () => {
    if (!transitionAction || !lesson) return;
    setTransitioning(true);
    setTransitionError(null);

    const endpoint = WORKFLOW_ENDPOINT[transitionAction as WorkflowAction];

    try {
      // Backend TransitionDto accepts only { note?, expectedContentRevision? } (forbidNonWhitelisted).
      const body = lessonTransitionBody(transitionAction as WorkflowAction, workflowState, transitionNote);

      await api.request(`/admin/lessons/${lessonId}/workflow/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      setTransitionAction(null);
      setTransitionNote('');
      fetchLessonData();
    } catch (err: unknown) {
      const e = err as { payload?: { message?: string }; message?: string };
      setTransitionError(e.payload?.message || e.message || 'Workflow transition refused.');
    } finally {
      setTransitioning(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading lesson workspace..." />;
  }

  if (!lesson) {
    return (
      <div className="p-8 text-center">
        <h3 className="text-lg font-bold text-slate-800">Lesson Not Found</h3>
        <Link href="/courses" className="mt-4 inline-block text-sm text-amber-700 underline">
          &larr; Return to Curriculum
        </Link>
      </div>
    );
  }

  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';

  return (
    <div className="space-y-8">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Link href="/courses" className="hover:text-slate-800">
          Courses
        </Link>
        <span>/</span>
        <Link
          href={`/courses/${lesson.courseId}/modules/${lesson.moduleId}`}
          className="hover:text-slate-800"
        >
          Module
        </Link>
        <span>/</span>
        <span className="text-slate-800 truncate max-w-xs">{lesson.title}</span>
      </div>

      {/* Main Header / Status Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-serif text-2xl font-bold text-slate-900">
                {lesson.title}
              </h1>
              <StatusBadge status={lesson.status} />
              <span className="text-xs font-mono text-slate-400">v{lesson.version}</span>
            </div>
            {lesson.subtitle && (
              <p className="text-sm font-medium text-slate-600">{lesson.subtitle}</p>
            )}
            <div className="flex items-center gap-3 pt-1 flex-wrap">
              <span className="text-xs text-slate-500 font-medium">Available at:</span>
              {lesson.levels.map((lvl) => (
                <span
                  key={lvl}
                  className="px-2 py-0.5 text-[11px] font-semibold rounded bg-amber-50 text-amber-900 border border-amber-200"
                >
                  {lvl}
                </span>
              ))}
              {canWrite && (
                <button
                  onClick={() => setEditLevelsModalOpen(true)}
                  className="text-xs text-amber-700 hover:underline font-medium"
                >
                  (Adjust Levels)
                </button>
              )}
              {lesson.estimatedMinutes && (
                <span className="text-xs text-slate-500 font-medium">
                  • Est: {lesson.estimatedMinutes} mins
                </span>
              )}
            </div>
            {lesson.introduction && (
              <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200/80 mt-2 max-w-3xl leading-relaxed whitespace-pre-line">
                <strong className="text-slate-700 block mb-0.5">Introduction:</strong>
                {lesson.introduction}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button
              onClick={() => handlePreview(selectedLevel)}
              className="px-3.5 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Learner Preview ({selectedLevel})
            </button>

            {canWrite && (
              <button
                onClick={() => setEditLessonModalOpen(true)}
                className="px-3.5 py-2 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg shadow-xs"
              >
                Edit Metadata
              </button>
            )}
          </div>
        </div>

        {/* Readiness Diagnostic Summary */}
        {readiness && (
          <div className="mt-5 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">Publish Readiness:</span>
                {readiness.ready ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Ready for Publication
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                    {readiness.issues.length} Blocking Issue{readiness.issues.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {readiness.issues.length > 0 && (
              <div className="mt-3 p-3 bg-amber-50/80 border border-amber-200 rounded-lg space-y-1.5">
                {readiness.issues.map((issue, idx) => (
                  <div key={idx} className="text-xs text-amber-900 flex items-start gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span>
                      <strong className="font-semibold">[{issue.code}]</strong> {issue.message}
                      {issue.level && <span className="ml-1 text-amber-700 font-mono">({issue.level})</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Workflow State & Actions */}
        {workflowState && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Actions:
              </span>
              {workflowState.allowedActions.length === 0 ? (
                <span className="text-xs text-slate-400 italic">No transitions available</span>
              ) : (
                workflowState.allowedActions.map((action) => {
                  const labelMap: Record<string, string> = {
                    SUBMIT_FOR_REVIEW: 'Submit for Review',
                    REQUEST_CHANGES: 'Request Changes',
                    APPROVE: 'Approve Lesson',
                    PUBLISH: 'Publish Lesson',
                    UNPUBLISH: 'Unpublish Lesson',
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

      {/* Level Tabs and Blocks Workspace */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 mr-2">
              Authoring Level:
            </span>
            {lesson.levels.map((lvl) => (
              <button
                key={lvl}
                onClick={() => setSelectedLevel(lvl)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  selectedLevel === lvl
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
          {canWrite && (
            <button
              onClick={() => {
                setNewBlockLevels([selectedLevel]);
                setCreateBlockModalOpen(true);
              }}
              className="px-3.5 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-lg flex items-center gap-1.5 shadow-xs"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Rich Text Block
            </button>
          )}
          {canWrite && (
            <button
              onClick={() => openImageDialog({ mode: 'create' })}
              className="px-3.5 py-2 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-900 border border-slate-400 rounded-lg flex items-center gap-1.5 shadow-xs"
            >
              Add Image
            </button>
          )}
          </div>
        </div>

        {/* Blocks Listing */}
        {blocks.length === 0 ? (
          <EmptyState
            title="No Blocks in this Lesson"
            description="Add your first rich text editorial block to begin lesson composition."
            action={
              canWrite ? (
                <button
                  onClick={() => {
                    setNewBlockLevels([selectedLevel]);
                    setCreateBlockModalOpen(true);
                  }}
                  className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg"
                >
                  Add First Block
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            {blocks.map((block, index) => {
              const levelSetting = block.levels.find((l) => l.level === selectedLevel);
              const isVisibleAtSelected = Boolean(levelSetting);
              const hasCustomVariant = Boolean(levelSetting?.content);
              const displayContent = hasCustomVariant ? levelSetting?.content || null : block.sharedContent;

              return (
                <div
                  key={block.id}
                  className={`bg-white border rounded-xl p-5 shadow-xs transition-colors ${
                    isVisibleAtSelected
                      ? 'border-slate-200'
                      : 'border-slate-200/60 bg-slate-50/40 opacity-70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center font-mono">
                        {index + 1}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 uppercase tracking-wider font-mono">
                        {block.type}
                      </span>
                      <span className="text-xs font-mono text-slate-400">v{block.version}</span>
                      {hasCustomVariant && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                          {selectedLevel} Variant
                        </span>
                      )}
                      {!isVisibleAtSelected && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-500">
                          Hidden at {selectedLevel}
                        </span>
                      )}
                    </div>

                    {canWrite && (
                      <div className="flex items-center gap-1">
                        <button
                          disabled={index === 0}
                          onClick={() => handleReorderBlocks(index, 'up')}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                          title="Move block up"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          disabled={index === blocks.length - 1}
                          onClick={() => handleReorderBlocks(index, 'down')}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                          title="Move block down"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Block Content Display */}
                  <div className="py-4 text-sm text-slate-800 leading-relaxed font-serif">
                    {block.type === 'IMAGE' ? (
                      <ImageBlockView content={block.sharedContent} />
                    ) : hasRichTextContent(displayContent) ? (
                      <RichTextView content={displayContent} />
                    ) : (
                      <span className="text-slate-400 italic font-sans text-xs">
                        (Empty block content)
                      </span>
                    )}
                  </div>

                  {/* Level Visibility & Variants Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Visible at:
                      </span>
                      {block.levels.map((blvl) => (
                        <span
                          key={blvl.level}
                          className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-100 text-slate-700"
                        >
                          {blvl.level} {blvl.content ? '★' : ''}
                        </span>
                      ))}
                    </div>

                    {canWrite && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openVariantEditor(block, selectedLevel)}
                          className="px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors"
                        >
                          Configure {selectedLevel} Level
                        </button>
                        <button
                          onClick={() => {
                            if (block.type === 'IMAGE') {
                              openImageDialog({ mode: 'edit', block });
                              return;
                            }
                            setEditingBlock(block);
                            setEditingContentText(richTextDocToText(block.sharedContent));
                          }}
                          className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                          {block.type === 'IMAGE' ? 'Edit Image' : 'Edit Shared'}
                        </button>
                        <button
                          onClick={() => handleDuplicateBlock(block.id)}
                          className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                          title="Duplicate block"
                        >
                          Copy
                        </button>
                        <button
                          onClick={() => setDeleteBlockId(block.id)}
                          className="p-1 text-rose-500 hover:text-rose-700 rounded-lg"
                          title="Delete block"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Lesson Metadata Modal */}
      <Modal
        isOpen={editLessonModalOpen}
        onClose={() => setEditLessonModalOpen(false)}
        title="Edit Lesson Metadata"
        description="Updates lesson title and descriptive properties."
      >
        <form onSubmit={handleUpdateMetadata} className="space-y-4">
          {updateMetaError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {updateMetaError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Title *
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
              Short Title
            </label>
            <input
              type="text"
              value={editShortTitle}
              onChange={(e) => setEditShortTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Subtitle
            </label>
            <input
              type="text"
              value={editSubtitle}
              onChange={(e) => setEditSubtitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Introduction
            </label>
            <textarea
              rows={3}
              value={editIntroduction}
              onChange={(e) => setEditIntroduction(e.target.value)}
              placeholder="Multi-paragraph orientation to the lesson theme..."
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Estimated Duration (Minutes)
            </label>
            <input
              type="number"
              min={1}
              max={600}
              value={editEstimatedMinutes}
              onChange={(e) => setEditEstimatedMinutes(e.target.value)}
              placeholder="e.g. 30"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setEditLessonModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updatingMetadata}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {updatingMetadata && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Save Metadata
            </button>
          </div>
        </form>
      </Modal>

      {/* Replace Levels Modal */}
      <Modal
        isOpen={editLevelsModalOpen}
        onClose={() => setEditLevelsModalOpen(false)}
        title="Adjust Lesson Learning Levels"
        description="Select the full set of learning levels at which this lesson is available."
      >
        <form onSubmit={handleUpdateLevels} className="space-y-4">
          {updateLevelsError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {updateLevelsError}
            </div>
          )}

          <div className="flex gap-2.5">
            {(['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as LearningLevel[]).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => {
                  if (editLevels.includes(lvl)) {
                    setEditLevels(editLevels.filter((l) => l !== lvl));
                  } else {
                    setEditLevels([...editLevels, lvl]);
                  }
                }}
                className={`px-3 py-2 rounded-lg text-xs font-semibold border ${
                  editLevels.includes(lvl)
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setEditLevelsModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updatingLevels || editLevels.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {updatingLevels && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Update Levels
            </button>
          </div>
        </form>
      </Modal>

      {/* Create Block Modal */}
      <Modal
        isOpen={createBlockModalOpen}
        onClose={() => setCreateBlockModalOpen(false)}
        title="Add Rich Text Content Block"
        description="Write lesson content paragraphs. Multiple paragraphs are separated by blank lines."
        maxWidth="lg"
      >
        <form onSubmit={handleCreateBlock} className="space-y-4">
          {createBlockError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {createBlockError}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Content Paragraphs (Rich Text) *
              </label>
              <button
                type="button"
                onClick={() => openScriptureModal('create')}
                className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Insert Scripture Ref
              </button>
            </div>
            <RichTextEditor rows={6} value={newBlockText} onChange={setNewBlockText} placeholder="Enter rich text paragraphs..." />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Visible at Levels:
            </label>
            <div className="flex gap-2">
              {lesson.levels.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => {
                    if (newBlockLevels.includes(lvl)) {
                      setNewBlockLevels(newBlockLevels.filter((l) => l !== lvl));
                    } else {
                      setNewBlockLevels([...newBlockLevels, lvl]);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                    newBlockLevels.includes(lvl)
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setCreateBlockModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creatingBlock || !newBlockText.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {creatingBlock && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Create Block
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Shared Block Content Modal */}
      <Modal
        isOpen={Boolean(editingBlock)}
        onClose={() => setEditingBlock(null)}
        title="Edit Shared Block Content"
        description="Modifying shared content applies to all levels using the shared block."
        maxWidth="lg"
      >
        <form onSubmit={handleUpdateBlockContent} className="space-y-4">
          {updateBlockError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {updateBlockError}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Block Content *
              </label>
              <button
                type="button"
                onClick={() => openScriptureModal('edit')}
                className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Insert Scripture Ref
              </button>
            </div>
            {editingBlock && hasLegacyMarkers(editingBlock.sharedContent) && (
              <div className="mb-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-3">
                <span>This block contains Markdown-style markers (such as **bold** or - lists) stored as plain text. Convert them to real formatting? Review, then Save.</span>
                <button
                  type="button"
                  className="shrink-0 px-2.5 py-1 font-semibold border border-amber-300 rounded bg-white hover:bg-amber-100"
                  onClick={() => {
                    const converted = legacyMarkdownToRichText(editingBlock.sharedContent);
                    if (converted) setEditingContentText(richTextDocToText(converted as unknown as Record<string, unknown>));
                  }}
                >
                  Convert
                </button>
              </div>
            )}
            <RichTextEditor rows={8} value={editingContentText} onChange={setEditingContentText} locked={editingBlock ? !isEditable(editingBlock.sharedContent) : false} />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setEditingBlock(null)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updatingBlock || !editingContentText.trim() || (editingBlock ? !isEditable(editingBlock.sharedContent) : false)}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {updatingBlock && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Save Block
            </button>
          </div>
        </form>
      </Modal>

      {/* Level Variant Modal */}
      <Modal
        isOpen={Boolean(variantModalBlock)}
        onClose={() => setVariantModalBlock(null)}
        title={`Configure ${variantLevel} Level for Block`}
        description="Choose how this block appears for this learning level."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveVariant} className="space-y-4">
          {variantError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {variantError}
            </div>
          )}

          <div className="space-y-2">
            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
              <input
                type="radio"
                name="variantMode"
                checked={variantMode === 'shared'}
                onChange={() => setVariantMode('shared')}
                className="mt-0.5 text-amber-600 focus:ring-amber-500"
              />
              <div>
                <span className="text-xs font-semibold text-slate-800 block">Use Shared Content</span>
                <span className="text-[11px] text-slate-500">
                  Learners at the {variantLevel} level will see the shared lesson block text.
                </span>
              </div>
            </label>

            {variantModalBlock && supportsLevelVariants(variantModalBlock.type) && (
              <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="radio"
                  name="variantMode"
                  checked={variantMode === 'variant'}
                  onChange={() => setVariantMode('variant')}
                  className="mt-0.5 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="text-xs font-semibold text-slate-800 block">
                    Provide Dedicated {variantLevel} Variant
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Provide specialized content specifically rewritten or adapted for {variantLevel} learners.
                  </span>
                </div>
              </label>
            )}

            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
              <input
                type="radio"
                name="variantMode"
                checked={variantMode === 'hidden'}
                onChange={() => setVariantMode('hidden')}
                className="mt-0.5 text-rose-600 focus:ring-rose-500"
              />
              <div>
                <span className="text-xs font-semibold text-rose-700 block">
                  Hide Block at {variantLevel} Level
                </span>
                <span className="text-[11px] text-slate-500">
                  Exclude this block completely when this lesson is studied by a {variantLevel} learner.
                </span>
              </div>
            </label>
          </div>

          {variantModalBlock && !supportsLevelVariants(variantModalBlock.type) && (
            <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
              Level-specific content is not available for {variantModalBlock.type.replace(/_/g, ' ').toLowerCase()} blocks yet
              (pending a product decision), so a block shows the same shared text at every level it is visible at. You can still choose
              here whether it is visible at {variantLevel}.
              {variantModalBlock.levels.some((l) => l.level === variantLevel && l.content) &&
                ' This level currently has a custom variant; choosing "Use Shared Content" replaces it with the shared text.'}
            </p>
          )}

          {variantMode === 'variant' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Variant Content for {variantLevel} Level:
                </label>
                <button
                  type="button"
                  onClick={() => openScriptureModal('variant')}
                  className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  Insert Scripture Ref
                </button>
              </div>
              <RichTextEditor rows={6} value={variantText} onChange={setVariantText} placeholder="Enter variant text..." locked={variantLocked} />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setVariantModalBlock(null)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingVariant || (variantMode === 'variant' && (variantLocked || !supportsLevelVariants(variantModalBlock?.type ?? '')))}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {savingVariant && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Save Level Setting
            </button>
          </div>
        </form>
      </Modal>

      <ImageBlockDialog
        isOpen={imageDialog !== null}
        mode={imageDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initial={imageDialog?.mode === 'edit' ? readImageContent(imageDialog.block.sharedContent) : null}
        saving={savingImage}
        error={imageError}
        onClose={() => setImageDialog(null)}
        onSave={(content, levels) => void handleSaveImage(content, levels)}
      />

      {/* Delete Block Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteBlockId)}
        onClose={() => setDeleteBlockId(null)}
        onConfirm={handleDeleteBlock}
        title="Delete Content Block"
        message="Are you sure you want to remove this block from the lesson? This will reset the lesson status to DRAFT."
        confirmLabel="Delete"
        isDestructive
        isLoading={deletingBlock}
      />

      {/* Learner Preview Modal */}
      <Modal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        title={`Learner Preview: ${selectedLevel} Level`}
        description="Rendered exactly as a learner at this level would view the assembled lesson."
        maxWidth="2xl"
      >
        {loadingPreview ? (
          <LoadingSpinner text="Assembling lesson preview..." />
        ) : !previewData || previewData.blocks.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No visible content blocks for {selectedLevel} level.
          </div>
        ) : (
          <div className="space-y-6 max-h-[60vh] overflow-y-auto px-2">
            <div className="border-b border-slate-200 pb-4">
              <span className="text-xs font-semibold text-amber-700 tracking-wider uppercase">
                {selectedLevel} Level{workflowState?.contentRevision ? ` · Working Revision ${workflowState.contentRevision}` : ''}
              </span>
              <h2 className="font-serif text-2xl font-bold text-slate-900 mt-1">
                {lesson.title}
              </h2>
              {lesson.subtitle && (
                <p className="text-sm text-slate-600 mt-0.5">{lesson.subtitle}</p>
              )}
            </div>

            <div className="space-y-4">
              {previewData.blocks.map((blk) => {
                return (
                  <div key={blk.blockId} className="p-4 bg-slate-50 rounded-lg border border-slate-200/80">
                    {blk.type === 'IMAGE' ? (
                      <ImageBlockView content={blk.content} />
                    ) : (
                      <RichTextView content={blk.content} className="font-serif text-sm leading-relaxed text-slate-800" />
                    )}
                    <div className="mt-2 text-[10px] text-slate-400 font-mono">
                      Block #{blk.ordinal} · Source: {blk.source || 'default'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

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
                placeholder="Detail changes required prior to approval..."
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
              />
            </div>
          )}

          <p className="text-sm text-slate-600">
            {transitionAction === 'PUBLISH' &&
              'Publishing this approved lesson will generate an immutable snapshot for learner delivery.'}
            {transitionAction === 'UNPUBLISH' &&
              'Unpublishing ends the active publication for learners while keeping publication history snapshots intact.'}
            {transitionAction === 'SUBMIT_FOR_REVIEW' &&
              'Submitting for review locks the lesson from further edits until reviewed.'}
            {transitionAction === 'APPROVE' &&
              'Approving confirms editorial review has been satisfied.'}
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

      {/* Scripture Reference Helper Modal */}
      <Modal
        isOpen={scriptureModalOpen}
        onClose={() => setScriptureModalOpen(false)}
        title="Scripture Reference Assistant"
        description="Validate Protestant canon book syntax and verse boundaries before referencing in lesson content."
        maxWidth="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Enter Reference (e.g. Genesis 1:1, John 3:16, Rom 8:28-30)
            </label>
            <input
              type="text"
              value={scriptureInput}
              onChange={(e) => handleValidateScriptureInput(e.target.value)}
              placeholder="e.g. John 3:16"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 font-mono"
            />
          </div>

          {/* Validation Feedback */}
          {scriptureInput.trim() && (
            <div>
              {scriptureValidation && scriptureValidation.ok ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                    <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Canon Syntax Verified: {scriptureValidation.formatted}
                  </div>
                  <div className="text-[11px] text-emerald-700 font-mono">
                    Book: {scriptureValidation.reference.bookId} · Chapter: {scriptureValidation.reference.chapter} · Verse{scriptureValidation.reference.startVerse === scriptureValidation.reference.endVerse ? ` ${scriptureValidation.reference.startVerse}` : `s ${scriptureValidation.reference.startVerse}-${scriptureValidation.reference.endVerse}`}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg space-y-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-rose-800">
                    <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Invalid Scripture Reference
                  </div>
                  <p className="text-xs text-rose-700">
                    {scriptureValidation && !scriptureValidation.ok ? scriptureValidation.message : 'Please check the reference syntax.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Canonical Book Quick List */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Canon Quick Reference (Protestant 66-Book Standard):
            </label>
            <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200 text-[11px]">
              {CANONICAL_BOOKS.map((book) => (
                <button
                  key={book.id}
                  type="button"
                  onClick={() => handleValidateScriptureInput(`${book.id} 1:1`)}
                  className="px-1.5 py-0.5 bg-white border border-slate-200 rounded hover:bg-amber-50 hover:border-amber-300 text-slate-700"
                >
                  {book.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setScriptureModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!scriptureValidation || !scriptureValidation.ok}
              onClick={handleInsertScripture}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              Insert Reference
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** An image block as the author sees it in the lesson: the picture, its caption and source, and a note when it has no description yet. */
function ImageBlockView({ content }: { content: unknown }) {
  const image = readImageContent(content);
  if (!image.mediaId) {
    return <span className="text-slate-600 italic font-sans text-xs">(No image chosen yet)</span>;
  }
  return (
    <figure className="font-sans">
      <MediaImage mediaId={image.mediaId} alt={image.altText} className="max-h-72 w-full rounded-lg border border-slate-200" fit="contain" />
      {image.caption && <figcaption className="mt-2 text-sm text-slate-800">{image.caption}</figcaption>}
      {image.source && <p className="text-xs text-slate-600">Source: {image.source}</p>}
      {!image.altText && <p className="mt-1 text-xs font-medium text-amber-800">No description yet: add alternative text before publishing.</p>}
    </figure>
  );
}
