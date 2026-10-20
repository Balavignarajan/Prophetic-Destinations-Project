import { type ContentProblem, isMarkupLikeKey } from './rich-text.js';

/**
 * CONTINUE_EXPLORING content contract (feature register BLK-022 "Continue Exploring": "manual links to next/related lessons. This is curated linking,
 * not AI/intelligent recommendation"; workbook Data Model "RelatedLesson": source, target, label, sort_order, level flags). The identifier is NEW and
 * PROPOSED (open decision D1: the guide's component list does not include it); it is added with migration AddContinueExploringBlockType1791810000000.
 * The schema is PROPOSED, NOT APPROVED:
 *
 *   { "title": "optional heading",
 *     "links": [ { "id": "k-ab12cd", "lessonId": "<uuid of the target lesson>", "label": "optional custom text", "levels": ["BEGINNER", ...] }, ... ] }
 *
 *  - These links belong to THIS BLOCK. They are separate from the lesson-metadata "Related lessons" (CMS-006 / CMS-027, table lesson_related): the two
 *    lists are never copied into each other or kept in sync, and each is edited, approved and published on its own.
 *  - `links` keep the author's order. `label` (plain text, at most 120 characters) is shown instead of the target's published title; without it the
 *    target's own published title is used. `levels` is the link's own visibility (absent = every level; otherwise a non-empty subset), separate from
 *    the target lesson's availability and from the BLOCK's visibility (ordinary block level visibility still applies).
 *  - Nothing is recommended or inferred. At most 10 links; a target appears once; a lesson cannot link to itself (checked when the block is saved,
 *    where the lesson is known). Targets are resolved for learners at request time from published content only (see PublishedCatalogService).
 *  - No level variants (D3).
 * A draft may be incomplete; publishing needs at least one link.
 */
export const EXPLORING_LIMITS = { maxTitleLength: 200, maxLinks: 10, maxLabelLength: 120, maxIdLength: 40 } as const;
const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9_-]+$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkKeys(content: Record<string, unknown>, allowed: readonly string[], prefix: string, label: string, problems: ContentProblem[]): void {
  for (const key of Object.keys(content)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isMarkupLikeKey(key)) problems.push({ path, message: `${label}markup-like key "${key}" is not allowed` });
    else if (!allowed.includes(key)) problems.push({ path, message: `${label}unknown key "${key}"` });
  }
}

export function validateContinueExploringShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: 'Continue exploring content must be an object' }];
  const problems: ContentProblem[] = [];
  checkKeys(content, ['title', 'links'], '', '', problems);
  const title = content.title;
  if (title !== undefined) {
    if (typeof title !== 'string') problems.push({ path: 'title', message: 'The title must be text' });
    else if (title.length > EXPLORING_LIMITS.maxTitleLength) problems.push({ path: 'title', message: `The title must be at most ${EXPLORING_LIMITS.maxTitleLength} characters` });
    else if (title.includes('\u0000')) problems.push({ path: 'title', message: 'The title must not contain NUL characters' });
  }
  const links = content.links;
  if (links === undefined) return problems;
  if (!Array.isArray(links)) {
    problems.push({ path: 'links', message: 'links must be a list' });
    return problems;
  }
  if (links.length > EXPLORING_LIMITS.maxLinks) problems.push({ path: 'links', message: `At most ${EXPLORING_LIMITS.maxLinks} links are allowed` });
  const seenIds = new Set<string>();
  const seenTargets = new Set<string>();
  links.slice(0, EXPLORING_LIMITS.maxLinks).forEach((link, index) => {
    const at = `links[${index}]`;
    const n = `Link ${index + 1}`;
    if (!isPlainObject(link)) {
      problems.push({ path: at, message: `${n} must be an object` });
      return;
    }
    checkKeys(link, ['id', 'lessonId', 'label', 'levels'], at, `${n}: `, problems);
    const id = link.id;
    if (typeof id !== 'string' || id.length === 0 || id.length > EXPLORING_LIMITS.maxIdLength || !ID.test(id)) {
      problems.push({ path: `${at}.id`, message: `${n} needs an id of letters, digits, "-" or "_" (up to ${EXPLORING_LIMITS.maxIdLength} characters)` });
    } else if (seenIds.has(id)) {
      problems.push({ path: `${at}.id`, message: `${n} repeats the id of another link` });
    } else {
      seenIds.add(id);
    }
    if (typeof link.lessonId !== 'string' || !UUID.test(link.lessonId)) {
      problems.push({ path: `${at}.lessonId`, message: `${n} must point at a lesson` });
    } else if (seenTargets.has(link.lessonId.toLowerCase())) {
      problems.push({ path: `${at}.lessonId`, message: `${n} links to a lesson that is already linked in this block` });
    } else {
      seenTargets.add(link.lessonId.toLowerCase());
    }
    const label = link.label;
    if (label !== undefined) {
      if (typeof label !== 'string') problems.push({ path: `${at}.label`, message: `${n}: the label must be text` });
      else if (label.length > EXPLORING_LIMITS.maxLabelLength) problems.push({ path: `${at}.label`, message: `${n}: the label must be at most ${EXPLORING_LIMITS.maxLabelLength} characters` });
      // eslint-disable-next-line no-control-regex
      else if (/[\u0000-\u001f\u007f]/.test(label)) problems.push({ path: `${at}.label`, message: `${n}: the label must be plain text on one line` });
    }
    const levels = link.levels;
    if (levels !== undefined) {
      if (!Array.isArray(levels) || levels.length === 0 || !levels.every((l) => (LEVELS as readonly unknown[]).includes(l)) || new Set(levels).size !== levels.length) {
        problems.push({ path: `${at}.levels`, message: `${n}: levels must be a non-empty list of Beginner, Intermediate or Advanced without repeats` });
      }
    }
  });
  return problems;
}

/** What publishing needs: at least one link. Assumes a valid shape. */
export function validateContinueExploringComplete(content: unknown): ContentProblem[] {
  const links = isPlainObject(content) && Array.isArray(content.links) ? content.links : [];
  return links.length === 0 ? [{ path: 'links', message: 'Choose at least one lesson to link to before publishing' }] : [];
}
