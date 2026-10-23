import { type AnimationKind, ANIMATION_KINDS } from './media-kinds';
import { type ScriptureEntryDraft, buildScriptureList, readScriptureEntries } from './scripture-info';

/**
 * NARRATIVE_SCENE and MEDIA_ANIMATION blocks (backend/src/modules/lessons/domain/blocks/scene-media.ts). PROPOSED schemas, not approved.
 *   NARRATIVE_SCENE: { title?, image?: { mediaId, altText }, narrative, scripture? }       ("predefined transition/effect": undecided, D8: not implemented)
 *   MEDIA_ANIMATION: { mediaType: 'ANIMATED_IMAGE' | 'VIDEO' | 'LOTTIE', mediaId, posterMediaId?, caption?, altText }   (animated WebP, MP4 video, Lottie JSON)
 */
export const SCENE_LIMITS = { title: 200, narrative: 600, altText: 500 } as const;
export const ANIMATION_LIMITS = { caption: 500, altText: 500 } as const;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value : '');

export interface SceneContent {
  title: string;
  mediaId: string;
  altText: string;
  narrative: string;
  scripture: ScriptureEntryDraft[];
  scriptureRaw?: unknown;
}
export const EMPTY_SCENE: SceneContent = { title: '', mediaId: '', altText: '', narrative: '', scripture: [] };

export function readScene(content: unknown): SceneContent {
  const c = isObject(content) ? content : {};
  const image = isObject(c.image) ? c.image : {};
  return { title: text(c.title), mediaId: text(image.mediaId), altText: text(image.altText), narrative: text(c.narrative), scripture: readScriptureEntries(c.scripture), scriptureRaw: c.scripture };
}

export function buildScene(draft: SceneContent): Record<string, unknown> {
  const out: Record<string, unknown> = { narrative: draft.narrative.trim() };
  if (draft.title.trim()) out.title = draft.title.trim();
  if (draft.mediaId) out.image = { mediaId: draft.mediaId, altText: draft.altText.trim() };
  const scripture = buildScriptureList(draft.scripture);
  if (scripture) out.scripture = scripture;
  return out;
}

export function sceneReadiness(c: SceneContent): string[] {
  const out: string[] = [];
  if (!c.narrative.trim()) out.push('Write the narrative text.');
  if (c.mediaId && !c.altText.trim()) out.push('Describe the visual (alternative text).');
  return out;
}

export interface AnimationContent {
  mediaType: AnimationKind;
  mediaId: string;
  posterMediaId: string;
  caption: string;
  altText: string;
}
export const EMPTY_ANIMATION: AnimationContent = { mediaType: 'ANIMATED_IMAGE', mediaId: '', posterMediaId: '', caption: '', altText: '' };

export function readAnimation(content: unknown): AnimationContent {
  const c = isObject(content) ? content : {};
  // A block saved before video and Lottie existed names ANIMATED_IMAGE (or, in a draft, nothing): both read as an animated image.
  const mediaType = ANIMATION_KINDS.find((kind) => kind.value === c.mediaType)?.value ?? 'ANIMATED_IMAGE';
  return { mediaType, mediaId: text(c.mediaId), posterMediaId: text(c.posterMediaId), caption: text(c.caption), altText: text(c.altText) };
}

export function buildAnimation(draft: AnimationContent): Record<string, unknown> {
  const out: Record<string, unknown> = { mediaType: draft.mediaType, altText: draft.altText.trim() };
  if (draft.mediaId) out.mediaId = draft.mediaId;
  if (draft.posterMediaId) out.posterMediaId = draft.posterMediaId;
  if (draft.caption.trim()) out.caption = draft.caption.trim();
  return out;
}

export function animationReadiness(c: AnimationContent): string[] {
  const out: string[] = [];
  if (!c.mediaId) out.push(c.mediaType === 'VIDEO' ? 'Choose the video.' : c.mediaType === 'LOTTIE' ? 'Choose the Lottie animation.' : 'Choose the animated image.');
  if (!c.altText.trim()) out.push(`Write the accessibility text (what the ${c.mediaType === 'VIDEO' ? 'video' : 'animation'} shows).`);
  return out;
}
