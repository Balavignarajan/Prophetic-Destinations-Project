import { api } from './api';
import { IMPLEMENTED_BLOCKS } from './block-catalog';
import { reusableTypeProblem } from './reusable-blocks';
import { describeReference } from './scripture-info';
import type { LearningLevel, ReusableBlock, ReusableBlockSummary } from './types';

/**
 * Pure helpers of the Reusable Blocks library screen (Batches 55 + 56): loading EVERY block, search / filter / sort, the summary counts, the small content preview on a card and which content a
 * level gets. Nothing here writes anything. The backend (backend/src/modules/lessons/domain/reusable-blocks.ts) decides every rule; a reusable block is a TEMPLATE: inserting it into a lesson makes an
 * independent copy, and changing or deleting the template never touches a lesson that already holds one.
 */
export const LIBRARY_LEVELS: readonly LearningLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

// ------------------------------------------------------------------------------------------------------------------------------------ loading

const PAGE = 100;
/** A safety stop, far above any real library (100 pages of 100). */
const MAX_PAGES = 100;

/**
 * Every reusable block, page by page (the list route takes at most 100 at a time and lists the most recently changed first, so the pages never overlap). The library's search, filters, sort and
 * summary counts then cover the complete library, never only a first page. `complete` is false only if the safety stop was reached.
 */
export async function fetchAllReusableBlocks(): Promise<{ items: ReusableBlockSummary[]; total: number; complete: boolean }> {
  const items: ReusableBlockSummary[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await api.request<{ items: ReusableBlockSummary[]; total: number }>(`/admin/reusable-blocks?limit=${PAGE}&offset=${items.length}`);
    total = res.total;
    for (const item of res.items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
      }
    }
    if (res.items.length === 0 || items.length >= total) return { items, total, complete: true };
  }
  return { items, total, complete: items.length >= total };
}

// ------------------------------------------------------------------------------------------------------------------------------------ search, filters, sort

export type SortKey = 'UPDATED_DESC' | 'UPDATED_ASC' | 'NAME_ASC' | 'NAME_DESC';
export const SORT_LABEL: Record<SortKey, string> = { UPDATED_DESC: 'Recently updated', UPDATED_ASC: 'Oldest updated', NAME_ASC: 'Name A–Z', NAME_DESC: 'Name Z–A' };

export interface LibraryFilters {
  search: string;
  /** A block type, or '' for every type. */
  type: string;
  /** A learning level, or '' for every level. */
  level: '' | LearningLevel;
  sort: SortKey;
}

export const DEFAULT_FILTERS: LibraryFilters = { search: '', type: '', level: '', sort: 'UPDATED_DESC' };

export const hasActiveFilters = (f: LibraryFilters): boolean => f.search.trim() !== '' || f.type !== '' || f.level !== '';

/** The types that can be reusable blocks, for the type filter: everything the block catalog knows except the types that cannot be. */
export const FILTER_TYPES = IMPLEMENTED_BLOCKS.filter((block) => reusableTypeProblem(block.type) === null);

const time = (iso: string): number => {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
};
const byName = (a: ReusableBlockSummary, b: ReusableBlockSummary): number => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/**
 * Search (the name, case-insensitive), block type, learning level and sort, together. A block matches a level when that level is among the levels it is visible at (the levels it was saved with).
 * Ties in the sort fall back to the name, so the order never jumps.
 */
export function filterLibrary(items: readonly ReusableBlockSummary[], f: LibraryFilters): ReusableBlockSummary[] {
  const term = f.search.trim().toLowerCase();
  const matches = items.filter(
    (item) => (term === '' || item.name.toLowerCase().includes(term)) && (f.type === '' || item.type === f.type) && (f.level === '' || item.levels.some((entry) => entry.level === f.level)),
  );
  const sorted = [...matches];
  if (f.sort === 'UPDATED_DESC') sorted.sort((a, b) => time(b.updatedAt) - time(a.updatedAt) || byName(a, b));
  else if (f.sort === 'UPDATED_ASC') sorted.sort((a, b) => time(a.updatedAt) - time(b.updatedAt) || byName(a, b));
  else if (f.sort === 'NAME_ASC') sorted.sort(byName);
  else sorted.sort((a, b) => byName(b, a));
  return sorted;
}

// ------------------------------------------------------------------------------------------------------------------------------------ summary

export const RECENT_DAYS = 7;

