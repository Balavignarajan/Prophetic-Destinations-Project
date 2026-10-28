'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LearningLevel } from '../../lib/types';
import { useScriptureInfo } from '../../lib/scripture-info';
import { MediaAnimationBlock } from './animation';
import { HotspotImageBlock } from './hotspot';
import { LessonImage } from './image';
import { Model3DBlock } from './model3d';
import { QuizBlock } from './quiz';
import { ScripturePassage } from './scripture';
import { ContinueExploringBlock, ExploreDeeperBlock, NarrativeSceneBlock, SymbolStudyBlock, TimelineBlock, WordStudyBlock } from './study-blocks';
import { CalculationBlock, CalloutBlock, ComparisonBlock, EquivalenceBlock, EvidenceBlock, GuidedQuestionBlock, RichTextBlock, ScriptureConnectionBlock, SectionIntroBlock, StudyActivityBlock, SummaryBlock } from './text-blocks';
import { PREVIEW_CSS, ensurePreviewFonts, themeVars, type PreviewTheme } from './theme';
import { BlockBoundary, Btn, Chevron, CloseButton, CoverPicture, Divider, Notice, PhoneContext, PhoneOverlay, Rule, Spinner, Txt, asText, isRecord, paragraphsOf, useReducedMotion, type PhoneContextValue } from './ui';

/**
 * The learner app's lesson reader (mobile-app/src/screens/lesson-screen.tsx, learning/lesson-header.tsx, lesson-contents.tsx) drawn in a phone-shaped frame: the compact header (back, short title,
 * Contents when the lesson has two or more titled sections, bookmark) with the thin "Reading N%" bar under it, then the lesson: the cover, "Beginner level · N min read", the title with its gold
 * rule, the subtitle, the introduction, the blocks in their published order, and the end of the lesson.
 *
 * READ-ONLY. The reading position is worked out from how far the preview is scrolled, only inside this frame: it is never stored, never sent, and never marks anything complete. The back, bookmark and
 * completion controls are drawn as in the app but do nothing here. A block type the app does not know is left out and counted, exactly as the app does; a block that cannot be drawn is replaced by a
 * notice and the rest of the lesson is not affected.
 */
export interface PreviewBlock {
  blockId: string;
  type: string;
  ordinal: number;
  source: 'VARIANT' | 'SHARED' | null;
  content: Record<string, unknown> | null;
}

export interface PreviewLesson {
  title: string;
  shortTitle: string | null;
  subtitle: string | null;
  introduction: string | null;
  estimatedMinutes: number | null;
  coverMediaId: string | null;
}

export type PhoneState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; blocks: PreviewBlock[] };

const LEVEL_LABELS: Record<LearningLevel, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

/** The block types this version of the app can show: every type of the backend's block registry. Any other is left out of the lesson and counted. */
const SUPPORTED = new Set(['RICH_TEXT', 'IMAGE', 'SUMMARY', 'QUIZ', 'INTERACTIVE_IMAGE', 'TIMELINE', 'SCRIPTURE_PASSAGE', 'HISTORICAL_EVIDENCE', 'SECTION_INTRO', 'CALLOUT', 'SCRIPTURE_CONNECTION', 'MAP', 'EXPLORE_DEEPER', 'WORD_STUDY', 'SYMBOL_STUDY', 'PROPHECY_EQUIVALENCE', 'PROPHECY_COMPARISON', 'PROPHECY_CALCULATION', 'REFLECTION_STUDY_ACTIVITY', 'GUIDED_DISCOVERY_QUESTION', 'CONTINUE_EXPLORING', 'NARRATIVE_SCENE', 'MEDIA_ANIMATION', 'INTERACTIVE_3D_MODEL']);

/** A lesson is offered a contents list only when it has at least this many titled sections. */
const MIN_SECTIONS_FOR_CONTENTS = 2;

