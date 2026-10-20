import { type ContentProblem, isMarkupLikeKey } from './rich-text.js';
import { validateScriptureEntries } from './scripture-refs.js';

/**
 * NARRATIVE_SCENE and MEDIA_ANIMATION content contracts. Both schemas are PROPOSED, NOT APPROVED; the documented FIELDS are the workbook's
 * (CMS Components sheet, BLK-015 / BLK-016). NARRATIVE_SCENE already exists as an identifier. MEDIA_ANIMATION is a new identifier (BLK-016 has none; open
 * decision D1) added with migration AddMediaAnimationBlockType1791820000000.
 *
 * NARRATIVE_SCENE ("Title; visual; concise narrative; Scripture; predefined transition/effect"; "visual story transition using background/illustration,
 * concise narrative text, Scripture and predetermined effects"; "animations/transitions lightweight and predetermined, not a general animation-authoring system"):
 *
 *   { "title": "optional", "image": { "mediaId": "<media image>", "altText": "…" },     // the visual; optional
 *     "narrative": "concise author-written text",
 *     "scripture": [ { reference, dataset?, refresh? }, ... ] }                         // optional, up to 5 (scripture-refs.ts)
 *
 *   - "Predefined transition/effect" is NOT implemented: the list of allowed effects is undefined (open decision D8), so no effect field exists and unknown
 *     keys are rejected. The scene is shown as a still, motion-free composition.
 *   - Publishing needs the narrative text (and alternative text for the visual if there is one). Title, visual and Scripture are optional because the field
 *     list does not say they are mandatory (a gap to confirm).
 *
 * MEDIA_ANIMATION ("Asset; media type; caption; poster/thumbnail; accessibility text"; "render supported video/animation/Lottie-type asset ... CMS integrates
 * asset; does not create animations"):
 *
 *   { "mediaType": "ANIMATED_IMAGE", "mediaId": "<animated WebP in the media library>", "posterMediaId": "<still image, optional>",
 *     "caption": "optional", "altText": "accessibility text" }
 *
 *   - ONLY "ANIMATED_IMAGE" (an animated WebP file) is accepted: it is the one animation format the mobile app can play with the packages already installed
 *     (expo-image). VIDEO and LOTTIE are NOT supported: the app has no video or Lottie player installed, and adding one needs a dependency and a hosting /
 *     format decision (D9), so the block refuses them rather than store content it cannot play. The asset must really be an animated WebP (checked from the
 *     file's bytes when the block is saved); a still image is refused.
 *   - It is never autoplayed: the learner presses Play. `posterMediaId` is the still shown before play. Publishing needs the asset and the accessibility text.
 */
export const SCENE_LIMITS = { title: 200, narrative: 600, altText: 500 } as const;
export const ANIMATION_LIMITS = { caption: 500, altText: 500 } as const;
export const MEDIA_TYPES = ['ANIMATED_IMAGE'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkText(source: Record<string, unknown>, key: string, max: number, path: string, label: string, problems: ContentProblem[]): void {
  const value = source[key];
  if (value === undefined) return;
  if (typeof value !== 'string') problems.push({ path, message: `${label} must be text` });
  else if (value.length > max) problems.push({ path, message: `${label} must be at most ${max} characters` });
  else if (value.includes('\u0000')) problems.push({ path, message: `${label} must not contain NUL characters` });
}

function checkKeys(content: Record<string, unknown>, allowed: readonly string[], problems: ContentProblem[]): void {
  for (const key of Object.keys(content)) {
    if (isMarkupLikeKey(key)) problems.push({ path: key, message: `Markup-like key "${key}" is not allowed` });
    else if (!allowed.includes(key)) problems.push({ path: key, message: `Unknown key "${key}"` });
  }
}

const blank = (value: unknown) => typeof value !== 'string' || value.trim() === '';

// ----------------------------------------------------------------------------------------------------------------------- NARRATIVE_SCENE

export function validateSceneShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: 'Narrative scene content must be an object' }];
  const problems: ContentProblem[] = [];
  checkKeys(content, ['title', 'image', 'narrative', 'scripture'], problems);
  checkText(content, 'title', SCENE_LIMITS.title, 'title', 'The title', problems);
  checkText(content, 'narrative', SCENE_LIMITS.narrative, 'narrative', 'The narrative', problems);
  if (content.image !== undefined) {
    const image = content.image;
    if (!isPlainObject(image)) {
      problems.push({ path: 'image', message: 'The visual must be an object' });
    } else {
      for (const key of Object.keys(image)) if (key !== 'mediaId' && key !== 'altText') problems.push({ path: `image.${key}`, message: `Unknown key "image.${key}"` });
      if (image.mediaId !== undefined && (typeof image.mediaId !== 'string' || !UUID.test(image.mediaId))) problems.push({ path: 'image.mediaId', message: 'The visual must be a media asset id' });
      checkText(image, 'altText', SCENE_LIMITS.altText, 'image.altText', 'The visual description', problems);
    }
  }
  validateScriptureEntries(content.scripture, 'scripture', 'Scripture', problems);
  return problems;
}