export interface LibrarySummary {
  total: number;
  typesInUse: number;
  beginner: number;
  intermediate: number;
  advanced: number;
  /** Blocks changed in the last RECENT_DAYS days. */
  recent: number;
}

export function summarizeLibrary(items: readonly ReusableBlockSummary[], now: number = Date.now()): LibrarySummary {
  const since = now - RECENT_DAYS * 24 * 60 * 60 * 1000;
  const at = (level: LearningLevel) => items.filter((item) => item.levels.some((entry) => entry.level === level)).length;
  return {
    total: items.length,
    typesInUse: new Set(items.map((item) => item.type)).size,
    beginner: at('BEGINNER'),
    intermediate: at('INTERMEDIATE'),
    advanced: at('ADVANCED'),
    recent: items.filter((item) => time(item.updatedAt) >= since).length,
  };
}

// ------------------------------------------------------------------------------------------------------------------------------------ which content a level gets

export type LevelContent = { available: true; content: Record<string, unknown> | null; ownVersion: boolean; savedWithoutLevels: boolean } | { available: false };

/**
 * What a lesson at `level` would get from this block when it is inserted, as the server works it out (planInsertion): a level the block was saved with uses that level's own version if it has one,
 * else the shared content; a level it was NOT saved with gets nothing (the block would be left out). A block saved with no levels at all has only its shared content, shown at every level.
 * This only reads the block: it is how the preview simulates a level, and it changes nothing.
 */
export function contentForLevel(block: ReusableBlock, level: LearningLevel): LevelContent {
  if (block.levels.length === 0) return { available: true, content: block.sharedContent, ownVersion: false, savedWithoutLevels: true };
  const entry = block.levels.find((item) => item.level === level);
  if (!entry) return { available: false };
  return { available: true, content: entry.content ?? block.sharedContent, ownVersion: entry.content !== null, savedWithoutLevels: false };
}

/** The level the preview opens at: the first level the block is visible at, else Beginner. */
export const firstPreviewLevel = (block: Pick<ReusableBlock, 'levels'>): LearningLevel => LIBRARY_LEVELS.find((level) => block.levels.some((entry) => entry.level === level)) ?? 'BEGINNER';

// ------------------------------------------------------------------------------------------------------------------------------------ the preview on a card

/** What a card shows of a block's content, in one shape for every type: a few lines of its own text, a picture, a few counts. */
export interface CardPreview {
  eyebrow?: string;
  title?: string;
  body?: string;
  items?: string[];
  /** A Media Library image to show (the block's own picture or poster). */
  imageId?: string | null;
  stats?: string[];
  /** Shown instead of a picture when the block has none of its own. */
  placeholder?: 'cube' | 'video' | 'image';
}

const isRec = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** One line of text: surrounding space gone, runs of spaces and line breaks collapsed. */
export function collapse(text: string): string {
  let out = '';
  let gap = false;
  for (const ch of text) {
    if (ch.trim() === '') {
      gap = out.length > 0;
    } else {
      if (gap) out += ' ';
      gap = false;
      out += ch;
    }
  }
  return out;
}