/** Every media id a block refers to (its own image, a nested image, a poster), so the cover is not shown twice. */
function blockMediaIds(content: Record<string, unknown> | null): string[] {
  const ids: string[] = [];
  if (!isRecord(content)) return ids;
  const take = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) ids.push(value.trim());
  };
  take(content.mediaId);
  take(content.posterMediaId);
  if (isRecord(content.image)) take(content.image.mediaId);
  return ids;
}

function drawBlock(block: PreviewBlock, content: Record<string, unknown>): React.ReactNode {
  switch (block.type) {
    case 'SECTION_INTRO':
      return <SectionIntroBlock content={content} />;
    case 'IMAGE':
      return <LessonImage content={content} />;
    case 'PROPHECY_EQUIVALENCE':
      return <EquivalenceBlock content={content} />;
    case 'PROPHECY_COMPARISON':
      return <ComparisonBlock content={content} />;
    case 'PROPHECY_CALCULATION':
      return <CalculationBlock content={content} />;
    case 'REFLECTION_STUDY_ACTIVITY':
      return <StudyActivityBlock content={content} />;
    case 'GUIDED_DISCOVERY_QUESTION':
      return <GuidedQuestionBlock content={content} />;
    case 'CONTINUE_EXPLORING':
      return <ContinueExploringBlock blockId={block.blockId} content={content} />;
    case 'NARRATIVE_SCENE':
      return <NarrativeSceneBlock content={content} />;
    case 'MEDIA_ANIMATION':
      return <MediaAnimationBlock content={content} />;
    case 'INTERACTIVE_3D_MODEL':
      return <Model3DBlock content={content} />;
    case 'WORD_STUDY':
      return <WordStudyBlock content={content} />;
    case 'SYMBOL_STUDY':
      return <SymbolStudyBlock content={content} />;
    case 'MAP':
      return <HotspotImageBlock content={content} variant="map" />;
    case 'EXPLORE_DEEPER':
      return <ExploreDeeperBlock content={content} />;
    case 'SCRIPTURE_CONNECTION':
      return <ScriptureConnectionBlock content={content} />;
    case 'CALLOUT':
      return <CalloutBlock content={content} />;
    case 'HISTORICAL_EVIDENCE':
      return <EvidenceBlock content={content} />;
    case 'SCRIPTURE_PASSAGE':
      return <ScripturePassage content={content} />;
    case 'TIMELINE':
      return <TimelineBlock content={content} />;
    case 'INTERACTIVE_IMAGE':
      return <HotspotImageBlock content={content} />;
    case 'QUIZ':
      return <QuizBlock content={content} />;
    case 'SUMMARY':
      return <SummaryBlock content={content} />;
    default:
      return <RichTextBlock content={content} />;
  }
}

/** One block of the lesson: its wrapper (which the Contents list scrolls to), a boundary that keeps a block that cannot be drawn from taking the rest of the lesson with it, and the block itself. */
export const BlockView = memo(function BlockView({ block }: { block: PreviewBlock }) {
  const content = isRecord(block.content) ? block.content : null;
  return (
    <div data-block-id={block.blockId}>
      {content ? (
        <BlockBoundary resetKey={block.blockId}>{drawBlock(block, content)}</BlockBoundary>
      ) : (
        <Notice variant="missing" title="Content not available" message="This part of the lesson has no content to show. The rest of the lesson is not affected." />
      )}
    </div>
  );
});

