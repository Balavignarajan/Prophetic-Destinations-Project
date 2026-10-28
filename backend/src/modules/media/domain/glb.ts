/**
 * Which files count as a GLB 3D model (the binary container of glTF 2.0). Pure rules; no database, no storage, nothing is loaded or executed.
 *
 * A GLB file is: a 12-byte header (the text `glTF`, the version 2, the length of the whole file), then chunks of (length, type, data): a JSON chunk first (the scene
 * description), then optionally one BIN chunk (the geometry and textures). The file is checked FROM ITS BYTES, never from its name or the Content-Type the client sent:
 *  - the signature, the version, and the declared length equal to the real size (a truncated or padded file is refused);
 *  - every chunk starts and ends inside the file, has a length that is a multiple of 4 (the format's alignment), the JSON chunk comes first and there is at most one BIN chunk,
 *    right after it; chunks of other types are skipped, as the format says;
 *  - the JSON chunk is within a size limit, is valid UTF-8 JSON, an object that declares a glTF 2.0 asset and holds at least one mesh;
 *  - NO EXTERNAL DEPENDENCIES: a buffer or image that points at another file or an address (anything that is not a `data:` URI) is refused, because an upload carries
 *    one file and the app must never fetch from elsewhere. The geometry must be the file's own BIN chunk (or embedded data);
 *  - NO UNREADABLE COMPRESSION: a model that requires Draco, Meshopt or KTX2 compression is refused, because the viewer cannot show it (applied to new uploads only).
 * This checks that the container is sound and self-contained. It is not a full glTF validator: the content of accessors, materials and extensions is not checked here, and a
 * viewer decides what it can draw.
 */
export const GLB_LIMITS = {
  /** The largest JSON chunk. The scene description of a real model is far smaller; a larger one is almost certainly something else (or embedded data that belongs in the BIN chunk). */
  maxJsonBytes: 8 * 1024 * 1024,
  /** A GLB normally has two chunks; this leaves room for chunks of other types that are skipped. */
  maxChunks: 8,
} as const;

/** Compression extensions the learner and Admin viewers cannot read (see the viewer engine). A model that requires one is refused at upload. */
const UNREADABLE_EXTENSIONS = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'];

const HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
/** `glTF` read as a little-endian number. */
const MAGIC = 0x46546c67;
/** `JSON` and `BIN\0` read as little-endian numbers. */
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** True when the bytes start with the GLB signature (used to say WHY a rejected file was rejected). */
export function looksLikeGlb(bytes: Buffer): boolean {
  return bytes.length >= 4 && bytes.readUInt32LE(0) === MAGIC;
}

/**
 * Why these bytes are not an acceptable GLB file, in a sentence an author can act on, or null when they are. Looks at the whole file, so call it on the complete upload.
 */
