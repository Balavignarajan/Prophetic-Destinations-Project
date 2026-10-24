/**
 * Level-specific content ("versions"): a block of a type that supports variants (lib/block-capabilities.ts) keeps its ONE shared content and may also hold a
 * complete version of that content for the Beginner, Intermediate and/or Advanced level. A level without a version shows the shared content. A version is saved
 * through PUT /admin/lessons/:lessonId/blocks/:blockId/levels/:level (`content` = the version; null = no version) and the backend does the resolving, so nothing
 * here decides what a learner sees. No runtime imports: unit-testable with plain Node.
 */

/** How one level of a block is set up, as the editor shows it. */
export type LevelVersionState =
  /** The lesson is not offered at this level, so the block cannot be shown (or have a version) there. */
  | 'not-offered'
  /** The block is hidden at this level: it has no level setting. A version needs the block to be shown first. */
  | 'hidden'
  /** Shown at this level with the shared content. */
  | 'shared'
  /** Shown at this level with its own version. */
  | 'version';

export interface LevelSettingLike {
  level: string;
  content: Record<string, unknown> | null;
}

/** What a level of a block is: see `LevelVersionState`. `offered` = the levels the lesson is available at. */
export function levelVersionState(settings: readonly LevelSettingLike[], offered: readonly string[], level: string): LevelVersionState {
  if (!offered.includes(level)) return 'not-offered';
  const setting = settings.find((entry) => entry.level === level);
  if (!setting) return 'hidden';
  return setting.content !== null ? 'version' : 'shared';
}

/** The version a block has for a level, or null (hidden, or shown with the shared content). */
export function levelVersionOf(settings: readonly LevelSettingLike[], level: string): Record<string, unknown> | null {
  return settings.find((entry) => entry.level === level)?.content ?? null;
}

/** Wording of a dialog that edits ONE level's version of a block instead of the shared content; null when it is editing the shared content. */
export function versionWording(levelLabel: string | undefined, noun: string): { title: string; description: string; save: string } | null {
  if (!levelLabel) return null;
  return {
    title: `Edit ${levelLabel} version of this ${noun}`,
    description: `Learners at the ${levelLabel} level see this version instead of the shared ${noun}. Other levels are not affected.`,
    save: `Save ${levelLabel} version`,
  };
}
