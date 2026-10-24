/**
 * Lesson tags (CMS-021): short labels an admin uses to organise lessons (for example "Daniel" or "Kingdoms"). Admin organisation only: they are not shown to learners, are not
 * part of a published lesson and are not tied to a learning level. The limits and rules mirror the backend (TAG_LIMITS and checkTags in lesson-rules.ts), which enforces them;
 * this only gives the author the reason immediately. No runtime imports: unit-testable with plain Node.
 */
export const TAG_MAX_COUNT = 10;
export const TAG_MAX_LENGTH = 40;

/** Inner whitespace collapsed to single spaces and surrounding whitespace removed; the author's own capitalisation is kept. */
export const normalizeTag = (raw: string): string => raw.replace(/\s+/g, ' ').trim();

/** Tags are compared without regard to capitalisation: "Daniel" and "daniel" are the same tag. */
export const tagKey = (tag: string): string => normalizeTag(tag).toLowerCase();

/** Whether two lists are exactly the same (same tags, same capitalisation, same order): unsaved-change detection. */
export function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

export interface AddTagsResult {
  /** The list after adding (unchanged when there is a problem). */
  tags: string[];
  /** What is wrong, in plain words, or null. When set, NOTHING was added. */
  problem: string | null;
}

/**
 * Adds what was typed to the tags. Several tags can be typed or pasted at once, separated by commas or line breaks. All or nothing: if any part is empty after trimming,
 * too long, a repeat of a tag already there (any capitalisation) or would pass the limit, the list stays as it was and the reason is returned.
 */
export function addTags(current: readonly string[], input: string): AddTagsResult {
  const parts = input.split(/[,\n]/).map(normalizeTag).filter((part) => part !== '');
  if (parts.length === 0) return { tags: [...current], problem: 'Type a tag first.' };
  const next = [...current];
  const seen = new Set(current.map(tagKey));
  for (const part of parts) {
    for (const character of part) {
      const code = character.codePointAt(0) ?? 0;
      if (code < 32 || code === 127) return { tags: [...current], problem: `"${part}" contains a character that cannot be used in a tag.` };
    }
    if (part.length > TAG_MAX_LENGTH) return { tags: [...current], problem: `A tag can be at most ${TAG_MAX_LENGTH} characters. "${part.slice(0, 20)}…" is ${part.length}.` };
    if (seen.has(tagKey(part))) return { tags: [...current], problem: `"${part}" is already a tag of this lesson (tags are not case-sensitive).` };
    if (next.length >= TAG_MAX_COUNT) return { tags: [...current], problem: `A lesson can have at most ${TAG_MAX_COUNT} tags. Remove one to add another.` };
    seen.add(tagKey(part));
    next.push(part);
  }
  return { tags: next, problem: null };
}

/** The tags without the one given (compared as the same tag, any capitalisation). */
export const removeTag = (current: readonly string[], tag: string): string[] => current.filter((existing) => tagKey(existing) !== tagKey(tag));
