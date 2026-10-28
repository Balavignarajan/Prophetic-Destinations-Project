import { levelsField, readItemLevels } from './item-levels';
import { type ScriptureEntryDraft, buildScriptureEntries, readScriptureEntries } from './scripture-info';

/**
 * The INTERACTIVE_3D_MODEL block (backend/src/modules/lessons/domain/blocks/interactive-3d-model.ts). PROPOSED schema, not approved.
 *   { title?, mediaId (a GLB file in the Media Library), posterMediaId? (an image), description?,
 *     hotspots?: [{ id, position?: { x, y, z }, label, explanation, scripture?, levels? }] }
 * A hotspot's `position` is a point of the MODEL in the model's own space (never a screen position), so it stays on the same spot whatever the camera. A hotspot without a position is "not
 * placed yet" (allowed in a draft, not for publishing). `scripture` and `levels` are the same item Scripture and item level contracts as the hotspots of an interactive image.
 * The block holds only media library ids and numbers: no address, no model data.
 */
export const MODEL_3D_LIMITS = { title: 200, description: 2000, maxHotspots: 30, label: 100, explanation: 1000 } as const;

/** The stored type of a GLB model in the Media Library (detected by the server from the file's own bytes). */
export const GLB_CONTENT_TYPE = 'model/gltf-binary';

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface Hotspot3DDraft {
  id: string;
  /** A point of the model, or null when the hotspot is not placed yet. */
  position: Position3D | null;
  label: string;
  explanation: string;
  /** Scripture references of the hotspot (references only; text and stamps belong to the server). */
  scripture: ScriptureEntryDraft[];
  /** The stored/previewed `scripture` value as it came (for display only; never sent back). */
  scriptureRaw?: unknown;
  /** The levels this hotspot is reserved for; null/absent = every level the block is shown at. */
  levels?: string[] | null;
}

export interface Model3DContent {
  title: string;
  mediaId: string;
  posterMediaId: string;
  description: string;
  hotspots: Hotspot3DDraft[];
}
export const EMPTY_MODEL_3D: Model3DContent = { title: '', mediaId: '', posterMediaId: '', description: '', hotspots: [] };

function readPosition(value: unknown): Position3D | null {
  if (!isObject(value) || !finite(value.x) || !finite(value.y) || !finite(value.z)) return null;
  return { x: value.x, y: value.y, z: value.z };
}

export function readModel3D(content: unknown): Model3DContent {
  const c = isObject(content) ? content : {};
  return {
    title: text(c.title),
    mediaId: text(c.mediaId),
    posterMediaId: text(c.posterMediaId),
    description: text(c.description),
    hotspots: Array.isArray(c.hotspots)
      ? c.hotspots.filter(isObject).map((h, index) => ({
          id: text(h.id) || `h-${index + 1}`,
          position: readPosition(h.position),
          label: text(h.label),
          explanation: text(h.explanation),
          scripture: readScriptureEntries(h.scripture),
          scriptureRaw: h.scripture,
          levels: readItemLevels(h.levels),
        }))
      : [],
  };
}

const round = (value: number) => Math.round(value * 100000) / 100000;

/** The content to save. Empty optional fields are left out rather than stored as empty text; an unplaced hotspot is saved without a position. Nothing of the editor's own state is included. */
export function buildModel3D(draft: Model3DContent): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (draft.title.trim()) out.title = draft.title.trim();
  if (draft.mediaId) out.mediaId = draft.mediaId;
  if (draft.posterMediaId) out.posterMediaId = draft.posterMediaId;
  if (draft.description.trim()) out.description = draft.description.trim();
  if (draft.hotspots.length > 0) {
    out.hotspots = draft.hotspots.map((h) => ({
      id: h.id,
      ...(h.position ? { position: { x: round(h.position.x), y: round(h.position.y), z: round(h.position.z) } } : {}),
      label: h.label.trim(),
      explanation: h.explanation.trim(),
      ...buildScriptureEntries(h.scripture),
      ...levelsField(h.levels),
    }));
  }
  return out;
}

/** What is still missing before the lesson can be published (a draft can be saved without it). */
export function model3DReadiness(c: Model3DContent): string[] {
  const out: string[] = [];
  if (!c.mediaId) out.push('Choose the 3D model (a GLB file).');
  c.hotspots.forEach((h, index) => {
    const n = `Hotspot ${index + 1}`;
    if (!h.position) out.push(`${n} has not been placed on the model.`);
    if (!h.label.trim()) out.push(`${n} needs a label.`);
    if (!h.explanation.trim()) out.push(`${n} needs an explanation.`);
  });
  return out;
}

/** A new id that no other hotspot of the block uses. */
export function newModelHotspotId(existing: readonly { id: string }[]): string {
  const used = new Set(existing.map((h) => h.id));
  for (;;) {
    const id = `h-${Math.random().toString(36).slice(2, 8)}`;
    if (!used.has(id)) return id;
  }
}

/** The hotspots with their positions removed (their text, Scripture and levels are kept): used when the model is replaced and the author keeps the text. */
export const withoutPositions = (hotspots: readonly Hotspot3DDraft[]): Hotspot3DDraft[] => hotspots.map((h) => ({ ...h, position: null }));

/** A position as the author reads it: "x 0.10, y 2.40, z 0.30" (model units), or that it is not placed. */
export const positionSummary = (position: Position3D | null): string =>
  position ? `x ${position.x.toFixed(2)}, y ${position.y.toFixed(2)}, z ${position.z.toFixed(2)}` : 'Not placed on the model yet';
