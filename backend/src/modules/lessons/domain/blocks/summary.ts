import { type ContentProblem, isMarkupLikeKey } from './rich-text.js';
import { validateScriptureEntries } from './scripture-refs.js';

/**
 * SUMMARY content contract (feature register BLK-021 "Lesson Summary": "key ideas; key Scripture; prophecy takeaway; spiritual/
 * application takeaway"). PROPOSED, NOT APPROVED (no schema is approved in the repository):
 *
 *   {
 *     "heading": "optional short title",
 *     "takeaways": ["key idea", ...],                  // the KEY IDEAS (see compatibility below)
 *     "keyScripture": [ { reference, dataset?, refresh? }, ... ],   // optional, up to 5 passages (scripture-refs.ts)
 *     "prophecyTakeaways": ["…", ...],                 // optional
 *     "applicationTakeaways": ["…", ...]               // optional, the "spiritual/application takeaway"
 *   }
 *
 * COMPATIBILITY: before these fields existed a summary was { heading?, takeaways }. That payload is still valid, unchanged and stored
 * as it is: `takeaways` IS the key ideas list (the key name is kept so nothing is migrated or rewritten, and published snapshots are
 * never touched). The three new fields are optional and never required of an older summary.
 *
 * Plain text only, never markup. Each text list is ORDERED (the order is the display order). A draft may be incomplete; publishing
 * requires at least one item in some section (a key idea, a prophecy or application takeaway, or a key Scripture passage) and no blank
 * text entries. Key Scripture is stored as structured references only (never Bible text): the server stamps each with the installed
 * text's fingerprint, and publication freezes the verified passage into the snapshot (ScriptureEmbedService). A summary WITHOUT
 * key Scripture needs no Scripture text at all.
 * The guide's "next study" is undecided (open question D2) and is deliberately NOT part of this contract: unknown keys are rejected.
 * Level variants are not supported until the owners decide how a summary differs by level.
 */
export const SUMMARY_LIMITS = {
  maxHeadingLength: 200,
  maxTakeaways: 20,
  maxTakeawayLength: 600,
} as const;

const ALLOWED_KEYS = ['heading', 'takeaways', 'keyScripture', 'prophecyTakeaways', 'applicationTakeaways'] as const;

/** The ordered text lists of a summary: the stored key, and how the section is called in messages. */
export const SUMMARY_TEXT_LISTS = [
  { key: 'takeaways', label: 'key idea', section: 'Key ideas' },
  { key: 'prophecyTakeaways', label: 'prophecy takeaway', section: 'Prophecy takeaways' },
  { key: 'applicationTakeaways', label: 'application takeaway', section: 'Application takeaways' },
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateSummaryShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) {
    return [{ path: '', message: 'Summary content must be an object' }];
  }
  const problems: ContentProblem[] = [];
  for (const key of Object.keys(content)) {
    if (isMarkupLikeKey(key)) {
      problems.push({ path: key, message: `Markup-like key "${key}" is not allowed` });
    } else if (!(ALLOWED_KEYS as readonly string[]).includes(key)) {
      problems.push({ path: key, message: `Unknown key "${key}"` });
    }
  }

  const { heading } = content;
  if (heading !== undefined && heading !== null) {
    if (typeof heading !== 'string') {
      problems.push({ path: 'heading', message: 'heading must be text' });
    } else if (heading.length > SUMMARY_LIMITS.maxHeadingLength) {
      problems.push({
        path: 'heading',
        message: `The heading must be at most ${SUMMARY_LIMITS.maxHeadingLength} characters`,
      });
    } else if (heading.includes('\u0000')) {
      problems.push({ path: 'heading', message: 'heading must not contain NUL characters' });
    }
  }

  for (const list of SUMMARY_TEXT_LISTS) {
    const items = content[list.key];
    if (items === undefined && list.key !== 'takeaways') continue;
    if (!Array.isArray(items)) {
      problems.push({ path: list.key, message: `${list.key} must be a list of text items` });
      continue;
    }
    if (items.length > SUMMARY_LIMITS.maxTakeaways) {
      problems.push({ path: list.key, message: `${list.section} can have at most ${SUMMARY_LIMITS.maxTakeaways} items` });
    }
    items.slice(0, SUMMARY_LIMITS.maxTakeaways).forEach((item, index) => {
      const path = `${list.key}[${index}]`;
      const n = `${list.section}, item ${index + 1}`;
      if (typeof item !== 'string') {
        problems.push({ path, message: `${n} must be text` });
      } else if (item.length > SUMMARY_LIMITS.maxTakeawayLength) {
        problems.push({ path, message: `${n} must be at most ${SUMMARY_LIMITS.maxTakeawayLength} characters` });
      } else if (item.includes('\u0000')) {
        problems.push({ path, message: `${n} must not contain NUL characters` });
      }
    });
  }
  validateScriptureEntries(content.keyScripture, 'keyScripture', 'Key Scripture', problems);
  return problems;
}

/** What publishing needs: at least one item somewhere, and no empty text entries. Assumes a valid shape. */
export function validateSummaryComplete(content: unknown): ContentProblem[] {
  const problems: ContentProblem[] = [];
  const source = isPlainObject(content) ? content : {};
  let total = Array.isArray(source.keyScripture) ? source.keyScripture.length : 0;
  for (const list of SUMMARY_TEXT_LISTS) {
    const items = Array.isArray(source[list.key]) ? (source[list.key] as unknown[]) : [];
    total += items.length;
    items.forEach((item, index) => {
      if (typeof item !== 'string' || item.trim().length === 0) {
        problems.push({
          path: `${list.key}[${index}]`,
          message: `${list.section}, item ${index + 1} is empty. Write it or remove it before publishing`,
        });
      }
    });
  }
  if (total === 0) {
    problems.push({ path: 'takeaways', message: 'Add at least one key idea (or another summary item) before publishing' });
  }
  return problems;
}