export function clip(text: string, max: number): string {
  const one = collapse(text);
  return one.length <= max ? one : `${one.slice(0, max - 1).trimEnd()}…`;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** The text of a rich-text document (the editor's saved form), block after block; marks and links add nothing. */
export function richPlainText(node: unknown, depth = 0): string {
  if (depth > 14 || !isRec(node)) return '';
  const own = str(node.text);
  const children = list(node.content);
  let out = own;
  for (const child of children) {
    const inline = isRec(child) && child.type === 'text';
    out += (inline ? '' : ' ') + richPlainText(child, depth + 1);
  }
  return out;
}

/** A picture id from a field that holds either an id or an object with a `mediaId`. */
function imageIdOf(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (isRec(value) && typeof value.mediaId === 'string' && value.mediaId.trim()) return value.mediaId.trim();
  return null;
}

const CALLOUT_LABEL: Record<string, string> = { REMEMBER: 'Remember', KEY_IDEA: 'Key idea', PROPHECY_PRINCIPLE: 'Prophecy principle' };
const ACTIVITY_LABEL: Record<string, string> = { REFLECT: 'Reflect', COMPARE: 'Compare', FIND: 'Find', STUDY: 'Study', READ: 'Read', PERSONAL_APPLICATION: 'Personal application' };
const MEDIA_LABEL: Record<string, string> = { ANIMATED_IMAGE: 'Animated image', VIDEO: 'Video', LOTTIE: 'Animation', YOUTUBE: 'YouTube video' };

/** A passage reference in words: the label the server stamped when the block was saved, else the structured reference spelled out with the book's name. */
function passageLabel(content: Record<string, unknown>, bookNames: Record<string, string>): string {
  const display = str(content.display).trim();
  if (display) return display;
  const ref = content.reference;
  if (isRec(ref) && typeof ref.bookId === 'string' && typeof ref.chapter === 'number' && typeof ref.startVerse === 'number' && typeof ref.endVerse === 'number') {
    return describeReference({ bookId: ref.bookId, chapter: ref.chapter, startVerse: ref.startVerse, endVerse: ref.endVerse }, bookNames);
  }
  return '';
}

/**
 * The card preview of one block's SHARED content, from what that type actually stores (the backend's block schemas): an excerpt of the text, the reference and verse of a passage, a picture's
 * thumbnail, the headline of a timeline with its first events, the hotspot count of an image. Defensive on purpose: a field that is missing is left out, and nothing is invented. Returns null when
 * there is nothing to show, so the card shows its type's plain fallback instead.
 */
export function cardPreview(type: string, content: Record<string, unknown> | null, bookNames: Record<string, string> = {}): CardPreview | null {
  if (!isRec(content)) return null;
  const c = content;
  switch (type) {
    case 'RICH_TEXT': {
      const body = clip(richPlainText(c), 200);
      return body ? { body } : null;
    }
    case 'SECTION_INTRO': {
      const title = str(c.title).trim();
      return title || imageIdOf(c.image) ? { eyebrow: 'Section heading', title, body: clip(str(c.subtitle), 120), imageId: imageIdOf(c.image) } : null;
    }
    case 'CALLOUT': {
      const label = CALLOUT_LABEL[str(c.calloutType)] ?? 'Callout';
      const title = str(c.title).trim();
      const body = clip(str(c.body), 180);
      return title || body ? { eyebrow: label, title, body } : null;
    }
    case 'SUMMARY': {
      const items = list(c.takeaways).filter((item): item is string => typeof item === 'string' && item.trim() !== '');
      const heading = str(c.heading).trim();
      const stats = [plural(items.length, 'key idea', 'key ideas')];
      return heading || items.length > 0 ? { title: heading, items: items.slice(0, 3).map((item) => clip(item, 90)), stats } : null;
    }
    case 'SCRIPTURE_PASSAGE': {
      const label = passageLabel(c, bookNames);
      const verses = list(c.verses)
        .map((verse) => (isRec(verse) ? str(verse.text).trim() : ''))
        .filter(Boolean)
        .join(' ');
      const body = clip(verses || str(c.commentary), 190);
      return label || body ? { eyebrow: 'Scripture', title: label, body } : null;
    }
    case 'SCRIPTURE_CONNECTION': {
      const connections = list(c.connections).filter(isRec);
      const labels = connections.map((item) => str(item.label).trim()).filter(Boolean);
      const title = str(c.title).trim();
      return title || connections.length > 0 ? { title, items: labels.slice(0, 3), stats: [plural(connections.length, 'connection', 'connections')] } : null;
    }
    case 'EXPLORE_DEEPER': {
      const title = str(c.title).trim();
      const nested = list(c.blocks).length;
      return title || str(c.intro).trim() ? { eyebrow: 'Explore deeper', title, body: clip(str(c.intro), 150), stats: nested > 0 ? [plural(nested, 'block inside', 'blocks inside')] : [] } : null;
    }
    case 'HISTORICAL_EVIDENCE': {
      const title = str(c.title).trim();
      const date = str(c.dateLabel).trim();
      return title || str(c.explanation).trim() ? { eyebrow: date || 'Historical evidence', title, body: clip(str(c.explanation), 150), imageId: imageIdOf(c.image) } : null;
    }
    case 'IMAGE': {
      const imageId = imageIdOf(c.mediaId);
      const body = clip(str(c.caption) || str(c.altText), 120);
      return imageId || body ? { imageId, body, placeholder: 'image' } : null;
    }
    case 'INTERACTIVE_IMAGE':
    case 'MAP': {
      const imageId = imageIdOf(c.mediaId);
      const count = list(c.hotspots).length;
      const noun = type === 'MAP' ? plural(count, 'marker', 'markers') : plural(count, 'hotspot', 'hotspots');
      const title = type === 'MAP' ? str(c.title).trim() : '';
      return imageId || count > 0 ? { eyebrow: type === 'MAP' ? 'Map or diagram' : 'Interactive image', title, imageId, body: clip(str(c.caption) || str(c.altText), 100), stats: count > 0 ? [noun] : [], placeholder: 'image' } : null;
    }
    case 'WORD_STUDY': {
      const english = str(c.englishWord).trim();
      const original = [str(c.originalWord).trim(), str(c.transliteration).trim()].filter(Boolean).join(' · ');
      return english || original ? { eyebrow: 'Word study', title: english, body: [original, clip(str(c.definition), 120)].filter(Boolean).join(' — ') } : null;
    }
    case 'SYMBOL_STUDY': {
      const symbol = str(c.symbol).trim();
      return symbol || str(c.meaning).trim() ? { eyebrow: 'Symbol study', title: symbol, body: clip(str(c.meaning) || str(c.explanation), 150), imageId: imageIdOf(c.image) } : null;
    }
    case 'PROPHECY_EQUIVALENCE': {
      const items = list(c.items).filter(isRec);
      const lines = items.map((item) => str(item.expression).trim() || str(item.label).trim()).filter(Boolean);
      const concept = str(c.concept).trim();
      return concept || items.length > 0 ? { eyebrow: 'Prophecy equivalence', title: concept, items: lines.slice(0, 3).map((line) => clip(line, 80)), stats: [plural(items.length, 'expression', 'expressions')] } : null;
    }
    case 'PROPHECY_COMPARISON': {
      const entities = list(c.entities).filter(isRec);
      const names = entities.map((item) => str(item.name).trim()).filter(Boolean);
      const title = str(c.title).trim();
      return title || entities.length > 0 ? { eyebrow: 'Prophecy comparison', title, items: names.slice(0, 3), stats: [plural(entities.length, 'entity', 'entities')] } : null;
    }
    case 'PROPHECY_CALCULATION': {
      const steps = list(c.steps).length;
      const title = str(c.title).trim();
      return title || steps > 0 ? { eyebrow: 'Prophecy calculation', title, stats: [plural(steps, 'step', 'steps')] } : null;
    }
    case 'REFLECTION_STUDY_ACTIVITY': {
      const body = clip(str(c.instruction), 180);
      return body ? { eyebrow: ACTIVITY_LABEL[str(c.activityType)] ?? 'Study activity', body } : null;
    }
    case 'GUIDED_DISCOVERY_QUESTION': {
      const body = clip(str(c.question), 180);
      return body ? { eyebrow: 'Guided question', body } : null;
    }
    case 'NARRATIVE_SCENE': {
      const title = str(c.title).trim();
      return title || str(c.narrative).trim() ? { eyebrow: 'Narrative scene', title, body: clip(str(c.narrative), 150), imageId: imageIdOf(c.image) } : null;
    }
    case 'MEDIA_ANIMATION': {
      const body = clip(str(c.caption) || str(c.description), 120);
      const poster = imageIdOf(c.posterMediaId);
      const animatedImage = str(c.mediaType) === 'ANIMATED_IMAGE' ? imageIdOf(c.mediaId) : null;
      return { eyebrow: MEDIA_LABEL[str(c.mediaType)] ?? 'Video or animation', body, imageId: poster ?? animatedImage, placeholder: 'video' };
    }
    case 'INTERACTIVE_3D_MODEL': {
      const hotspots = list(c.hotspots).length;
      return { eyebrow: '3D model', title: str(c.title).trim(), body: clip(str(c.description), 110), imageId: imageIdOf(c.posterMediaId), stats: hotspots > 0 ? [plural(hotspots, 'hotspot', 'hotspots')] : [], placeholder: 'cube' };
    }
    case 'TIMELINE': {
      const events = list(c.events).filter(isRec);
      const first = events.slice(0, 3).map((event) => [str(event.dateLabel).trim(), str(event.title).trim()].filter(Boolean).join(' — ')).filter(Boolean);
      const heading = str(c.heading).trim();
      return heading || events.length > 0 ? { eyebrow: 'Timeline', title: heading, items: first.map((line) => clip(line, 80)), stats: [plural(events.length, 'event', 'events')] } : null;
    }
    default:
      return null;
  }
}
