'use client';

import React from 'react';
import { type LevelVersionState, levelVersionState } from '../lib/level-version';
import type { LearningLevel, LessonBlock } from '../lib/types';
import { readableLevel } from '../lib/ui-messages';

const LEVELS: LearningLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const BTN = 'px-2.5 py-1 text-xs font-medium rounded-lg border focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50';

interface Props {
  block: LessonBlock;
  /** 1-based place of the block in the lesson, for the spoken button names. */
  blockNumber: number;
  /** The levels the lesson is offered at. */
  lessonLevels: LearningLevel[];
  /** false = read-only: the state of each level is shown without the buttons. */
  canWrite: boolean;
  busy: boolean;
  onEdit: (level: LearningLevel) => void;
  onRemove: (level: LearningLevel) => void;
}

const STATUS: Record<LevelVersionState, { text: string; tone: string }> = {
  'not-offered': { text: 'The lesson is not offered at this level', tone: 'text-slate-600' },
  hidden: { text: 'Block hidden at this level', tone: 'text-slate-600' },
  shared: { text: 'Uses the shared content', tone: 'text-slate-800' },
  version: { text: 'Has its own version', tone: 'text-purple-800 font-medium' },
};

/**
 * "Level-specific content (optional)" of one block whose type supports it: the block keeps ONE shared content, and a level that is shown may have its own complete
 * version. Per level it says which of four things is true (the lesson is not offered there / the block is hidden there / it uses the shared content / it has its own
 * version) and offers Add, Edit or Remove. Nothing is decided here: the backend resolves what a learner sees (a hidden block stays hidden even if it had a version, and a
 * level without a version gets the shared content; another level's version is never used), and Preview shows exactly that. Showing or hiding the block at a level is still
 * done with "Set visibility", which refuses to throw a version away.
 */
export default function LevelContentSection({ block, blockNumber, lessonLevels, canWrite, busy, onEdit, onRemove }: Props) {
  return (
    <section aria-label={`Level-specific content of block ${blockNumber}`} className="pt-3 border-t border-slate-100 space-y-2">
      <div>
        <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Level-specific content (optional)</h4>
        <p className="text-xs text-slate-600 mt-0.5">
          Every level uses the shared content unless you add a version for it. A level with its own version no longer follows later edits to the shared content.
        </p>
      </div>
      <ul className="space-y-1.5">
        {LEVELS.map((level) => {
          const state = levelVersionState(block.levels, lessonLevels, level);
          const label = readableLevel(level);
          const { text, tone } = STATUS[state];
          return (
            <li key={level} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span>
                <span className="font-semibold text-slate-800">{label}</span>
                <span className="text-slate-400" aria-hidden="true"> · </span>
                <span className={tone}>{state === 'version' && <span aria-hidden="true">★ </span>}{text}</span>
              </span>
              {canWrite && (state === 'shared' || state === 'version') && (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onEdit(level)}
                    aria-label={`${state === 'version' ? 'Edit' : 'Add'} ${label} version of block ${blockNumber}`}
                    className={`${BTN} text-purple-800 bg-purple-50 hover:bg-purple-100 border-purple-200`}
                  >
                    {state === 'version' ? `Edit ${label} version` : `Add ${label} version`}
                  </button>
                  {state === 'version' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRemove(level)}
                      aria-label={`Remove ${label} version of block ${blockNumber}`}
                      className={`${BTN} text-rose-800 bg-white hover:bg-rose-50 border-rose-200`}
                    >
                      Remove version
                    </button>
                  )}
                </span>
              )}
              {canWrite && state === 'hidden' && <span className="text-slate-600">Show the block at {label} first (Set visibility) to add a version.</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
