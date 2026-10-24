'use client';

import React from 'react';
import { CalloutBlockView, SectionBlockView } from './SectionCalloutViews';
import EvidenceBlockView from './EvidenceBlockView';
import ExploreDeeperView from './ExploreDeeperView';
import HotspotBlockView from './HotspotBlockView';
import ImageBlockView from './ImageBlockView';
import { CalculationView, ComparisonView, EquivalenceView } from './ProphecyViews';
import { DiscoveryView, ReflectionView } from './ReflectionDiscoveryViews';
import RichTextView, { hasRichTextContent } from './RichTextView';
import { AnimationView, SceneView } from './SceneMediaViews';
import ScriptureBlockView from './ScriptureBlockView';
import ScriptureConnectionView from './ScriptureConnectionView';
import SummaryBlockView from './SummaryBlockView';
import TimelineBlockView from './TimelineBlockView';
import { SymbolStudyView, WordStudyView } from './WordSymbolViews';

/**
 * A block's content as it reads in the lesson editor, for the reusable block library (the same view components the lesson editor uses; nothing is rewritten and the
 * content is never shown as raw JSON). Quiz and Continue Exploring blocks cannot be reusable blocks, so they have no view here.
 */
export default function ReusableBlockView({ type, content }: { type: string; content: Record<string, unknown> | null }) {
  switch (type) {
    case 'IMAGE':
      return <ImageBlockView content={content} />;
    case 'SUMMARY':
      return <SummaryBlockView content={content} />;
    case 'SECTION_INTRO':
      return <SectionBlockView content={content} />;
    case 'PROPHECY_EQUIVALENCE':
      return <EquivalenceView content={content} />;
    case 'PROPHECY_COMPARISON':
      return <ComparisonView content={content} />;
    case 'PROPHECY_CALCULATION':
      return <CalculationView content={content} />;
    case 'REFLECTION_STUDY_ACTIVITY':
      return <ReflectionView content={content} />;
    case 'GUIDED_DISCOVERY_QUESTION':
      return <DiscoveryView content={content} />;
    case 'NARRATIVE_SCENE':
      return <SceneView content={content} />;
    case 'MEDIA_ANIMATION':
      return <AnimationView content={content} />;
    case 'WORD_STUDY':
      return <WordStudyView content={content} />;
    case 'SYMBOL_STUDY':
      return <SymbolStudyView content={content} />;
    case 'MAP':
      return <HotspotBlockView content={content} variant="map" />;
    case 'EXPLORE_DEEPER':
      return <ExploreDeeperView content={content} />;
    case 'SCRIPTURE_CONNECTION':
      return <ScriptureConnectionView content={content} />;
    case 'CALLOUT':
      return <CalloutBlockView content={content} />;
    case 'HISTORICAL_EVIDENCE':
      return <EvidenceBlockView content={content} />;
    case 'SCRIPTURE_PASSAGE':
      return <ScriptureBlockView content={content} />;
    case 'TIMELINE':
      return <TimelineBlockView content={content} />;
    case 'INTERACTIVE_IMAGE':
      return <HotspotBlockView content={content} />;
    case 'RICH_TEXT':
      return hasRichTextContent(content) ? <RichTextView content={content} /> : <span className="text-slate-400 italic font-sans text-xs">(Empty content)</span>;
    default:
      return <span className="text-slate-600 italic font-sans text-xs">This content type has no preview here.</span>;
  }
}
