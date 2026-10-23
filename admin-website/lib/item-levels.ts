/**
 * Level visibility of the ITEMS inside a block: a hotspot, a map marker, a timeline event (CMS-016, CMS-017; backend blocks/item-levels.ts).
 * An item may carry `levels`: a non-empty list of level names. No `levels` means every level the block itself is shown at, which is what every item written
 * before this existed has. The server leaves an item out of the lesson of any other level, so a learner never receives it. No imports: usable anywhere.
 */
export const ITEM_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export const ITEM_LEVEL_NAMES: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

/**
 * The stored `levels` of an item as the editor shows it: null = every level (no setting, or all three ticked, which means the same), otherwise the ticked levels in
 * the usual order. A stored empty list is kept as an empty list so the editor can say it is not allowed instead of quietly widening it.
 */
export function readItemLevels(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ticked = ITEM_LEVELS.filter((level) => value.includes(level));
  return ticked.length === ITEM_LEVELS.length ? null : ticked;
}

/** What to save for the ticked levels: all three = nothing (every level), otherwise the subset in the usual order. */
export const itemLevelsToSave = (ticked: readonly string[]): string[] | null => (ticked.length === ITEM_LEVELS.length ? null : ITEM_LEVELS.filter((level) => ticked.includes(level)));

/** The `levels` field to spread into a saved item: nothing for every level (and for an unusable empty choice, which the editor does not let be saved). */
export const levelsField = (levels: readonly string[] | null | undefined): { levels?: string[] } => (levels && levels.length > 0 && levels.length < ITEM_LEVELS.length ? { levels: ITEM_LEVELS.filter((level) => levels.includes(level)) } : {});

/** "Intermediate, Advanced" for a restricted item, or null when it has no restriction. */
export const restrictedLevelsText = (levels: readonly string[] | null | undefined): string | null =>
  levels && levels.length > 0 && levels.length < ITEM_LEVELS.length ? levels.map((level) => ITEM_LEVEL_NAMES[level] ?? level).join(', ') : null;

/** True when some item's choice is empty (not allowed: an item hidden at every level). */
export const hasEmptyLevelChoice = (items: readonly { levels?: string[] | null }[]): boolean => items.some((item) => Array.isArray(item.levels) && item.levels.length === 0);
