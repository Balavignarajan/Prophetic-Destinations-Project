import { LEARNING_LEVELS, type LearningLevel } from '../../../../shared-kernel/index.js';
import type { ContentProblem } from './rich-text.js';

/**
 * Level visibility of the ITEMS inside a block: a hotspot of an interactive image, a marker of a map and an event of a timeline. Pure rules; no database.
 *
 * AUTHORITY: the workbook asks for it for exactly these items. CMS-016 (Image hotspot editor): "configure label, explanation, Scripture/references and level
 * visibility for each hotspot"; CMS-017 (Timeline editor): "create ordered timeline events with date/period, title, description, Scripture, optional image and level
 * visibility"; Data Model: Hotspot and TimelineEvent carry "level flags". A map's markers are the same hotspots (BLK-014 "markers/hotspots"; one contract, one editor).
 * NOT covered: the prophecy blocks (equivalence, comparison, calculation). CMS-024 / CMS-025 and the Data Model give their items no level flags, so none is added.
 *
 * SHAPE: an item may carry `levels`, a non-empty list of distinct level names (the same names, order and meaning as everywhere else: BEGINNER, INTERMEDIATE,
 * ADVANCED). No `levels` (every item written before this existed) means every level the block itself is shown at, exactly as before. This is separate from, and
 * applied after, the block's own level visibility: the block decides whether a learner sees it at all, `levels` decides which of its items they get.
 *
 * WHERE IT IS APPLIED: when the lesson is resolved for a level (level-resolution.ts), i.e. in the preview and when the lesson is checked and published. The
 * published snapshot of a level therefore holds only that level's items, in the author's order, with their ids and positions untouched, and without the `levels`
 * field. An item reserved for another level never reaches the learner API or the app, and the app does no filtering of its own.
 */
export const ITEM_LEVEL_LISTS: Readonly<Record<string, string>> = {
  INTERACTIVE_IMAGE: 'hotspots',
  MAP: 'hotspots',
  TIMELINE: 'events',
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Shape check of an item's optional `levels`. `label` names the item in messages ("Hotspot 2"). */
export function checkItemLevels(item: Record<string, unknown>, path: string, label: string, problems: ContentProblem[]): void {
  const value = item.levels;
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length === 0) {
    problems.push({ path, message: `${label}: levels must be a list with at least one level` });
    return;
  }
  const seen = new Set<unknown>();
  for (const level of value) {
    if (!(LEARNING_LEVELS as readonly unknown[]).includes(level)) problems.push({ path, message: `${label}: "${String(level)}" is not a level (use ${LEARNING_LEVELS.join(', ')})` });
    else if (seen.has(level)) problems.push({ path, message: `${label}: ${String(level)} is listed twice` });
    seen.add(level);
  }
}

/**
 * Whether an item is shown at `level`. An item without `levels` is shown at every level; one whose `levels` is present but unusable is NOT shown (it fails closed:
 * the shape check refuses such content, so this only matters for content that never passed it).
 */
export function itemVisibleAt(item: unknown, level: LearningLevel): boolean {
  if (!isPlainObject(item) || item.levels === undefined) return true;
  return Array.isArray(item.levels) && item.levels.includes(level);
}

/**
 * `content` as a learner at `level` receives it: for the block types that have level-reserved items, only the items shown at that level, in their original
 * order, with their ids and every other field unchanged and without `levels`. Content without any `levels` (and every other block type) is returned as it is,
 * the very same object.
 */
export function contentForLevel(type: string, content: Record<string, unknown>, level: LearningLevel): Record<string, unknown> {
  const key = ITEM_LEVEL_LISTS[type];
  if (!key) return content;
  const items = content[key];
  if (!Array.isArray(items) || !items.some((item) => isPlainObject(item) && item.levels !== undefined)) return content;
  const visible = items
    .filter((item) => itemVisibleAt(item, level))
    .map((item) => {
      if (!isPlainObject(item) || item.levels === undefined) return item;
      const { levels: _levels, ...rest } = item;
      void _levels;
      return rest;
    });
  return { ...content, [key]: visible };
}