/** The lesson itself, below the header. Memoised: scrolling (the reading position) never draws the blocks again. */
const LessonBody = memo(function LessonBody({ lesson, level, blocks }: { lesson: PreviewLesson; level: LearningLevel; blocks: PreviewBlock[] }) {
  const { shown, unsupported, showCover } = useMemo(() => {
    const ordered = [...blocks].sort((a, b) => a.ordinal - b.ordinal);
    return {
      shown: ordered.filter((block) => SUPPORTED.has(block.type)),
      unsupported: ordered.filter((block) => !SUPPORTED.has(block.type)),
      // The lesson cover is shown only when no block already shows the same picture.
      showCover: !ordered.some((block) => blockMediaIds(block.content).includes(lesson.coverMediaId ?? '')),
    };
  }, [blocks, lesson.coverMediaId]);
  const introduction = useMemo(() => paragraphsOf(lesson.introduction ?? ''), [lesson.introduction]);
  const levelName = LEVEL_LABELS[level];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        {showCover && lesson.coverMediaId && <CoverPicture mediaId={lesson.coverMediaId} height={200} />}
        <div className="flex flex-col gap-2">
          <Txt v="body-small" tone="highlight" w={6}>
            {levelName} level{lesson.estimatedMinutes ? ` · ${lesson.estimatedMinutes} min read` : ''}
          </Txt>
          <Txt v="title" as="h2">
            {lesson.title}
          </Txt>
          <Rule title />
          {lesson.subtitle && (
            <Txt v="subtitle" tone="secondary">
              {lesson.subtitle}
            </Txt>
          )}
        </div>
        {introduction.length > 0 && (
          <div className="flex flex-col gap-3">
            {introduction.map((paragraph, index) => (
              <Txt key={index} v="body" read pre>
                {paragraph}
              </Txt>
            ))}
          </div>
        )}
        {shown.length > 0 && <Divider />}
      </div>

      {shown.map((block) => (
        <BlockView key={block.blockId} block={block} />
      ))}

      {shown.length === 0 && introduction.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Txt v="heading" as="h3">
            Nothing to read yet
          </Txt>
          <Txt v="body" tone="secondary">
            This lesson has no readable content at this level.
          </Txt>
        </div>
      )}

      {unsupported.length > 0 && (
        <Notice
          variant="unsupported"
          title={unsupported.length === 1 ? 'One part is not shown' : `${unsupported.length} parts are not shown`}
          message={`This version of the app cannot show ${unsupported.length === 1 ? 'it' : 'them'} yet. The rest of the lesson is not affected. Updating the app may fix this.`}
        />
      )}

      {/* The end of the lesson, as the app draws it. Completion is the learner's own tap in the app and is never saved from here, so the button is drawn but cannot be used. */}
      <div className="flex flex-col gap-4">
        <Divider />
        <Txt v="body-small" tone="muted" className="text-center">
          Not marked complete yet at the {levelName} level. You choose when you have finished: reaching the end or taking a quiz does not mark a lesson complete.
        </Txt>
        <Btn disabled aria-label="Mark lesson as complete (not available in the preview)">
          Mark lesson as complete
        </Btn>
        <Txt v="caption" tone="muted" className="text-center">
          Preview only: completion and reading position are not saved or sent anywhere.
        </Txt>
      </div>
    </div>
  );
});

function ContentsSheet({ sections, onSelect, onClose }: { sections: { blockId: string; title: string }[]; onSelect: (blockId: string) => void; onClose: () => void }) {
  return (
    <PhoneOverlay kind="sheet" label="Contents" onClose={onClose}>
      <div className="flex items-center justify-between pl-6 pr-2 pt-2">
        <Txt v="heading" as="h3">
          Contents
        </Txt>
        <CloseButton label="Close contents" onClick={onClose} />
      </div>
      <ul className="lp-scroll flex min-h-0 flex-col gap-1 overflow-y-auto px-4 pb-4">
        {sections.map((section, index) => (
          <li key={section.blockId}>
            <button type="button" className="lp-sheet-item" aria-label={`Section ${index + 1} of ${sections.length}: ${section.title}`} onClick={() => onSelect(section.blockId)}>
              <Txt v="body-small" tone="highlight" w={7} as="span" className="shrink-0" style={{ minWidth: 24 }}>
                {index + 1}
              </Txt>
              <Txt v="body" as="span" className="min-w-0 flex-1">
                {section.title}
              </Txt>
            </button>
          </li>
        ))}
      </ul>
    </PhoneOverlay>
  );
}

