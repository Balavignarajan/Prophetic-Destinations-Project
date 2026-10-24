'use client';

import React from 'react';
import { friendlyBlockName } from '../lib/block-catalog';
import { supportsLevelVariants } from '../lib/block-capabilities';
import type { LearningLevel, LessonBlock, ReadinessReport } from '../lib/types';
import { readableLevel } from '../lib/ui-messages';

const LEVELS: LearningLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const LINK = 'text-xs font-medium text-amber-900 underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 rounded-xs';

export interface ReadinessState {
  report: ReadinessReport | null;
  /** A failed readiness request (shown as a failure, never as "no problems"). */
  failed: string | null;
  checking: boolean;
}

interface Props {
  blocks: LessonBlock[];
  /** The levels the lesson is offered at (lesson.levels). */
  offeredLevels: LearningLevel[];
  readiness: ReadinessState;
  /** Scrolls to and focuses the block (where its visibility is edited). */
  onGoToBlock: (blockId: string, level?: LearningLevel) => void;
}

/**
 * A compact, read-only table of the WORKING lesson: rows are the blocks in order, columns the three levels. THREE things are kept apart:
 *  1. Visibility: "Shown" / "Hidden" within a level the lesson offers, or "Not offered" when the lesson itself does not offer the level. A block is shown at
 *     a level when it has a level setting for it (the backend resolver's rule 2).
 *  2. Content resolution: what the resolver would do with a shown block. A stored per-level JSON value does NOT mean it is used: the resolver uses a variant
 *     only for a block type that SUPPORTS variants (see block-capabilities.ts), so a stored variant on any other type makes the block unresolved
 *     (BLOCK_VARIANT_NOT_ALLOWED) and blocks publishing. The cell says exactly that (from the block type's variant support, and from the resolver's own diagnostic
 *     in the readiness report when it is available); a variant on a type that supports them is reported as such. The old label "own content" is gone.
 *  3. Readiness: the last rows, from the readiness report the review panel already fetched. A failed request is a failure, never "no problems"; an earlier
 *     result is marked as earlier. This is working content, not what is published.
 */
export default function LevelCoverage({ blocks, offeredLevels, readiness, onGoToBlock }: Props) {
  const offered = (level: LearningLevel) => offeredLevels.includes(level);
  const { report, failed, checking } = readiness;

  const readinessCell = (level: LearningLevel): string => {
    if (!offered(level)) return 'Not offered';
    if (!report) return failed ? 'Could not be checked' : 'Checking…';
    const problems = report.issues.filter((i) => i.level === level);
    const stale = checking || failed ? ' (earlier check)' : '';
    return `${problems.length === 0 ? 'No problems found' : problems.length === 1 ? '1 problem' : `${problems.length} problems`}${stale}`;
  };
  const counts = (level: LearningLevel): string => {
    if (!offered(level)) return '—';
    const row = report?.levels.find((l) => l.level === level);
    return row ? `${row.visibleBlocks} shown, ${row.resolvedBlocks} ready to publish` : report ? 'Not reported' : '…';
  };
  const lessonWide = report?.issues.filter((i) => !i.level).length ?? 0;

  return (
    <details className="bg-white border border-slate-200 rounded-xl p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 rounded-xs">
        Level coverage (working copy)
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-slate-700">
          This shows the lesson as you are editing it, not what learners see now. &ldquo;Shown&rdquo; and &ldquo;Hidden&rdquo; are about each block; &ldquo;Not offered&rdquo; means the
          lesson itself is not available at that level. Whether a shown block's content can be resolved is noted under it, and whether a level is ready to publish is a separate check, shown in the last rows.
        </p>
        {blocks.length === 0 ? (
          <p className="text-sm text-slate-700">This lesson has no blocks yet.</p>
        ) : (
          <div className="overflow-x-auto" tabIndex={0} aria-label="Level coverage table, scrolls sideways on narrow screens">
            <table className="w-full min-w-[32rem] text-sm text-left border-collapse">
              <caption className="sr-only">Which blocks are shown at each learning level in the working copy of this lesson, followed by readiness for each level</caption>
              <thead>
                <tr className="border-b border-slate-200">
                  <th scope="col" className="py-2 pr-3 font-semibold text-slate-800">Block</th>
                  {LEVELS.map((level) => (
                    <th key={level} scope="col" className="py-2 px-2 font-semibold text-slate-800">
                      {readableLevel(level)}
                      <span className="block text-[11px] font-normal text-slate-700">{offered(level) ? 'Offered' : 'Not offered by this lesson'}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {blocks.map((block, index) => (
                  <tr key={block.id} className="border-b border-slate-100 align-top">
                    <th scope="row" className="py-2 pr-3 font-medium text-slate-900">
                      {index + 1}. {friendlyBlockName(block.type)}
                    </th>
                    {LEVELS.map((level) => {
                      const setting = block.levels.find((l) => l.level === level);
                      return (
                        <td key={level} className="py-2 px-2 text-slate-800">
                          {!offered(level) ? (
                            <span className="text-slate-600">Not offered</span>
                          ) : setting ? (
                            <span>
                              <span className="font-medium">
                                <span aria-hidden="true">✓ </span>Shown
                              </span>
                              {(() => {
                                const diagnostic = report?.issues.find((i) => i.source === 'RESOLVER' && i.blockId === block.id && i.level === level);
                                if (diagnostic) return <span className="block text-xs text-rose-900">Cannot be resolved: {diagnostic.message}{checking || failed ? ' (earlier check)' : ''}</span>;
                                if (setting.content && !supportsLevelVariants(block.type)) {
                                  return <span className="block text-xs text-rose-900">A level variant is stored, but this block type does not support variants, so the block cannot be resolved and publishing is blocked until the variant is removed.</span>;
                                }
                                if (setting.content) return <span className="block text-xs text-slate-700">Uses its own {readableLevel(level)} version at this level.</span>;
                                return null;
                              })()}
                            </span>
                          ) : (
                            <span className="text-slate-700">
                              <span aria-hidden="true">– </span>Hidden{' '}
                              <button type="button" className={LINK} onClick={() => onGoToBlock(block.id, level)} aria-label={`Go to block ${index + 1}, ${friendlyBlockName(block.type)}, to change its visibility at ${readableLevel(level)}`}>
                                Change
                              </button>
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-300 align-top">
                  <th scope="row" className="py-2 pr-3 font-semibold text-slate-800">Blocks counted by the check</th>
                  {LEVELS.map((level) => (
                    <td key={level} className="py-2 px-2 text-slate-800">{counts(level)}</td>
                  ))}
                </tr>
                <tr className="align-top">
                  <th scope="row" className="py-2 pr-3 font-semibold text-slate-800">Readiness</th>
                  {LEVELS.map((level) => (
                    <td key={level} className={`py-2 px-2 ${failed && !report && offered(level) ? 'text-rose-800 font-medium' : 'text-slate-800'}`}>{readinessCell(level)}</td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {failed && (
          <p role="alert" className="text-xs text-rose-900">
            The readiness check could not be completed, so the readiness row does not say the lesson is fine. {failed}
          </p>
        )}
        {report && lessonWide > 0 && <p className="text-xs text-amber-900">{lessonWide === 1 ? '1 problem applies' : `${lessonWide} problems apply`} to the lesson as a whole, not to one level. See the review section below.</p>}
        <p className="text-xs text-slate-700">Blocks of the types that offer &ldquo;Level-specific content&rdquo; can have their own version for a level; every other block shows the same content wherever it is shown. Per-item level settings are not part of this table.</p>
      </div>
    </details>
  );
}