export function glbProblem(bytes: Buffer): string | null {
  if (bytes.length < HEADER_BYTES + CHUNK_HEADER_BYTES) return 'This file is too small to be a GLB model.';
  if (!looksLikeGlb(bytes)) return 'This is not a GLB file: it does not start with the glTF signature. Renaming a file does not change what it is.';
  const version = bytes.readUInt32LE(4);
  if (version !== 2) return `Only GLB version 2 (glTF 2.0) can be used; this file is version ${version}.`;
  if (bytes.readUInt32LE(8) !== bytes.length) return 'This GLB file is damaged or incomplete: the size it declares is not the size of the file.';

  let json: Buffer | null = null;
  let bin: { length: number } | null = null;
  let offset = HEADER_BYTES;
  let count = 0;
  while (offset < bytes.length) {
    count += 1;
    if (count > GLB_LIMITS.maxChunks) return 'This GLB file has too many parts to be a normal model.';
    if (offset + CHUNK_HEADER_BYTES > bytes.length) return 'This GLB file is damaged or incomplete: a part of it is cut off.';
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + CHUNK_HEADER_BYTES;
    if (length % 4 !== 0) return 'This GLB file is damaged: a part of it is not aligned the way the format requires.';
    if (start + length > bytes.length) return 'This GLB file is damaged or incomplete: a part of it runs past the end of the file.';
    if (count === 1) {
      if (type !== CHUNK_JSON) return 'This GLB file is damaged: it does not begin with its scene description.';
      if (length === 0 || length > GLB_LIMITS.maxJsonBytes) return 'The scene description inside this GLB file is empty or too large.';
      json = bytes.subarray(start, start + length);
    } else if (type === CHUNK_JSON) {
      return 'This GLB file is damaged: it has two scene descriptions.';
    } else if (type === CHUNK_BIN) {
      if (bin !== null || count !== 2) return 'This GLB file is damaged: its binary data is not where the format requires it.';
      bin = { length };
    }
    offset = start + length;
  }
  if (json === null) return 'This GLB file has no scene description.';

  let document: unknown;
  try {
    document = JSON.parse(json.toString('utf8'));
  } catch {
    return 'This GLB file is damaged: its scene description is not valid.';
  }
  if (!isObject(document)) return 'This GLB file is damaged: its scene description is not valid.';
  const asset = document.asset;
  if (!isObject(asset) || typeof asset.version !== 'string' || !/^2\.\d+$/.test(asset.version)) return 'This file does not describe a glTF 2.0 model.';

  for (const key of ['buffers', 'bufferViews', 'accessors', 'meshes', 'images', 'scenes', 'nodes'] as const) {
    if (document[key] !== undefined && !Array.isArray(document[key])) return 'This GLB file is damaged: its scene description is not valid.';
  }
  if (!Array.isArray(document.meshes) || document.meshes.length === 0) return 'This GLB file contains no 3D mesh, so there is nothing to show.';

  // No external dependencies: anything a buffer or an image points at must be embedded data.
  const external = 'This model depends on other files or web addresses, which cannot be uploaded. Export it again as a single self-contained GLB.';
  const buffers = Array.isArray(document.buffers) ? document.buffers : [];
  for (let index = 0; index < buffers.length; index += 1) {
    const buffer: unknown = buffers[index];
    if (!isObject(buffer) || typeof buffer.byteLength !== 'number' || !Number.isFinite(buffer.byteLength) || buffer.byteLength < 0) return 'This GLB file is damaged: its scene description is not valid.';
    if (buffer.uri !== undefined) {
      if (typeof buffer.uri !== 'string') return 'This GLB file is damaged: its scene description is not valid.';
      if (!buffer.uri.trim().toLowerCase().startsWith('data:')) return external;
    } else if (index !== 0 || bin === null) {
      // Only the first buffer may be the file's own binary data, and only when that data is there.
      return 'This GLB file is damaged: its geometry is missing.';
    } else if (buffer.byteLength > bin.length || bin.length - buffer.byteLength > 3) {
      return 'This GLB file is damaged: its geometry is not the size the file says.';
    }
  }
  const images = Array.isArray(document.images) ? document.images : [];
  for (const image of images as unknown[]) {
    if (!isObject(image)) return 'This GLB file is damaged: its scene description is not valid.';
    if (image.uri !== undefined) {
      if (typeof image.uri !== 'string') return 'This GLB file is damaged: its scene description is not valid.';
      if (!image.uri.trim().toLowerCase().startsWith('data:')) return external;
    }
  }

  // A model that REQUIRES a compression the viewer cannot read would upload fine and then never show, in front of a learner. It is refused here, with the reason, so the author can export it
  // again without that compression. Only new uploads are affected: a file already in the library is never re-checked or removed. (A model that merely lists such an extension as optional,
  // with an uncompressed fallback, is accepted.)
  const required = Array.isArray(document.extensionsRequired) ? (document.extensionsRequired as unknown[]) : [];
  if (required.some((name) => typeof name === 'string' && UNREADABLE_EXTENSIONS.includes(name))) {
    return 'This model uses Draco, Meshopt or KTX2 compression, which this app cannot show yet. Export it again without that compression (or with an uncompressed copy).';
  }
  return null;
}

/** True when these bytes are an acceptable GLB file. */
export const isGlb = (bytes: Buffer): boolean => glbProblem(bytes) === null;
