'use client';

import React from 'react';
import { levelVersionOf } from '../lib/level-version';
import { readEvidence } from '../lib/evidence-block';
import { readConnectionContent } from '../lib/scripture-connection';
import { readCallout } from '../lib/section-callout';
import type { LearningLevel, LessonBlock } from '../lib/types';
import { readableLevel } from '../lib/ui-messages';
import { readSymbol, readWord } from '../lib/word-symbol';
import EvidenceBlockDialog from './EvidenceBlockDialog';
import { CalloutBlockDialog } from './SectionCalloutDialogs';
import ScriptureConnectionDialog from './ScriptureConnectionDialog';
import { SymbolStudyDialog, WordStudyDialog } from './WordSymbolDialogs';

export interface VersionTarget {
  block: LessonBlock;
  level: LearningLevel;
}

interface Props {
  /** The block and the level whose version is being added or edited; null = closed. */
  target: VersionTarget | null;
  lessonLevels: LearningLevel[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  /** The finished version. The page saves it for this level only. */
  onSave: (content: Record<string, unknown>) => void;
}

/**
 * The block's OWN editor, opened on ONE level's version instead of the shared content. A new version starts as a copy of the shared content; an existing one opens
 * as it is stored. Every field, rule and warning of the shared editor applies unchanged (structured Scripture references, the media picker, required-before-publishing
 * notes, the unsaved-changes prompt), because it is the same component: nothing here edits content as raw JSON. Rich text has its own dialog (RichTextVersionDialog),
 * which the page uses for RICH_TEXT. A block type without an editor here (one that does not support level versions) renders nothing.
 */
export default function LevelVersionDialogs({ target, lessonLevels, saving, error, onClose, onSave }: Props) {
  if (!target) return null;
  const { block, level } = target;
  const start = levelVersionOf(block.levels, level) ?? block.sharedContent;
  const common = {
    isOpen: true,
    mode: 'edit' as const,
    lessonLevels,
    levelLabel: readableLevel(level),
    saving,
    error,
    onClose,
    onSave: (content: Record<string, unknown>) => onSave(content),
  };
  switch (block.type) {
    case 'CALLOUT':
      return <CalloutBlockDialog {...common} initial={readCallout(start)} />;
    case 'SCRIPTURE_CONNECTION':
      return <ScriptureConnectionDialog {...common} initial={readConnectionContent(start)} />;
    case 'WORD_STUDY':
      return <WordStudyDialog {...common} initial={readWord(start)} />;
    case 'SYMBOL_STUDY':
      return <SymbolStudyDialog {...common} initial={readSymbol(start)} />;
    case 'HISTORICAL_EVIDENCE':
      return <EvidenceBlockDialog {...common} initial={readEvidence(start)} />;
    default:
      return null;
  }
}
