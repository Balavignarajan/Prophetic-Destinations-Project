'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  Course,
} from '../../../lib/types';
import { LoadingSpinner, StatusBadge, EmptyState, Modal, ConfirmDialog } from '../../../components/ui';
import { editorTextToRichText, isEditable, richTextToEditorText } from '../../../lib/rich-text';
import { WORKFLOW_ENDPOINT, lessonTransitionBody, type WorkflowAction } from '../../../lib/workflow';
import RichTextEditor from '../../../components/RichTextEditor';
import RichTextView, { hasRichTextContent } from '../../../components/RichTextView';
import ImageBlockDialog from '../../../components/ImageBlockDialog';
import SummaryBlockDialog from '../../../components/SummaryBlockDialog';
import SummaryBlockView from '../../../components/SummaryBlockView';
import LevelCoverage, { type ReadinessState } from '../../../components/LevelCoverage';
import ReviewPublishPanel from '../../../components/ReviewPublishPanel';
import RelatedLessonsPanel from '../../../components/RelatedLessonsPanel';
import { ACTION_EXPLANATION, actionLabelFor } from '../../../lib/review-guidance';
import { CalloutBlockDialog, SectionBlockDialog } from '../../../components/SectionCalloutDialogs';
import { CalloutBlockView, SectionBlockView } from '../../../components/SectionCalloutViews';
import { readCallout, readSection } from '../../../lib/section-callout';
import ScriptureConnectionDialog from '../../../components/ScriptureConnectionDialog';
import ScriptureConnectionView from '../../../components/ScriptureConnectionView';
import { readConnectionContent } from '../../../lib/scripture-connection';
import ExploreDeeperDialog from '../../../components/ExploreDeeperDialog';
import ExploreDeeperView from '../../../components/ExploreDeeperView';
import { readExplore } from '../../../lib/explore-deeper';
import { SymbolStudyDialog, WordStudyDialog } from '../../../components/WordSymbolDialogs';
import { SymbolStudyView, WordStudyView } from '../../../components/WordSymbolViews';
import { readSymbol, readWord } from '../../../lib/word-symbol';
import { CalculationDialog, ComparisonDialog, EquivalenceDialog } from '../../../components/ProphecyDialogs';
import { CalculationView, ComparisonView, EquivalenceView } from '../../../components/ProphecyViews';
import { readCalculation, readComparison, readEquivalence } from '../../../lib/prophecy';
import { DiscoveryDialog, ReflectionDialog } from '../../../components/ReflectionDiscoveryDialogs';
import { DiscoveryView, ReflectionView } from '../../../components/ReflectionDiscoveryViews';
import { readDiscovery, readReflection } from '../../../lib/reflection-discovery';
import ContinueExploringDialog from '../../../components/ContinueExploringDialog';
import ExploringBlockView from '../../../components/ExploringBlockView';
import { AnimationDialog, SceneDialog } from '../../../components/SceneMediaDialogs';
import { AnimationView, SceneView } from '../../../components/SceneMediaViews';
import { readAnimation, readScene } from '../../../lib/scene-media';
import AddContentPicker from '../../../components/AddContentPicker';
import EvidenceBlockDialog from '../../../components/EvidenceBlockDialog';
import EvidenceBlockView from '../../../components/EvidenceBlockView';
import { readEvidence } from '../../../lib/evidence-block';
import ScriptureBlockDialog from '../../../components/ScriptureBlockDialog';
import ScriptureBlockView from '../../../components/ScriptureBlockView';
import { readScriptureBlock } from '../../../lib/scripture-block';
import TimelineBlockDialog from '../../../components/TimelineBlockDialog';
import TimelineBlockView from '../../../components/TimelineBlockView';
import { readTimelineContent } from '../../../lib/timeline-block';
import HotspotBlockDialog from '../../../components/HotspotBlockDialog';
import HotspotBlockView from '../../../components/HotspotBlockView';
import { readHotspotContent } from '../../../lib/hotspot-block';
import QuizBlockDialog from '../../../components/QuizBlockDialog';
import QuizBlockView from '../../../components/QuizBlockView';
import { readQuizRef } from '../../../lib/quiz-block';
import { readSummaryContent, summaryErrorMessage } from '../../../lib/summary-block';
import MediaImage from '../../../components/MediaImage';
import { friendlyMediaError, readImageContent } from '../../../lib/image-block';
import { supportsLevelVariants } from '../../../lib/block-capabilities';
import { hasLegacyMarkers, legacyMarkdownToRichText } from '../../../lib/legacy-markdown';
import { validateScriptureReference, CANONICAL_BOOKS, ParseResult } from '../../../lib/scripture';
import { friendlyError, readableLevel, readinessMessage } from '../../../lib/ui-messages';
import DuplicateLessonDialog from '../../../components/DuplicateLessonDialog';
import CoverImageField from '../../../components/CoverImageField';
import LessonMetadataFields from '../../../components/LessonMetadataFields';