export function validateSceneComplete(content: unknown): ContentProblem[] {
  const c = isPlainObject(content) ? content : {};
  const problems: ContentProblem[] = [];
  if (blank(c.narrative)) problems.push({ path: 'narrative', message: 'The scene needs its narrative text' });
  const image = isPlainObject(c.image) ? c.image : null;
  if (image) {
    if (typeof image.mediaId !== 'string') problems.push({ path: 'image.mediaId', message: 'The visual has no image chosen: choose an image or remove it' });
    else if (blank(image.altText)) problems.push({ path: 'image.altText', message: 'The visual needs a description (alternative text) before publishing' });
  }
  return problems;
}

export function sceneMediaId(content: unknown): string | null {
  if (!isPlainObject(content) || !isPlainObject(content.image)) return null;
  const id = content.image.mediaId;
  return typeof id === 'string' && UUID.test(id) ? id : null;
}

// --------------------------------------------------------------------------------------------------------------------- MEDIA_ANIMATION

export function validateAnimationShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: 'Animation content must be an object' }];
  const problems: ContentProblem[] = [];
  checkKeys(content, ['mediaType', 'mediaId', 'posterMediaId', 'caption', 'altText'], problems);
  if (content.mediaType !== undefined && !(MEDIA_TYPES as readonly unknown[]).includes(content.mediaType)) {
    problems.push({ path: 'mediaType', message: 'Only animated images (animated WebP) are supported. Video and Lottie are not available in this version of the app.' });
  }
  for (const key of ['mediaId', 'posterMediaId'] as const) {
    const value = content[key];
    if (value !== undefined && (typeof value !== 'string' || !UUID.test(value))) problems.push({ path: key, message: `${key === 'mediaId' ? 'The animation' : 'The poster'} must be a media asset id` });
  }
  checkText(content, 'caption', ANIMATION_LIMITS.caption, 'caption', 'The caption', problems);
  checkText(content, 'altText', ANIMATION_LIMITS.altText, 'altText', 'The accessibility text', problems);
  return problems;
}

export function validateAnimationComplete(content: unknown): ContentProblem[] {
  const c = isPlainObject(content) ? content : {};
  const problems: ContentProblem[] = [];
  if (c.mediaType !== 'ANIMATED_IMAGE') problems.push({ path: 'mediaType', message: 'Choose the media type (animated image)' });
  if (typeof c.mediaId !== 'string') problems.push({ path: 'mediaId', message: 'Choose the animated image' });
  if (blank(c.altText)) problems.push({ path: 'altText', message: 'The animation needs accessibility text (a description of what it shows)' });
  return problems;
}

/** The animated asset and its optional poster (well-formed ids only). */
export function animationMedia(content: unknown): { mediaId: string | null; posterMediaId: string | null } {
  if (!isPlainObject(content)) return { mediaId: null, posterMediaId: null };
  const ok = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null);
  return { mediaId: ok(content.mediaId), posterMediaId: ok(content.posterMediaId) };
}