export default function LessonPhone({ theme, level, lessonId, lesson, state, onRetry }: { theme: PreviewTheme; level: LearningLevel; lessonId: string; lesson: PreviewLesson; state: PhoneState; onRetry: () => void }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [percent, setPercent] = useState<number | null>(null);
  const [contentsOpen, setContentsOpen] = useState(false);
  const main = useRef<HTMLDivElement>(null);
  const openOverlays = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const scripture = useScriptureInfo();
  const reduced = useReducedMotion();
  const levelName = LEVEL_LABELS[level];

  useEffect(() => {
    ensurePreviewFonts();
  }, []);

  // The size of the phone's screen, for blocks that fit themselves to it.
  useEffect(() => {
    if (!host || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const box = host.getBoundingClientRect();
      setSize((current) => (Math.round(box.width) === current.width && Math.round(box.height) === current.height ? current : { width: Math.round(box.width), height: Math.round(box.height) }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [host]);

  // The reading position: where the preview is scrolled to, as the app works it out (nothing is shown for a lesson short enough to fit; it is never stored).
  const updatePercent = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    const scrollable = element.scrollHeight - element.clientHeight;
    if (element.clientHeight <= 0 || scrollable < 80) {
      setPercent(null);
      return;
    }
    setPercent(Math.round(Math.min(1, Math.max(0, element.scrollTop / scrollable)) * 100));
  }, []);
  useEffect(() => {
    const element = scroller.current;
    const inner = column.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    updatePercent();
    const observer = new ResizeObserver(updatePercent);
    observer.observe(element);
    if (inner) observer.observe(inner);
    return () => observer.disconnect();
  }, [updatePercent, state.status]);

  // While a sheet or full-screen layer is open the lesson behind it is inert (no focus, no clicks, hidden from screen readers). Done on the element itself, at once, so focus can go back the moment it closes.
  const pushOverlay = useCallback(() => {
    openOverlays.current += 1;
    if (main.current) main.current.inert = true;
    return () => {
      openOverlays.current = Math.max(0, openOverlays.current - 1);
      if (openOverlays.current === 0 && main.current) main.current.inert = false;
    };
  }, []);

  const context = useMemo<PhoneContextValue>(() => ({ host, width: size.width, height: size.height, bookNames: scripture.bookNames, level, lessonId, pushOverlay }), [host, size.width, size.height, scripture.bookNames, level, lessonId, pushOverlay]);

  // The lesson's sections, in published order, from its titled SECTION_INTRO blocks. Nothing is invented.
  const sections = useMemo(() => {
    if (state.status !== 'ready') return [];
    return [...state.blocks]
      .sort((a, b) => a.ordinal - b.ordinal)
      .filter((block) => block.type === 'SECTION_INTRO' && isRecord(block.content) && asText(block.content.title) !== '')
      .map((block) => ({ blockId: block.blockId, title: asText((block.content as Record<string, unknown>).title) }));
  }, [state]);

  const jumpTo = (blockId: string) => {
    setContentsOpen(false);
    const element = scroller.current;
    const target = column.current?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
    if (!element || !target) return;
    const top = target.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop - 8;
    element.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
  };

  const title = (lesson.shortTitle && lesson.shortTitle.trim()) || lesson.title || 'Lesson';

  return (
    <PhoneContext.Provider value={context}>
      {/* The device: a rounded frame with a notch and a home indicator, as a phone. Its screen is the lesson reader. */}
      <div className="h-full w-full rounded-[2.75rem] p-2.5" style={{ background: '#0B0E14', boxShadow: '0 28px 60px -12px rgba(0,0,0,.55), inset 0 0 0 1px #2B3140' }}>
        <style>{PREVIEW_CSS}</style>
        <div
          ref={setHost}
          role="region"
          aria-label={`Preview of the lesson as it appears in the mobile app, ${levelName} level, ${theme} theme`}
          aria-busy={state.status === 'loading'}
          data-theme={theme}
          className="lp-root relative flex h-full flex-col overflow-hidden rounded-[2.1rem]"
          style={themeVars(theme)}
        >
          <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2" style={{ width: 96, height: 24, borderRadius: 12, background: '#05070B' }} />
          <div ref={main} className="flex min-h-0 flex-1 flex-col">
            <div aria-hidden="true" className="shrink-0" style={{ height: 38 }} />
            {/* The header: back, short title, Contents (two or more titled sections) and bookmark, with the reading position under it. */}
            <header className="shrink-0 px-6 pb-2">
              <div className="flex items-center gap-1 pt-1">
                <span aria-hidden="true" className="flex shrink-0 items-center justify-center" style={{ width: 48, height: 48 }}>
                  <Chevron dir="left" size={16} tone="text" />
                </span>
                <div className="flex min-w-0 flex-1 items-center" style={{ minHeight: 48 }}>
                  <Txt v="body-small" w={6} as="h2" className="truncate">
                    {title}
                  </Txt>
                </div>
                {sections.length >= MIN_SECTIONS_FOR_CONTENTS && (
                  <button type="button" className="lp-icon-btn" aria-label="Lesson contents" aria-haspopup="dialog" onClick={() => setContentsOpen(true)}>
                    <span aria-hidden="true" className="flex flex-col items-start gap-1">
                      {[18, 14, 18].map((width, index) => (
                        <span key={index} style={{ width, height: 2, borderRadius: 1, background: 'var(--lp-text)' }} />
                      ))}
                    </span>
                  </button>
                )}
                <span aria-hidden="true" className="lp-c-text flex shrink-0 items-center justify-center" style={{ width: 48, height: 48 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                    <path d="M6 3.5h12v17l-6-4-6 4z" />
                  </svg>
                </span>
              </div>
              {percent !== null && (
                <div className="flex items-center gap-3 px-2" role="progressbar" aria-label="Reading position (preview only, not saved)" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                  <div className="lp-track">
                    <div className="lp-track-fill" style={{ width: `${percent}%` }} />
                  </div>
                  <Txt v="body-small" tone="secondary" className="text-right" style={{ minWidth: 104 }}>
                    Reading {percent}%
                  </Txt>
                </div>
              )}
            </header>

            <div ref={scroller} tabIndex={0} role="group" aria-label="Lesson content, scrollable" onScroll={updatePercent} className="lp-scroll min-h-0 flex-1 overflow-y-auto" style={{ paddingTop: 12 }}>
              <div ref={column} className="px-6" style={{ paddingBottom: 40 }}>
                {state.status === 'loading' && (
                  <div role="status" className="flex flex-col items-center gap-3 py-16 text-center">
                    <Spinner />
                    <Txt v="body-small" tone="secondary">
                      Assembling lesson preview…
                    </Txt>
                  </div>
                )}
                {state.status === 'error' && (
                  <div role="alert" className="flex flex-col items-center gap-4 py-12 text-center">
                    <Txt v="heading" as="h3">
                      The preview could not be loaded
                    </Txt>
                    <Txt v="body-small" tone="secondary">
                      {state.message}
                    </Txt>
                    <Btn kind="secondary" size="md" onClick={onRetry}>
                      Retry preview
                    </Btn>
                  </div>
                )}
                {state.status === 'ready' && <LessonBody lesson={lesson} level={level} blocks={state.blocks} />}
              </div>
            </div>
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute bottom-1.5 left-1/2 z-10 -translate-x-1/2" style={{ width: 112, height: 4, borderRadius: 2, background: 'var(--lp-text)', opacity: 0.35 }} />
          {contentsOpen && sections.length >= MIN_SECTIONS_FOR_CONTENTS && <ContentsSheet sections={sections} onSelect={jumpTo} onClose={() => setContentsOpen(false)} />}
        </div>
      </div>
    </PhoneContext.Provider>
  );
}