export default function LessonAuthoringPage() {
  const params = useParams();
  const lessonId = params?.lessonId as string;
  const { user } = useAuth();

  const [lesson, setLesson] = useState<LessonSummary | null>(null);
  const [parentCourse, setParentCourse] = useState<Course | null>(null);
  const [blocks, setBlocks] = useState<LessonBlock[]>([]);
  const [workflowState, setWorkflowState] = useState<WorkflowState | null>(null);
  const [workflowEvents, setWorkflowEvents] = useState<WorkflowEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  // "Add content": the picker, and the block ids that existed when a type was chosen (to find and show the block that was added).
  const [pickerOpen, setPickerOpen] = useState(false);
  const addBaselineRef = useRef<Set<string> | null>(null);

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
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Edit Lesson Metadata
  const [editLessonModalOpen, setEditLessonModalOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [parentModuleTitle, setParentModuleTitle] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editShortTitle, setEditShortTitle] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [editIntroduction, setEditIntroduction] = useState('');
  const [editEstimatedMinutes, setEditEstimatedMinutes] = useState<string>('');
  const [editCoverMediaId, setEditCoverMediaId] = useState<string | null>(null);
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
  const [summaryDialog, setSummaryDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [quizDialog, setQuizDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [hotspotDialog, setHotspotDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [timelineDialog, setTimelineDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [scriptureDialog, setScriptureDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [evidenceDialog, setEvidenceDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [sectionDialog, setSectionDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [connectionDialog, setConnectionDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [mapDialog, setMapDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [wordDialog, setWordDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [equivDialog, setEquivDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [savingEquiv, setSavingEquiv] = useState(false);
  const [equivError, setEquivError] = useState<string | null>(null);
  const [compareDialog, setCompareDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [savingCompare, setSavingCompare] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [calcDialog, setCalcDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [savingCalc, setSavingCalc] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [reflDialog, setReflDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [savingRefl, setSavingRefl] = useState(false);
  const [reflError, setReflError] = useState<string | null>(null);
  const [discDialog, setDiscDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [savingDisc, setSavingDisc] = useState(false);
  const [discError, setDiscError] = useState<string | null>(null);
  const [exploringDialog, setExploringDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [savingExploring, setSavingExploring] = useState(false);
  const [exploringError, setExploringError] = useState<string | null>(null);
  const [sceneDialog, setSceneDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [savingScene, setSavingScene] = useState(false);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [animDialog, setAnimDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [savingAnim, setSavingAnim] = useState(false);
  const [animError, setAnimError] = useState<string | null>(null);
  const [savingWord, setSavingWord] = useState(false);
  const [wordError, setWordError] = useState<string | null>(null);
  const [symbolDialog, setSymbolDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [savingSymbol, setSavingSymbol] = useState(false);
  const [symbolError, setSymbolError] = useState<string | null>(null);
  const [savingMap, setSavingMap] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [exploreDialog, setExploreDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [savingExplore, setSavingExplore] = useState(false);
  const [exploreError, setExploreError] = useState<string | null>(null);
  const [savingConnection, setSavingConnection] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [calloutDialog, setCalloutDialog] = useState<{ mode: 'create' } | { mode: 'edit'; block: LessonBlock } | null>(null);
  const [savingCallout, setSavingCallout] = useState(false);
  const [calloutError, setCalloutError] = useState<string | null>(null);
  const [savingEvidence, setSavingEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [savingScripture, setSavingScripture] = useState(false);
  const [scriptureError, setScriptureError] = useState<string | null>(null);
  const [savingTimeline, setSavingTimeline] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [savingHotspot, setSavingHotspot] = useState(false);
  const [hotspotError, setHotspotError] = useState<string | null>(null);
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [savingSummary, setSavingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [savingImage, setSavingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Delete Block
  const [deleteBlockId, setDeleteBlockId] = useState<string | null>(null);
  const [deletingBlock, setDeletingBlock] = useState(false);
  const [performingBlockAction, setPerformingBlockAction] = useState(false);
  // Block ordering. The editor always lists EVERY block of the lesson (a level only dims the blocks hidden at it), so the list that is dragged and the
  // list that is saved are the same complete list. Only one order save may be in flight.
  const reorderBusy = useRef(false);
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [readiness, setReadiness] = useState<ReadinessState>({ report: null, failed: null, checking: false });

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
    setLoading(!hasLoadedRef.current);
    setError(null);

    try {
      const [lessonRes, blocksRes, wfStateRes, wfEventsRes] =
        await Promise.all([
          api.request<LessonSummary>(`/admin/lessons/${lessonId}`),
          api.request<{ items: LessonBlock[] }>(`/admin/lessons/${lessonId}/blocks`),
          api.request<WorkflowState>(`/admin/lessons/${lessonId}/workflow`),
          api.request<{ items: WorkflowEvent[] }>(
            `/admin/lessons/${lessonId}/workflow/events?limit=10`
          ),
        ]);

      setLesson(lessonRes);
      api.request<Course>(`/admin/courses/${lessonRes.courseId}`).then(setParentCourse).catch(() => setParentCourse(null));
      if (lessonRes.moduleId) {
        api.request<{ title: string }>(`/admin/courses/${lessonRes.courseId}/modules/${lessonRes.moduleId}`).then((m) => setParentModuleTitle(m.title)).catch(() => setParentModuleTitle(null));
      } else {
        setParentModuleTitle(null);
      }
      setBlocks(blocksRes.items);
      // After a block was added from the picker, scroll to it and move focus there (once). Nothing happens if nothing new appeared.
      const baseline = addBaselineRef.current;
      if (baseline) {
        addBaselineRef.current = null;
        const added = blocksRes.items.find((b) => !baseline.has(b.id));
        if (added) {
          window.setTimeout(() => {
            const el = document.getElementById(`block-${added.id}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el?.focus({ preventScroll: true });
          }, 150);
        }
      }
      setWorkflowState(wfStateRes);
      setWorkflowEvents(wfEventsRes.items);

      setEditTitle(lessonRes.title);
      setEditShortTitle(lessonRes.shortTitle || '');
      setEditSubtitle(lessonRes.subtitle || '');
      setEditIntroduction(lessonRes.introduction || '');
      setEditEstimatedMinutes(lessonRes.estimatedMinutes ? String(lessonRes.estimatedMinutes) : '');
      setEditCoverMediaId(lessonRes.coverMediaId ?? null);
      setEditLevels(lessonRes.levels);
      if (lessonRes.levels.length > 0 && !lessonRes.levels.includes(selectedLevel)) {
        setSelectedLevel(lessonRes.levels[0]);
      }
    } catch (err: unknown) {
      setError(friendlyError(err, 'Failed to load lesson authoring workspace.'));
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    fetchLessonData();
  }, [fetchLessonData]);

  // After "Duplicate lesson" the new draft opens with ?duplicated=1: confirm once, then clean the address.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('duplicated') === '1') {
      setSuccessMessage('Lesson duplicated. This is a new draft; the original lesson is unchanged.');
      url.searchParams.delete('duplicated');
      window.history.replaceState(null, '', url.pathname + url.search);
    }
  }, [lessonId]);

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
        editIntroduction !== (lesson.introduction || '') ||
        editCoverMediaId !== (lesson.coverMediaId ?? null)
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
    editCoverMediaId,
  ]);

  // Editor text <-> backend RICH_TEXT document. Lossless for bold, italic, links and lists (see lib/rich-text.ts).
  const textToRichTextDoc = (text: string) => editorTextToRichText(text);
  const richTextDocToText = (sharedContent: Record<string, unknown> | null): string => richTextToEditorText(sharedContent);

  const confirmDiscard = (hasChanges: boolean, close: () => void) => {
    if (!hasChanges || window.confirm('Discard your unsaved changes?')) close();
  };

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
          coverMediaId: editCoverMediaId,
          version: lesson.version,
        }),
      });

      setLesson(updated);
      setEditLessonModalOpen(false);
      setSuccessMessage('Lesson details saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setUpdateMetaError(friendlyError(err, 'Failed to update lesson details.'));
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
      setSuccessMessage('Learning levels saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setUpdateLevelsError(friendlyError(err, 'Failed to save learning levels.'));
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
      setSuccessMessage('Block added to the lesson.');
      fetchLessonData();
    } catch (err: unknown) {
      setCreateBlockError(friendlyError(err, 'Failed to add the block.'));
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
      setSuccessMessage('Block content saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setUpdateBlockError(friendlyError(err, 'Failed to save block content.'));
    } finally {
      setUpdatingBlock(false);
    }
  };

  const openImageDialog = (next: { mode: 'create' } | { mode: 'edit'; block: LessonBlock }) => {
    setImageError(null);
    setImageDialog(next);
  };

  const openSummaryDialog = (next: { mode: 'create' } | { mode: 'edit'; block: LessonBlock }) => {
    setSummaryError(null);
    setSummaryDialog(next);
  };

  /** Opens the existing editor of a content type. The picker is closed first, so only one dialog is ever open. */
  const openEditorFor = (type: string) => {
    switch (type) {
      case 'RICH_TEXT':
        setNewBlockLevels([selectedLevel]);
        setCreateBlockModalOpen(true);
        break;
      case 'IMAGE':
        openImageDialog({ mode: 'create' });
        break;
      case 'SUMMARY':
        openSummaryDialog({ mode: 'create' });
        break;
      case 'QUIZ':
        setQuizError(null);
        setQuizDialog({ mode: 'create' });
        break;
      case 'INTERACTIVE_IMAGE':
        setHotspotError(null);
        setHotspotDialog({ mode: 'create' });
        break;
      case 'TIMELINE':
        setTimelineError(null);
        setTimelineDialog({ mode: 'create' });
        break;
      case 'SCRIPTURE_PASSAGE':
        setScriptureError(null);
        setScriptureDialog({ mode: 'create' });
        break;
      case 'HISTORICAL_EVIDENCE':
        setEvidenceError(null);
        setEvidenceDialog({ mode: 'create' });
        break;
      case 'SECTION_INTRO':
        setSectionError(null);
        setSectionDialog({ mode: 'create' });
        break;
      case 'CALLOUT':
        setCalloutError(null);
        setCalloutDialog({ mode: 'create' });
        break;
      case 'SCRIPTURE_CONNECTION':
        setConnectionError(null);
        setConnectionDialog({ mode: 'create' });
        break;
      case 'MAP':
        setMapError(null);
        setMapDialog({ mode: 'create' });
        break;
      case 'PROPHECY_EQUIVALENCE':
        setEquivError(null);
        setEquivDialog({ mode: 'create' });
        break;
      case 'PROPHECY_COMPARISON':
        setCompareError(null);
        setCompareDialog({ mode: 'create' });
        break;
      case 'PROPHECY_CALCULATION':
        setCalcError(null);
        setCalcDialog({ mode: 'create' });
        break;
      case 'REFLECTION_STUDY_ACTIVITY':
        setReflError(null);
        setReflDialog({ mode: 'create' });
        break;
      case 'GUIDED_DISCOVERY_QUESTION':
        setDiscError(null);
        setDiscDialog({ mode: 'create' });
        break;
      case 'CONTINUE_EXPLORING':
        setExploringError(null);
        setExploringDialog({ mode: 'create' });
        break;
      case 'NARRATIVE_SCENE':
        setSceneError(null);
        setSceneDialog({ mode: 'create' });
        break;
      case 'MEDIA_ANIMATION':
        setAnimError(null);
        setAnimDialog({ mode: 'create' });
        break;
      case 'WORD_STUDY':
        setWordError(null);
        setWordDialog({ mode: 'create' });
        break;
      case 'SYMBOL_STUDY':
        setSymbolError(null);
        setSymbolDialog({ mode: 'create' });
        break;
      case 'EXPLORE_DEEPER':
        setExploreError(null);
        setExploreDialog({ mode: 'create' });
        break;
    }
  };

  const chooseContentType = (type: string) => {
    addBaselineRef.current = new Set(blocks.map((b) => b.id));
    setPickerOpen(false);
    // Next tick: the picker has closed and given focus back to "Add content", so the editor remembers that button as its return point.
    window.setTimeout(() => openEditorFor(type), 0);
  };

  /** Saves a new or edited block of a simple type (create posts the block with its levels; edit patches the content with the version seen). */
  const saveSimpleBlock = async (
    type: string,
    dialog: { mode: 'create' } | { mode: 'edit'; block: LessonBlock },
    content: Record<string, unknown>,
    levels: LearningLevel[],
  ) => {
    if (dialog.mode === 'create') {
      await api.request(`/admin/lessons/${lessonId}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, sharedContent: content, levels: levels.length > 0 ? levels : lesson?.levels }),
      });
    } else {
      await api.request(`/admin/lessons/${lessonId}/blocks/${dialog.block.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sharedContent: content, version: dialog.block.version }),
      });
    }
  };

  const handleSaveSection = async (content: Record<string, unknown>, levels: LearningLevel[]) => {
    if (!sectionDialog || savingSection) return;
    setSavingSection(true);
    setSectionError(null);
    try {
      await saveSimpleBlock('SECTION_INTRO', sectionDialog, content, levels);
      setSectionDialog(null);
      setSuccessMessage('Section heading saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setSectionError(summaryErrorMessage(err, 'Could not save the section heading.'));
    } finally {
      setSavingSection(false);
    }
  };

  const handleSaveEquiv = async (content: Record<string, unknown>, levels: LearningLevel[]) => {
    if (!equivDialog || savingEquiv) return;
    setSavingEquiv(true);
    setEquivError(null);
    try {
      await saveSimpleBlock('PROPHECY_EQUIVALENCE', equivDialog, content, levels);
      setEquivDialog(null);
      setSuccessMessage('Prophecy equivalence saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setEquivError(summaryErrorMessage(err, 'Could not save the prophecy equivalence.'));
    } finally {
      setSavingEquiv(false);
    }
  };

  const handleSaveCompare = async (content: Record<string, unknown>, levels: LearningLevel[]) => {
    if (!compareDialog || savingCompare) return;
    setSavingCompare(true);
    setCompareError(null);
    try {
      await saveSimpleBlock('PROPHECY_COMPARISON', compareDialog, content, levels);
      setCompareDialog(null);
      setSuccessMessage('Prophecy comparison saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setCompareError(summaryErrorMessage(err, 'Could not save the prophecy comparison.'));
    } finally {
      setSavingCompare(false);
    }
  };

  const handleSaveCalc = async (content: Record<string, unknown>, levels: LearningLevel[]) => {
    if (!calcDialog || savingCalc) return;
    setSavingCalc(true);
    setCalcError(null);
    try {
      await saveSimpleBlock('PROPHECY_CALCULATION', calcDialog, content, levels);
      setCalcDialog(null);
      setSuccessMessage('Prophecy calculation saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setCalcError(summaryErrorMessage(err, 'Could not save the prophecy calculation.'));
    } finally {
      setSavingCalc(false);
    }
  };

  const handleSaveRefl = async (content: Record<string, unknown>, levels: LearningLevel[]) => {
    if (!reflDialog || savingRefl) return;
    setSavingRefl(true);
    setReflError(null);
    try {
      await saveSimpleBlock('REFLECTION_STUDY_ACTIVITY', reflDialog, content, levels);
      setReflDialog(null);
      setSuccessMessage('Study activity saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setReflError(summaryErrorMessage(err, 'Could not save the study activity.'));
    } finally {
      setSavingRefl(false);
    }
  };

  const handleSaveDisc = async (content: Record<string, unknown>, levels: LearningLevel[]) => {
    if (!discDialog || savingDisc) return;
    setSavingDisc(true);
    setDiscError(null);
    try {
      await saveSimpleBlock('GUIDED_DISCOVERY_QUESTION', discDialog, content, levels);
      setDiscDialog(null);
      setSuccessMessage('Guided question saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setDiscError(summaryErrorMessage(err, 'Could not save the guided question.'));
    } finally {
      setSavingDisc(false);
    }
  };

  const handleSaveExploring = async (content: Record<string, unknown>, levels: LearningLevel[]) => {
    if (!exploringDialog || savingExploring) return;
    setSavingExploring(true);
    setExploringError(null);
    try {
      await saveSimpleBlock('CONTINUE_EXPLORING', exploringDialog, content, levels);
      setExploringDialog(null);
      setSuccessMessage('Continue exploring saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setExploringError(summaryErrorMessage(err, 'Could not save Continue exploring.'));
    } finally {
      setSavingExploring(false);
    }
  };

  const handleSaveScene = async (content: Record<string, unknown>, levels: LearningLevel[]) => {
    if (!sceneDialog || savingScene) return;
    setSavingScene(true);
    setSceneError(null);
    try {
      await saveSimpleBlock('NARRATIVE_SCENE', sceneDialog, content, levels);
      setSceneDialog(null);
      setSuccessMessage('Narrative scene saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setSceneError(summaryErrorMessage(err, 'Could not save the narrative scene.'));
    } finally {
      setSavingScene(false);
    }
  };

  const handleSaveAnim = async (content: Record<string, unknown>, levels: LearningLevel[]) => {
    if (!animDialog || savingAnim) return;
    setSavingAnim(true);
    setAnimError(null);
    try {
      await saveSimpleBlock('MEDIA_ANIMATION', animDialog, content, levels);
      setAnimDialog(null);
      setSuccessMessage('Animated image saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setAnimError(summaryErrorMessage(err, 'Could not save the animated image.'));
    } finally {
      setSavingAnim(false);
    }
  };

  const handleSaveWord = async (content: Record<string, unknown>, levels: LearningLevel[]) => {
    if (!wordDialog || savingWord) return;
    setSavingWord(true);
    setWordError(null);
    try {
      await saveSimpleBlock('WORD_STUDY', wordDialog, content, levels);
      setWordDialog(null);
      setSuccessMessage('Word study saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setWordError(summaryErrorMessage(err, 'Could not save the word study.'));
    } finally {
      setSavingWord(false);
    }
  };

  const handleSaveSymbol = async (content: Record<string, unknown>, levels: LearningLevel[]) => {
    if (!symbolDialog || savingSymbol) return;
    setSavingSymbol(true);
    setSymbolError(null);
    try {
      await saveSimpleBlock('SYMBOL_STUDY', symbolDialog, content, levels);
      setSymbolDialog(null);
      setSuccessMessage('Symbol study saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setSymbolError(summaryErrorMessage(err, 'Could not save the symbol study.'));
    } finally {
      setSavingSymbol(false);
    }
  };

  const handleSaveMap = async (content: Record<string, unknown>, levels: LearningLevel[]) => {
    if (!mapDialog || savingMap) return;
    setSavingMap(true);
    setMapError(null);
    try {
      await saveSimpleBlock('MAP', mapDialog, content, levels);
      setMapDialog(null);
      setSuccessMessage('Map saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setMapError(summaryErrorMessage(err, 'Could not save the map.'));
    } finally {
      setSavingMap(false);
    }
  };

  const handleSaveExplore = async (content: Record<string, unknown>, levels: LearningLevel[]) => {
    if (!exploreDialog || savingExplore) return;
    setSavingExplore(true);
    setExploreError(null);
    try {
      await saveSimpleBlock('EXPLORE_DEEPER', exploreDialog, content, levels);
      setExploreDialog(null);
      setSuccessMessage('Explore Deeper section saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setExploreError(summaryErrorMessage(err, 'Could not save the Explore Deeper section.'));
    } finally {
      setSavingExplore(false);
    }
  };

  const handleSaveConnection = async (content: Record<string, unknown>, levels: LearningLevel[]) => {
    if (!connectionDialog || savingConnection) return;
    setSavingConnection(true);
    setConnectionError(null);
    try {
      await saveSimpleBlock('SCRIPTURE_CONNECTION', connectionDialog, content, levels);
      setConnectionDialog(null);
      setSuccessMessage('Scripture connection saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setConnectionError(summaryErrorMessage(err, 'Could not save the Scripture connection.'));
    } finally {
      setSavingConnection(false);
    }
  };

  const handleSaveCallout = async (content: Record<string, unknown>, levels: LearningLevel[]) => {
    if (!calloutDialog || savingCallout) return;
    setSavingCallout(true);
    setCalloutError(null);
    try {
      await saveSimpleBlock('CALLOUT', calloutDialog, content, levels);
      setCalloutDialog(null);
      setSuccessMessage('Callout saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setCalloutError(summaryErrorMessage(err, 'Could not save the callout.'));
    } finally {
      setSavingCallout(false);
    }
  };

  const handleSaveEvidence = async (content: Record<string, unknown>, levels: LearningLevel[]) => {
    if (!evidenceDialog || savingEvidence) return;
    setSavingEvidence(true);
    setEvidenceError(null);
    try {
      if (evidenceDialog.mode === 'create') {
        await api.request(`/admin/lessons/${lessonId}/blocks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'HISTORICAL_EVIDENCE', sharedContent: content, levels: levels.length > 0 ? levels : lesson?.levels }),
        });
      } else {
        await api.request(`/admin/lessons/${lessonId}/blocks/${evidenceDialog.block.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sharedContent: content, version: evidenceDialog.block.version }),
        });
      }
      setEvidenceDialog(null);
      setSuccessMessage('Historical evidence saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setEvidenceError(summaryErrorMessage(err, 'Could not save the historical evidence.'));
    } finally {
      setSavingEvidence(false);
    }
  };

  const handleSaveScripture = async (content: Record<string, unknown>, levels: LearningLevel[]) => {
    if (!scriptureDialog || savingScripture) return;
    setSavingScripture(true);
    setScriptureError(null);
    try {
      if (scriptureDialog.mode === 'create') {
        await api.request(`/admin/lessons/${lessonId}/blocks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'SCRIPTURE_PASSAGE', sharedContent: content, levels: levels.length > 0 ? levels : lesson?.levels }),
        });
      } else {
        await api.request(`/admin/lessons/${lessonId}/blocks/${scriptureDialog.block.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sharedContent: content, version: scriptureDialog.block.version }),
        });
      }
      setScriptureDialog(null);
      setSuccessMessage('Scripture passage saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setScriptureError(summaryErrorMessage(err, 'Could not save the Scripture passage.'));
    } finally {
      setSavingScripture(false);
    }
  };

  const handleSaveTimeline = async (content: Record<string, unknown>, levels: LearningLevel[]) => {
    if (!timelineDialog || savingTimeline) return;
    setSavingTimeline(true);
    setTimelineError(null);
    try {
      if (timelineDialog.mode === 'create') {
        await api.request(`/admin/lessons/${lessonId}/blocks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'TIMELINE', sharedContent: content, levels: levels.length > 0 ? levels : lesson?.levels }),
        });
      } else {
        await api.request(`/admin/lessons/${lessonId}/blocks/${timelineDialog.block.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sharedContent: content, version: timelineDialog.block.version }),
        });
      }
      setTimelineDialog(null);
      setSuccessMessage('Timeline saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setTimelineError(summaryErrorMessage(err, 'Could not save the timeline.'));
    } finally {
      setSavingTimeline(false);
    }
  };

  const handleSaveHotspot = async (content: Record<string, unknown>, levels: LearningLevel[]) => {
    if (!hotspotDialog || savingHotspot) return;
    setSavingHotspot(true);
    setHotspotError(null);
    try {
      if (hotspotDialog.mode === 'create') {
        await api.request(`/admin/lessons/${lessonId}/blocks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'INTERACTIVE_IMAGE', sharedContent: content, levels: levels.length > 0 ? levels : lesson?.levels }),
        });
      } else {
        await api.request(`/admin/lessons/${lessonId}/blocks/${hotspotDialog.block.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sharedContent: content, version: hotspotDialog.block.version }),
        });
      }
      setHotspotDialog(null);
      setSuccessMessage('Interactive image saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setHotspotError(summaryErrorMessage(err, 'Could not save the interactive image.'));
    } finally {
      setSavingHotspot(false);
    }
  };

  const handleSaveQuiz = async (quizId: string, levels: LearningLevel[]) => {
    if (!quizDialog || savingQuiz) return;
    setSavingQuiz(true);
    setQuizError(null);
    try {
      if (quizDialog.mode === 'create') {
        await api.request(`/admin/lessons/${lessonId}/blocks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'QUIZ', sharedContent: { quizId }, levels: levels.length > 0 ? levels : lesson?.levels }),
        });
      } else {
        await api.request(`/admin/lessons/${lessonId}/blocks/${quizDialog.block.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sharedContent: { quizId }, version: quizDialog.block.version }),
        });
      }
      setQuizDialog(null);
      setSuccessMessage('Quiz saved in the lesson.');
      fetchLessonData();
    } catch (err: unknown) {
      setQuizError(summaryErrorMessage(err, 'Could not save the quiz choice.'));
    } finally {
      setSavingQuiz(false);
    }
  };

  const handleSaveSummary = async (content: Record<string, unknown>, levels: LearningLevel[]) => {
    if (!summaryDialog || savingSummary) return;
    setSavingSummary(true);
    setSummaryError(null);
    try {
      if (summaryDialog.mode === 'create') {
        await api.request(`/admin/lessons/${lessonId}/blocks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'SUMMARY', sharedContent: content, levels: levels.length > 0 ? levels : lesson?.levels }),
        });
      } else {
        await api.request(`/admin/lessons/${lessonId}/blocks/${summaryDialog.block.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sharedContent: content, version: summaryDialog.block.version }),
        });
      }
      setSummaryDialog(null);
      setSuccessMessage('Summary saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setSummaryError(summaryErrorMessage(err, 'Could not save the summary.'));
    } finally {
      setSavingSummary(false);
    }
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
      setSuccessMessage('Image block saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setImageError(friendlyMediaError(err, 'Could not save the image.'));
    } finally {
      setSavingImage(false);
    }
  };

  const handleDuplicateBlock = async (blockId: string) => {
    if (performingBlockAction) return;
    setPerformingBlockAction(true);
    try {
      await api.request(`/admin/lessons/${lessonId}/blocks/${blockId}/duplicate`, {
        method: 'POST',
      });
      setSuccessMessage('Block duplicated.');
      fetchLessonData();
    } catch (err: unknown) {
      setError(friendlyError(err, 'Failed to duplicate block.'));
    } finally {
      setPerformingBlockAction(false);
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
      setSuccessMessage('Block deleted.');
      fetchLessonData();
    } catch (err: unknown) {
      setError(friendlyError(err, 'Failed to delete block.'));
    } finally {
      setDeletingBlock(false);
    }
  };

  /**
   * Saves a new order of ALL blocks (the complete list the endpoint requires). The new order is shown at once and every block stays on screen while
   * saving; a second save cannot start until this one ends. If the server refuses (for example the block list changed elsewhere), the previous order is
   * put back, the authoritative order is reloaded and the author is told. The server decides the Draft status and nothing about it changes here.
   */
  const saveBlockOrder = async (next: LessonBlock[]) => {
    if (reorderBusy.current || performingBlockAction) return;
    if (next.length !== blocks.length || next.every((b, i) => b.id === blocks[i]?.id)) return;
    reorderBusy.current = true;
    const before = blocks;
    setPerformingBlockAction(true);
    setBlocks(next);
    try {
      const res = await api.request<{ items: LessonBlock[] }>(
        `/admin/lessons/${lessonId}/blocks/order`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blockIds: next.map((b) => b.id),
            // The order that was current BEFORE this move: the server refuses the save if the persisted order is anything else.
            previousBlockIds: before.map((b) => b.id),
          }),
        }
      );
      setBlocks(res.items);
      setSuccessMessage('Block order saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setBlocks(before);
      // 409 = the persisted order is not the one this editor was showing. Nothing was written; it is NOT retried automatically, so the other person's work is kept.
      setError(
        (err as { status?: number } | null)?.status === 409
          ? 'The block order was changed by someone else (or blocks were added or removed), so your move was not saved. The latest order is being loaded: look at it and move the block again if you still want to.'
          : `${friendlyError(err, 'Failed to update block order.')} The blocks are shown in their previous order, and the latest order is being reloaded.`,
      );
      fetchLessonData();
    } finally {
      reorderBusy.current = false;
      setPerformingBlockAction(false);
    }
  };

  const handleReorderBlocks = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    await saveBlockOrder(next);
  };

  /** Moves the dragged block so that it takes the place of the block it was dropped on. */
  const dropBlockAt = (toIndex: number) => {
    const fromIndex = blocks.findIndex((b) => b.id === dragBlockId);
    setDragBlockId(null);
    setDropIndex(null);
    if (fromIndex < 0 || fromIndex === toIndex) return;
    const next = [...blocks];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    void saveBlockOrder(next);
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
      setSuccessMessage('Block visibility saved.');
      fetchLessonData();
    } catch (err: unknown) {
      setVariantError(friendlyError(err, 'Failed to save block visibility.'));
    } finally {
      setSavingVariant(false);
    }
  };

  const handlePreview = async (level: LearningLevel) => {
    setLoadingPreview(true);
    setPreviewError(null);
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
      setPreviewError(friendlyError(err, 'Failed to load the lesson preview.'));
    } finally {
      setLoadingPreview(false);
    }
  };

  /** Opens the existing editor for a block (the same one its "Edit" button opens). */
  const editBlock = (block: LessonBlock) => {
          if (block.type === 'SECTION_INTRO') {
            setSectionError(null);
            setSectionDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'PROPHECY_EQUIVALENCE') {
            setEquivError(null);
            setEquivDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'PROPHECY_COMPARISON') {
            setCompareError(null);
            setCompareDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'PROPHECY_CALCULATION') {
            setCalcError(null);
            setCalcDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'REFLECTION_STUDY_ACTIVITY') {
            setReflError(null);
            setReflDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'GUIDED_DISCOVERY_QUESTION') {
            setDiscError(null);
            setDiscDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'CONTINUE_EXPLORING') {
            setExploringError(null);
            setExploringDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'NARRATIVE_SCENE') {
            setSceneError(null);
            setSceneDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'MEDIA_ANIMATION') {
            setAnimError(null);
            setAnimDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'WORD_STUDY') {
            setWordError(null);
            setWordDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'SYMBOL_STUDY') {
            setSymbolError(null);
            setSymbolDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'MAP') {
            setMapError(null);
            setMapDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'EXPLORE_DEEPER') {
            setExploreError(null);
            setExploreDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'SCRIPTURE_CONNECTION') {
            setConnectionError(null);
            setConnectionDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'CALLOUT') {
            setCalloutError(null);
            setCalloutDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'IMAGE') {
            openImageDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'HISTORICAL_EVIDENCE') {
            setEvidenceError(null);
            setEvidenceDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'SCRIPTURE_PASSAGE') {
            setScriptureError(null);
            setScriptureDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'TIMELINE') {
            setTimelineError(null);
            setTimelineDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'INTERACTIVE_IMAGE') {
            setHotspotError(null);
            setHotspotDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'QUIZ') {
            setQuizError(null);
            setQuizDialog({ mode: 'edit', block });
            return;
          }
          if (block.type === 'SUMMARY') {
            openSummaryDialog({ mode: 'edit', block });
            return;
          }
          setEditingBlock(block);
          setEditingContentText(richTextDocToText(block.sharedContent));
  };

  /** Scrolls to a block and moves keyboard focus to it. Only used with a block id the server named. */
  const goToBlock = (blockId: string, level?: LearningLevel) => {
    if (level && lesson?.levels.includes(level)) setSelectedLevel(level);
    window.setTimeout(() => {
      const el = document.getElementById(`block-${blockId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus({ preventScroll: true });
    }, 50);
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
      setSuccessMessage('Lesson status updated.');
      fetchLessonData();
      window.setTimeout(() => document.getElementById('review-panel-heading')?.focus(), 100);
    } catch (err: unknown) {
      if ((err as { status?: number }).status === 409) {
        // The content or status moved since this page was loaded (an edit, or someone else's action). Nothing was changed; refresh what is shown.
        setTransitionError('The lesson changed after this page was loaded, so nothing was done. The page has been refreshed. Check the lesson and its checks again, then repeat the action if it still applies. Anything you typed in the note is kept.');
        fetchLessonData();
      } else {
        setTransitionError(friendlyError(err, 'This status change could not be completed.'));
      }
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
        <h3 className="text-lg font-bold text-slate-800">{error ? 'Lesson could not be loaded' : 'Lesson Not Found'}</h3>
        <p className="mt-2 text-sm text-slate-600">{error || 'This lesson may have been removed.'}</p>
        {error ? <button onClick={() => fetchLessonData()} className="mt-4 px-3 py-1.5 text-sm font-semibold text-white bg-slate-900 rounded-lg">Retry</button> : <Link href="/courses" className="mt-4 inline-block text-sm text-amber-700 underline">&larr; Return to Curriculum</Link>}
      </div>
    );
  }

  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';

  return (
    <div className="space-y-8">
      {error && (
        <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => fetchLessonData()} className="shrink-0 px-3 py-1 text-xs font-semibold rounded-md border border-rose-300 hover:bg-rose-100">Retry</button>
        </div>
      )}
      {successMessage && (
        <div role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between gap-3">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} aria-label="Dismiss success message" className="text-emerald-700 hover:text-emerald-900">&times;</button>
        </div>
      )}
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Link href="/courses" className="hover:text-slate-800">
          Courses
        </Link>
        <span>/</span>
        <Link href={`/courses/${lesson.courseId}`} className="hover:text-slate-800">{parentCourse?.title || 'Course'}</Link>
        <span>/</span>
        {lesson.moduleId && <><Link href={`/courses/${lesson.courseId}/modules/${lesson.moduleId}`} className="hover:text-slate-800">{parentModuleTitle || 'Module'}</Link><span>/</span></>}
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
              Preview for {readableLevel(selectedLevel)}
            </button>

            {canWrite && (
              <button
                onClick={() => setDuplicateOpen(true)}
                className="px-3.5 py-2 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg shadow-xs"
              >
                Duplicate lesson
              </button>
            )}

            {canWrite && (
              <button
                onClick={() => setEditLessonModalOpen(true)}
                className="px-3.5 py-2 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg shadow-xs"
              >
                Edit lesson details
              </button>
            )}
          </div>
        </div>

        <ReviewPublishPanel
          role={user?.role}
          lessonId={lessonId}
          courseId={lesson.courseId}
          workflowState={workflowState}
          blocks={blocks}
          refreshKey={`${lesson.version}:${workflowState?.status ?? ''}:${workflowState?.contentRevision ?? ''}`}
          onAction={(action) => {
            setTransitionError(null);
            setTransitionAction(action);
          }}
          onGoToBlock={goToBlock}
          onEditBlock={(blockId) => {
            const block = blocks.find((b) => b.id === blockId);
            if (block) editBlock(block);
          }}
          canWrite={canWrite}
          onReadiness={setReadiness}
        />
      </div>

      <RelatedLessonsPanel
        lessonId={lessonId}
        lessonVersion={lesson.version}
        canWrite={canWrite}
        onSaved={(message) => {
          setSuccessMessage(message);
          fetchLessonData();
        }}
      />

      {/* Level Tabs and Blocks Workspace */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 mr-2">
              View content for:
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
                {readableLevel(lvl)}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">This changes your editing view. It does not change who can see each block.</p>

          {canWrite && (
            <div>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="px-4 py-2.5 text-sm font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-lg flex items-center gap-2 shadow-xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add content
              </button>
            </div>
          )}
        </div>

        <LevelCoverage blocks={blocks} offeredLevels={lesson.levels} readiness={readiness} onGoToBlock={goToBlock} />

        {/* Blocks Listing */}
        {blocks.length === 0 ? (
          <EmptyState
            title="No Blocks in this Lesson"
            description="Use Add content to put text, images, a timeline, a quiz and more into this lesson."
            action={
              canWrite ? (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg"
                >
                  Add content
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
                  id={`block-${block.id}`}
                  tabIndex={-1}
                  onDragOver={(e) => {
                    if (!dragBlockId) return;
                    e.preventDefault();
                    if (dropIndex !== index) setDropIndex(index);
                  }}
                  onDrop={(e) => {
                    if (!dragBlockId) return;
                    e.preventDefault();
                    dropBlockAt(index);
                  }}
                  className={`${dropIndex === index && dragBlockId && dragBlockId !== block.id ? 'ring-2 ring-amber-500 ' : ''}${dragBlockId === block.id ? 'opacity-60 ' : ''}bg-white border rounded-xl p-5 shadow-xs transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${
                    isVisibleAtSelected
                      ? 'border-slate-200'
                      : 'border-slate-200/60 bg-slate-50/40 opacity-70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      {canWrite && (
                        <button
                          type="button"
                          draggable={!performingBlockAction}
                          disabled={performingBlockAction}
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', block.id);
                            const card = document.getElementById(`block-${block.id}`);
                            if (card) e.dataTransfer.setDragImage(card, 24, 24);
                            setDragBlockId(block.id);
                          }}
                          onDragEnd={() => {
                            setDragBlockId(null);
                            setDropIndex(null);
                          }}
                          onKeyDown={(e) => {
                            // Keyboard alternative on the handle itself: the same single-step move as the Up and Down buttons.
                            if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              void handleReorderBlocks(index, 'up');
                            } else if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              void handleReorderBlocks(index, 'down');
                            }
                          }}
                          className="cursor-grab active:cursor-grabbing touch-none px-1 py-1 text-slate-500 hover:text-slate-800 disabled:opacity-30 rounded-xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
                          aria-label={`Drag handle for block ${index + 1}. Drag to move it, or press the up or down arrow key. The Move up and Move down buttons do the same.`}
                          title="Drag to reorder (use the arrow buttons on touch screens)"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <circle cx="7" cy="5" r="1.4" /><circle cx="13" cy="5" r="1.4" /><circle cx="7" cy="10" r="1.4" /><circle cx="13" cy="10" r="1.4" /><circle cx="7" cy="15" r="1.4" /><circle cx="13" cy="15" r="1.4" />
                          </svg>
                        </button>
                      )}
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
                          onClick={() => handleReorderBlocks(index, 'up')}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                          aria-label="Move block up"
                          title="Move block up"
                          disabled={index === 0 || performingBlockAction}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleReorderBlocks(index, 'down')}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                          aria-label="Move block down"
                          title="Move block down"
                          disabled={index === blocks.length - 1 || performingBlockAction}
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
                    ) : block.type === 'SUMMARY' ? (
                      <SummaryBlockView content={block.sharedContent} />
                    ) : block.type === 'SECTION_INTRO' ? (
                      <SectionBlockView content={block.sharedContent} />
                    ) : block.type === 'PROPHECY_EQUIVALENCE' ? (
                      <EquivalenceView content={block.sharedContent} />
                    ) : block.type === 'PROPHECY_COMPARISON' ? (
                      <ComparisonView content={block.sharedContent} />
                    ) : block.type === 'PROPHECY_CALCULATION' ? (
                      <CalculationView content={block.sharedContent} />
                    ) : block.type === 'REFLECTION_STUDY_ACTIVITY' ? (
                      <ReflectionView content={block.sharedContent} />
                    ) : block.type === 'GUIDED_DISCOVERY_QUESTION' ? (
                      <DiscoveryView content={block.sharedContent} />
                    ) : block.type === 'CONTINUE_EXPLORING' ? (
                      <ExploringBlockView content={block.sharedContent} lessonId={lessonId} blockId={block.id} mode="working" />
                    ) : block.type === 'NARRATIVE_SCENE' ? (
                      <SceneView content={block.sharedContent} />
                    ) : block.type === 'MEDIA_ANIMATION' ? (
                      <AnimationView content={block.sharedContent} />
                    ) : block.type === 'WORD_STUDY' ? (
                      <WordStudyView content={block.sharedContent} />
                    ) : block.type === 'SYMBOL_STUDY' ? (
                      <SymbolStudyView content={block.sharedContent} />
                    ) : block.type === 'MAP' ? (
                      <HotspotBlockView content={block.sharedContent} variant="map" />
                    ) : block.type === 'EXPLORE_DEEPER' ? (
                      <ExploreDeeperView content={block.sharedContent} />
                    ) : block.type === 'SCRIPTURE_CONNECTION' ? (
                      <ScriptureConnectionView content={block.sharedContent} />
                    ) : block.type === 'CALLOUT' ? (
                      <CalloutBlockView content={block.sharedContent} />
                    ) : block.type === 'HISTORICAL_EVIDENCE' ? (
                      <EvidenceBlockView content={block.sharedContent} />
                    ) : block.type === 'SCRIPTURE_PASSAGE' ? (
                      <ScriptureBlockView content={block.sharedContent} />
                    ) : block.type === 'TIMELINE' ? (
                      <TimelineBlockView content={block.sharedContent} />
                    ) : block.type === 'INTERACTIVE_IMAGE' ? (
                      <HotspotBlockView content={block.sharedContent} />
                    ) : block.type === 'QUIZ' ? (
                      <QuizBlockView content={block.sharedContent} />
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
                        Who can see this block?
                      </span>
                      {block.levels.map((blvl) => (
                        <span
                          key={blvl.level}
                          className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-100 text-slate-700"
                        >
                          {readableLevel(blvl.level)} {blvl.content ? '★ Custom content' : ''}
                        </span>
                      ))}
                    </div>

                    {canWrite && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openVariantEditor(block, selectedLevel)}
                          className="px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors"
                        >
                          Set visibility for {readableLevel(selectedLevel)}
                        </button>
                        <button
                          onClick={() => editBlock(block)}
                          className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                          {block.type === 'IMAGE' ? 'Edit Image' : block.type === 'SUMMARY' ? 'Edit Summary' : block.type === 'QUIZ' ? 'Change quiz' : block.type === 'INTERACTIVE_IMAGE' ? 'Edit Interactive Image' : block.type === 'TIMELINE' ? 'Edit Timeline' : block.type === 'SCRIPTURE_PASSAGE' ? 'Edit Passage' : block.type === 'HISTORICAL_EVIDENCE' ? 'Edit Evidence' : block.type === 'SECTION_INTRO' ? 'Edit Heading' : block.type === 'CALLOUT' ? 'Edit Callout' : block.type === 'SCRIPTURE_CONNECTION' ? 'Edit Connection' : block.type === 'MAP' ? 'Edit Map' : block.type === 'PROPHECY_EQUIVALENCE' ? 'Edit Equivalence' : block.type === 'PROPHECY_COMPARISON' ? 'Edit Comparison' : block.type === 'PROPHECY_CALCULATION' ? 'Edit Calculation' : block.type === 'REFLECTION_STUDY_ACTIVITY' ? 'Edit Activity' : block.type === 'GUIDED_DISCOVERY_QUESTION' ? 'Edit Question' : block.type === 'CONTINUE_EXPLORING' ? 'Edit Links' : block.type === 'NARRATIVE_SCENE' ? 'Edit Scene' : block.type === 'MEDIA_ANIMATION' ? 'Edit Animation' : block.type === 'WORD_STUDY' ? 'Edit Word Study' : block.type === 'SYMBOL_STUDY' ? 'Edit Symbol Study' : block.type === 'EXPLORE_DEEPER' ? 'Edit Section' : 'Edit Shared'}
                        </button>
                        <button
                          onClick={() => handleDuplicateBlock(block.id)}
                          disabled={performingBlockAction}
                          className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                          title="Duplicate block"
                        >
                          {performingBlockAction ? 'Working…' : 'Duplicate block'}
                        </button>
                        <button
                          onClick={() => setDeleteBlockId(block.id)}
                          className="p-1 text-rose-500 hover:text-rose-700 rounded-lg"
                          aria-label="Delete block"
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
      <DuplicateLessonDialog
        lesson={duplicateOpen && lesson ? { id: lesson.id, title: lesson.title } : null}
        destination={`${parentModuleTitle ? `${parentModuleTitle} in ` : ''}${parentCourse?.title ?? 'this course'}${lesson?.moduleId ? '' : ' (directly in the course)'}`}
        onClose={() => setDuplicateOpen(false)}
      />

      <Modal
        isOpen={editLessonModalOpen}
        onClose={() => confirmDiscard(editTitle !== lesson.title || editShortTitle !== (lesson.shortTitle || '') || editSubtitle !== (lesson.subtitle || '') || editIntroduction !== (lesson.introduction || '') || editEstimatedMinutes !== (lesson.estimatedMinutes ? String(lesson.estimatedMinutes) : '') || editCoverMediaId !== (lesson.coverMediaId ?? null), () => setEditLessonModalOpen(false))}
        title="Edit lesson details"
        description={lesson.status === 'DRAFT' ? 'Updates lesson title and descriptive properties.' : 'Saving changes will return this lesson to Draft for review before it can be published again.'}
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

          <LessonMetadataFields
            idPrefix="edit-lesson"
            values={{ shortTitle: editShortTitle, subtitle: editSubtitle, introduction: editIntroduction, estimatedMinutes: editEstimatedMinutes }}
            onChange={(v) => {
              setEditShortTitle(v.shortTitle);
              setEditSubtitle(v.subtitle);
              setEditIntroduction(v.introduction);
              setEditEstimatedMinutes(v.estimatedMinutes);
            }}
            disabled={updatingMetadata}
          />

          <CoverImageField subject="lesson" mode="edit" saveLabel="Save lesson details" value={editCoverMediaId} onChange={setEditCoverMediaId} disabled={updatingMetadata} />

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => confirmDiscard(editTitle !== lesson.title || editShortTitle !== (lesson.shortTitle || '') || editSubtitle !== (lesson.subtitle || '') || editIntroduction !== (lesson.introduction || '') || editEstimatedMinutes !== (lesson.estimatedMinutes ? String(lesson.estimatedMinutes) : '') || editCoverMediaId !== (lesson.coverMediaId ?? null), () => setEditLessonModalOpen(false))}
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
              Save lesson details
            </button>
          </div>
        </form>
      </Modal>

      {/* Replace Levels Modal */}
      <Modal
        isOpen={editLevelsModalOpen}
        onClose={() => setEditLevelsModalOpen(false)}
        title="Adjust Lesson Learning Levels"
        description={lesson.status === 'DRAFT' ? 'Select the full set of learning levels at which this lesson is available.' : 'Saving changes will return this lesson to Draft for review before it can be published again.'}
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

      <SummaryBlockDialog
        isOpen={summaryDialog !== null}
        mode={summaryDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initial={summaryDialog?.mode === 'edit' ? readSummaryContent(summaryDialog.block.sharedContent) : null}
        saving={savingSummary}
        error={summaryError}
        onClose={() => setSummaryDialog(null)}
        onSave={(content, levels) => void handleSaveSummary(content, levels)}
      />

      <AddContentPicker isOpen={pickerOpen} onClose={() => setPickerOpen(false)} onChoose={chooseContentType} />

      <SectionBlockDialog
        isOpen={sectionDialog !== null}
        mode={sectionDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initial={sectionDialog?.mode === 'edit' ? readSection(sectionDialog.block.sharedContent) : null}
        saving={savingSection}
        error={sectionError}
        onClose={() => setSectionDialog(null)}
        onSave={(content, levels) => void handleSaveSection(content, levels)}
      />

      <HotspotBlockDialog
        isOpen={mapDialog !== null}
        variant="map"
        mode={mapDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initial={mapDialog?.mode === 'edit' ? readHotspotContent(mapDialog.block.sharedContent) : null}
        saving={savingMap}
        error={mapError}
        onClose={() => setMapDialog(null)}
        onSave={(content, levels) => void handleSaveMap(content, levels)}
      />

      <EquivalenceDialog
        isOpen={equivDialog !== null}
        mode={equivDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initial={equivDialog?.mode === 'edit' ? readEquivalence(equivDialog.block.sharedContent) : null}
        saving={savingEquiv}
        error={equivError}
        onClose={() => setEquivDialog(null)}
        onSave={(content, levels) => void handleSaveEquiv(content, levels)}
      />

      <ComparisonDialog
        isOpen={compareDialog !== null}
        mode={compareDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initial={compareDialog?.mode === 'edit' ? readComparison(compareDialog.block.sharedContent) : null}
        saving={savingCompare}
        error={compareError}
        onClose={() => setCompareDialog(null)}
        onSave={(content, levels) => void handleSaveCompare(content, levels)}
      />

      <CalculationDialog
        isOpen={calcDialog !== null}
        mode={calcDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initial={calcDialog?.mode === 'edit' ? readCalculation(calcDialog.block.sharedContent) : null}
        saving={savingCalc}
        error={calcError}
        onClose={() => setCalcDialog(null)}
        onSave={(content, levels) => void handleSaveCalc(content, levels)}
      />

      <ReflectionDialog
        isOpen={reflDialog !== null}
        mode={reflDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initial={reflDialog?.mode === 'edit' ? readReflection(reflDialog.block.sharedContent) : null}
        saving={savingRefl}
        error={reflError}
        onClose={() => setReflDialog(null)}
        onSave={(content, levels) => void handleSaveRefl(content, levels)}
      />

      <DiscoveryDialog
        isOpen={discDialog !== null}
        mode={discDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initial={discDialog?.mode === 'edit' ? readDiscovery(discDialog.block.sharedContent) : null}
        saving={savingDisc}
        error={discError}
        onClose={() => setDiscDialog(null)}
        onSave={(content, levels) => void handleSaveDisc(content, levels)}
      />

      <ContinueExploringDialog
        isOpen={exploringDialog !== null}
        mode={exploringDialog?.mode ?? 'create'}
        lessonId={lessonId}
        lessonVersion={lesson.version}
        lessonLevels={lesson.levels}
        initial={exploringDialog?.mode === 'edit' ? exploringDialog.block.sharedContent : null}
        saving={savingExploring}
        error={exploringError}
        onClose={() => setExploringDialog(null)}
        onSave={(content, levels) => void handleSaveExploring(content, levels)}
      />

      <SceneDialog
        isOpen={sceneDialog !== null}
        mode={sceneDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initial={sceneDialog?.mode === 'edit' ? readScene(sceneDialog.block.sharedContent) : null}
        saving={savingScene}
        error={sceneError}
        onClose={() => setSceneDialog(null)}
        onSave={(content, levels) => void handleSaveScene(content, levels)}
      />

      <AnimationDialog
        isOpen={animDialog !== null}
        mode={animDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initial={animDialog?.mode === 'edit' ? readAnimation(animDialog.block.sharedContent) : null}
        saving={savingAnim}
        error={animError}
        onClose={() => setAnimDialog(null)}
        onSave={(content, levels) => void handleSaveAnim(content, levels)}
      />

      <WordStudyDialog
        isOpen={wordDialog !== null}
        mode={wordDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initial={wordDialog?.mode === 'edit' ? readWord(wordDialog.block.sharedContent) : null}
        saving={savingWord}
        error={wordError}
        onClose={() => setWordDialog(null)}
        onSave={(content, levels) => void handleSaveWord(content, levels)}
      />

      <SymbolStudyDialog
        isOpen={symbolDialog !== null}
        mode={symbolDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initial={symbolDialog?.mode === 'edit' ? readSymbol(symbolDialog.block.sharedContent) : null}
        saving={savingSymbol}
        error={symbolError}
        onClose={() => setSymbolDialog(null)}
        onSave={(content, levels) => void handleSaveSymbol(content, levels)}
      />

      <ExploreDeeperDialog
        isOpen={exploreDialog !== null}
        mode={exploreDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initial={exploreDialog?.mode === 'edit' ? readExplore(exploreDialog.block.sharedContent) : null}
        saving={savingExplore}
        error={exploreError}
        onClose={() => setExploreDialog(null)}
        onSave={(content, levels) => void handleSaveExplore(content, levels)}
      />

      <ScriptureConnectionDialog
        isOpen={connectionDialog !== null}
        mode={connectionDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initial={connectionDialog?.mode === 'edit' ? readConnectionContent(connectionDialog.block.sharedContent) : null}
        saving={savingConnection}
        error={connectionError}
        onClose={() => setConnectionDialog(null)}
        onSave={(content, levels) => void handleSaveConnection(content, levels)}
      />

      <CalloutBlockDialog
        isOpen={calloutDialog !== null}
        mode={calloutDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initial={calloutDialog?.mode === 'edit' ? readCallout(calloutDialog.block.sharedContent) : null}
        saving={savingCallout}
        error={calloutError}
        onClose={() => setCalloutDialog(null)}
        onSave={(content, levels) => void handleSaveCallout(content, levels)}
      />

      <EvidenceBlockDialog
        isOpen={evidenceDialog !== null}
        mode={evidenceDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initial={evidenceDialog?.mode === 'edit' ? readEvidence(evidenceDialog.block.sharedContent) : null}
        saving={savingEvidence}
        error={evidenceError}
        onClose={() => setEvidenceDialog(null)}
        onSave={(content, levels) => void handleSaveEvidence(content, levels)}
      />

      <ScriptureBlockDialog
        isOpen={scriptureDialog !== null}
        mode={scriptureDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initial={scriptureDialog?.mode === 'edit' ? readScriptureBlock(scriptureDialog.block.sharedContent) : null}
        saving={savingScripture}
        error={scriptureError}
        onClose={() => setScriptureDialog(null)}
        onSave={(content, levels) => void handleSaveScripture(content, levels)}
      />

      <TimelineBlockDialog
        isOpen={timelineDialog !== null}
        mode={timelineDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initial={timelineDialog?.mode === 'edit' ? readTimelineContent(timelineDialog.block.sharedContent) : null}
        saving={savingTimeline}
        error={timelineError}
        onClose={() => setTimelineDialog(null)}
        onSave={(content, levels) => void handleSaveTimeline(content, levels)}
      />

      <HotspotBlockDialog
        isOpen={hotspotDialog !== null}
        mode={hotspotDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initial={hotspotDialog?.mode === 'edit' ? readHotspotContent(hotspotDialog.block.sharedContent) : null}
        saving={savingHotspot}
        error={hotspotError}
        onClose={() => setHotspotDialog(null)}
        onSave={(content, levels) => void handleSaveHotspot(content, levels)}
      />

      <QuizBlockDialog
        isOpen={quizDialog !== null}
        mode={quizDialog?.mode ?? 'create'}
        lessonLevels={lesson.levels}
        initialQuizId={quizDialog?.mode === 'edit' ? (readQuizRef(quizDialog.block.sharedContent)?.quizId ?? null) : null}
        saving={savingQuiz}
        error={quizError}
        onClose={() => setQuizDialog(null)}
        onSave={(quizId, levels) => void handleSaveQuiz(quizId, levels)}
      />

      {/* Delete Block Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteBlockId)}
        onClose={() => setDeleteBlockId(null)}
        onConfirm={handleDeleteBlock}
        title="Delete Content Block"
        message={`Are you sure you want to remove this block from the lesson? This will reset the lesson status to DRAFT.${blocks.find((b) => b.id === deleteBlockId)?.type === 'QUIZ' ? ' The quiz itself is not deleted and stays in the Quizzes section.' : ''}`}
        confirmLabel="Delete"
        isDestructive
        isLoading={deletingBlock}
      />

      {/* Learner Preview Modal */}
      <Modal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        title={`Learner preview: ${readableLevel(selectedLevel)} (working copy)`}
        description="This preview shows the current working content, including unpublished changes."
        maxWidth="2xl"
      >
        {loadingPreview ? (
          <LoadingSpinner text="Assembling lesson preview..." />
        ) : previewError ? (
          <div role="alert" className="p-6 text-center text-rose-800 bg-rose-50 border border-rose-200 rounded-lg space-y-3">
            <p>{previewError}</p>
            <button onClick={() => handlePreview(selectedLevel)} className="px-3 py-1.5 text-xs font-semibold rounded-md bg-white border border-rose-300 hover:bg-rose-100">Retry preview</button>
          </div>
        ) : !previewData || previewData.blocks.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No visible content blocks for {selectedLevel} level.
          </div>
        ) : (
          <div className="mx-auto w-full max-w-sm space-y-6 max-h-[60vh] overflow-y-auto rounded-[2rem] border-8 border-slate-800 bg-white p-5 shadow-xl">
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
                    ) : blk.type === 'SUMMARY' ? (
                      <SummaryBlockView content={blk.content} />
                    ) : blk.type === 'SECTION_INTRO' ? (
                      <SectionBlockView content={blk.content} />
                    ) : blk.type === 'PROPHECY_EQUIVALENCE' ? (
                      <EquivalenceView content={blk.content} />
                    ) : blk.type === 'PROPHECY_COMPARISON' ? (
                      <ComparisonView content={blk.content} />
                    ) : blk.type === 'PROPHECY_CALCULATION' ? (
                      <CalculationView content={blk.content} />
                    ) : blk.type === 'REFLECTION_STUDY_ACTIVITY' ? (
                      <ReflectionView content={blk.content} />
                    ) : blk.type === 'GUIDED_DISCOVERY_QUESTION' ? (
                      <DiscoveryView content={blk.content} />
                    ) : blk.type === 'CONTINUE_EXPLORING' ? (
                      <ExploringBlockView content={blk.content} lessonId={lessonId} blockId={blk.blockId ?? ''} mode="preview" level={selectedLevel} />
                    ) : blk.type === 'NARRATIVE_SCENE' ? (
                      <SceneView content={blk.content} />
                    ) : blk.type === 'MEDIA_ANIMATION' ? (
                      <AnimationView content={blk.content} />
                    ) : blk.type === 'WORD_STUDY' ? (
                      <WordStudyView content={blk.content} />
                    ) : blk.type === 'SYMBOL_STUDY' ? (
                      <SymbolStudyView content={blk.content} />
                    ) : blk.type === 'MAP' ? (
                      <HotspotBlockView content={blk.content} variant="map" />
                    ) : blk.type === 'EXPLORE_DEEPER' ? (
                      <ExploreDeeperView content={blk.content} defaultOpen={false} />
                    ) : blk.type === 'SCRIPTURE_CONNECTION' ? (
                      <ScriptureConnectionView content={blk.content} />
                    ) : blk.type === 'CALLOUT' ? (
                      <CalloutBlockView content={blk.content} />
                    ) : blk.type === 'HISTORICAL_EVIDENCE' ? (
                      <EvidenceBlockView content={blk.content} />
                    ) : blk.type === 'SCRIPTURE_PASSAGE' ? (
                      <ScriptureBlockView content={blk.content} />
                    ) : blk.type === 'TIMELINE' ? (
                      <TimelineBlockView content={blk.content} />
                    ) : blk.type === 'INTERACTIVE_IMAGE' ? (
                      <HotspotBlockView content={blk.content} />
                    ) : blk.type === 'QUIZ' ? (
                      <QuizBlockView content={blk.content} level={selectedLevel} />
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
        onClose={() => {
          if (!transitioning) setTransitionAction(null);
        }}
        title={`Confirm: ${transitionAction ? actionLabelFor(transitionAction, Boolean(workflowState?.activePublication)) : ''}`}
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

          <p className="text-sm text-slate-700">{transitionAction ? ACTION_EXPLANATION[transitionAction] : null}</p>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setTransitionAction(null)}
              disabled={transitioning}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
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
              {transitionAction ? actionLabelFor(transitionAction, Boolean(workflowState?.activePublication), 'Confirm') : 'Confirm'}
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
