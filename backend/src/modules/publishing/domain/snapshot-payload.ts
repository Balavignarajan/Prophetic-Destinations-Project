import { createHash } from 'node:crypto';
import type { AssembledLesson, AssembledLevel } from '../../lessons/index.js';
import type { LearningLevel } from '../../../shared-kernel/index.js';

/**
 * The self-contained, resolved content a learner at one level receives. It carries
 * everything needed to render the lesson, so reading it never touches the mutable
 * authoring tables. (Storing it, hashing it and versioning it come with the
 * publication tables; the shape and the size rule live here because readiness
 * must measure exactly what would be stored.)
 */
export const SNAPSHOT_SCHEMA_VERSION = 1;

/** Each resolved level snapshot may be at most 5 MiB of serialized UTF-8. */
export const MAX_LEVEL_SNAPSHOT_BYTES = 5 * 1024 * 1024;

export interface LevelSnapshotPayload {
  schemaVersion: number;
  level: LearningLevel;
  lesson: {
    id: string;
    moduleId: string;
    title: string;
    shortTitle: string | null;
    subtitle: string | null;
    introduction: string | null;
    estimatedMinutes: number | null;
    coverMediaId: string | null;
  };
  blocks: {
    blockId: string;
    type: string;
    ordinal: number;
    source: 'VARIANT' | 'SHARED';
    content: Record<string, unknown>;
  }[];
}

/**
 * Builds the payload of one level from the resolver's result. Blocks the resolver
 * could not resolve are left out: a lesson with unresolved blocks is never ready,
 * so such a payload is only ever built for measuring, never stored.
 */
export function buildLevelPayload(
  assembled: AssembledLesson,
  level: AssembledLevel,
): LevelSnapshotPayload {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    level: level.level,
    lesson: { ...assembled.lesson },
    blocks: level.resolution.blocks.flatMap((block) =>
      block.source === null || block.content === null
        ? []
        : [
            {
              blockId: block.blockId,
              type: block.type,
              ordinal: block.ordinal,
              source: block.source,
              content: block.content,
            },
          ],
    ),
  };
}

/**
 * JSON with object keys in sorted order at every depth, so equal content always
 * serializes to the same text (array order is kept: it is meaningful).
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** Size of a payload as stored: its canonical serialization in UTF-8 bytes. */
export function payloadBytes(payload: LevelSnapshotPayload): number {
  return Buffer.byteLength(canonicalJson(payload), 'utf8');
}

/** A level payload as it is stored: the canonical text, its size in bytes, and its SHA-256. */
export interface SerializedSnapshot {
  json: string;
  bytes: number;
  hash: string;
}

/** SHA-256 (lower-case hex) of a canonical serialization. */
export function hashCanonicalJson(json: string): string {
  return createHash('sha256').update(json, 'utf8').digest('hex');
}

/**
 * Serializes a payload once and derives size and hash from that same text, so what is
 * measured, hashed and stored can never disagree.
 */
export function serializeSnapshot(
  payload: LevelSnapshotPayload,
): SerializedSnapshot {
  const json = canonicalJson(payload);
  return {
    json,
    bytes: Buffer.byteLength(json, 'utf8'),
    hash: hashCanonicalJson(json),
  };
}
