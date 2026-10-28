/**
 * GENERATED FILE. Do not edit it. It is the text of the GLB viewer engine (admin-website/public/glb-viewer.v4.js, version 4), embedded so the learner app's WebView page can run it
 * without loading anything from the internet, and it is produced by scripts/sync-glb-engine.mjs (npm run sync:glb-engine). The Admin and the app therefore always run the same engine.
 * npm run check:glb-engine reports whether this file is up to date.
 */
export const GLB_VIEWER_ENGINE_VERSION = 4;

export const GLB_VIEWER_ENGINE = `/*! Prophetic Destinations GLB viewer engine, version 4.
 *
 * A small, self-contained WebGL viewer for GLB 3D models (glTF 2.0 binary). It has no dependencies and loads nothing from the internet: it only draws the bytes it is given.
 * ONE source, two hosts: the Admin tool loads this file (admin-website/public/glb-viewer.v4.js) and the learner app embeds the SAME text in its WebView page
 * (mobile-app/src/learning/glb-viewer-engine.ts, generated from this file by mobile-app/scripts/sync-glb-engine.mjs, npm run sync:glb-engine; change the version in the file name whenever the engine changes).
 * Keep this file free of backslashes, backticks and dollar-brace sequences: the mobile copy is a template string.
 *
 * WHAT IT SHOWS: static triangle meshes of a model, placed by the scene's node transforms; materials with base colour, base colour texture, vertex colours, emissive colour and
 * texture, metallic and roughness (a studio-style lighting with a soft sky/ground environment, no image-based lighting), double-sided, alpha mask and blend, unlit, and the legacy
 * specular-glossiness material (read as a plain diffuse material). The model is centred and framed from its real bounds, in its authored orientation (glTF is Y-up, the camera looks at
 * its +Z side; see UP AXIS below for the one kind of file that is not Y-up). NOT shown: animation, skinning (drawn in its bind pose), morph targets, normal/occlusion maps, cameras and lights of the file, and models compressed with Draco, Meshopt
 * or KTX2 (refused with a clear message). Triangle meshes only; points and lines are skipped.
 *
 * CONTROLS: one finger or the left mouse button rotates; two fingers pinch to zoom and pan; the wheel zooms; Shift-drag or the right/middle button pans; arrow keys rotate, plus and minus
 * zoom, 0 or Home resets; double-click resets. Zoom is limited. It renders ON DEMAND only (when the camera moves or the size changes), never in a loop while idle.
 *
 * API: GlbViewer.create(canvas, options) -> viewer. options: { background: [r,g,b] (0..1), reducedMotion: bool, onFirstInteraction: fn, onContextLost: fn }.
 *   viewer.load(arrayBuffer) -> Promise<{ triangles, warnings }>; it rejects with an Error whose .code is one of invalid, unsupported, empty, too-large, memory, webgl, context-lost.
 *   viewer.reset(); viewer.dispose() (frees every GPU resource and the context). The caller owns the canvas and gives it a size with CSS.
 *
 * HOTSPOTS (version 2). A hotspot is a point of the MODEL: its position is in model space, the glTF scene space after the nodes' transforms, in the model's own units. That is stable for a
 * given file and does not depend on the camera, the screen or the device, so a hotspot stays on the same spot of the model whatever the view. Extra options and methods:
 *   options.pickable (Admin editor only): keeps each mesh's positions and triangles on the CPU so viewer.pick() can work; without it nothing is kept.
 *   options.markerStyle: { fill, ring, ink, selectedFill, selectedRing } as [r,g,b] (0..1); options.onTap({ clientX, clientY, hotspotId or null }) for a tap (not a drag).
 *   viewer.setHotspots([{ id, position: [x,y,z], number }]) (up to 30; number is the numeral shown, default the place in the list); viewer.setSelected(id or null).
 *   viewer.pick(clientX, clientY) -> { position: [x,y,z], distance } or null: a ray from the camera through that point of the canvas, tested against the real triangles of every mesh
 *   (each mesh's ray is moved into its own space with the inverse of its node transform, so scale, rotation and nesting are all accounted for), nearest visible hit wins. Back faces of
 *   single-sided materials are not hit, matching what is drawn. It runs only when asked, never per frame.
 * MARKERS are drawn by the engine itself, in the same scene, as numbered discs facing the screen, with the model's depth buffer deciding what is hidden: a marker whose spot is behind
 * the model is drawn as a faint ghost instead of as if it were on the visible surface (a marker is nudged a little towards the camera so its own surface does not hide it). They follow
 * rotation, zoom, pan, reset and resizing because they are projected with the very camera that draws the model. A tap on a marker (within a finger-sized radius) reports its id.
 *
 * VERSION 3 (reliability). The depth range of the camera now also covers a model that has been panned off-centre, so no part of it is clipped; zoom is limited to 0.4x..3x of the framing
 * distance (never inside the model's bounding sphere at rest, never so small that the model vanishes) and panning to one radius from the model's centre (an offset beyond that, such as the one
 * Focus makes, is never pulled back, only prevented from growing); the mouse wheel is read in lines and pages as well as pixels. New:
 *   viewer.focus(id, offsetY): moves the camera's TARGET and brings it closer so the hotspot is framed, keeping the viewing direction. offsetY (-0.8..0.8, default 0) puts the hotspot that far
 *   above (positive) or below the middle of the view, in half-heights, for a host that covers part of the view with a panel. The hotspot's saved position is never touched; Reset view returns.
 *   options.maxTriangles: refuse a model with more triangles than this (default and ceiling 3,000,000) with the error code too-large, so a phone is not asked for more than it can hold.
 *
 * VERSION 4 (presentation). Nothing about a model's data, a hotspot's position or the commands changed; what changed is how the model is shown.
 *   UP AXIS. glTF says +Y is up and the viewer shows a file in its authored orientation. The camera and every matrix were checked: they are correct for Y-up. Some tools, though, write their own
 *   Z-up coordinates without the Y-up conversion the format asks for (the trimesh library does this: its files carry no rotation at all), and such a model, taller along Z, would be seen end-on,
 *   from over its head. The viewer recognises exactly that case and nothing else: a file whose asset.generator names trimesh AND whose extent along Z is clearly the largest (Z > 1.25 x Y and
 *   Z > X) is shown with Z as its up axis and +Y as its front (a file like this does not say which way it faces; the one it was made for has its toes and forearms toward +Y). This changes only the CAMERA's frame (which way is up and where the camera starts), never the model's data: its coordinates, a
 *   hotspot's saved position, picking and the markers all stay exactly as they were. Every other file is Y-up. options.upAxis ('y' or 'z') forces one; load() reports the axis it used as .up.
 *   FRAMING. The home view is fitted to the model's real shape (a cylinder round the up axis, from its actual vertices) and to the viewport's real aspect ratio instead of to a bounding sphere, so a tall
 *   model in a tall phone view fills it. viewer.setInsets(top, bottom) tells it how much of the view (in CSS pixels) a host covers with its own controls: the model is framed, and centred,
 *   in the space between. Nothing is ever cropped at the home view; zoom, pan and Reset work as before.
 *   LIGHT. A stronger key light, a cooler fill and a soft edge light for shape and separation from the background; polished-metal reflections of a studio-like surround (two soft boxes and a
 *   sky-to-ground gradient); the ambient light follows the up axis. A primitive with no material (vertex colours only) is drawn as a glossy semi-metal rather than as matte; materials the file
 *   defines are drawn as authored. options.stage: { center, edge } as [r,g,b] draws a soft radial backdrop behind the model instead of a flat colour.
 *   MARKERS are redrawn as a numbered gold medallion (a dark rim for contrast on bright materials, a thin outer ring, a brighter filled and larger state for the chosen one), appear once with a short
 *   staggered growth (not with Reduce Motion) and then never animate. viewer.focus(id, offsetY, offsetX) can also place the point to the left or right (for a side panel).
 */
(function (root) {
  'use strict';

  var VERSION = 4;
  var FOV = (45 * Math.PI) / 180;
  var HOME_YAW = 0;
  var HOME_PITCH = 0.2;
  var PITCH_LIMIT = 1.45;
  var ZOOM_MIN = 0.4;
  var ZOOM_MAX = 3;
  /** How far the camera's target may be moved from the model's centre by panning, in radii of the model's bounding sphere. */
  var PAN_LIMIT = 1;
  /** The zoom Focus brings the camera to when it is farther out than this. */
  var FOCUS_ZOOM = 0.55;
  var MAX_TRIANGLES = 3000000;
  var MAX_TEXTURE_PX = 2048;
  var MAX_NODES = 100000;
  var MAX_DEPTH = 64;
  var RESET_MS = 320;
  var TWO_PI = Math.PI * 2;
  var NOT_READABLE = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'];
  var MAX_HOTSPOTS = 30;
  var COORD_LIMIT = 1000000;
  /** Marker radius and the radius within which a tap counts as on it, in CSS pixels. */
  var MARKER_RADIUS = 17;
  var MARKER_HIT = 28;
  /** The share of the view's width and height the framed model may fill at the home view (the rest is air round it). */
  var FIT_X = 0.92;
  var FIT_Y = 0.9;
  /** The camera never comes closer to the target than this many radii of the model's bounding sphere (zoom floor for wide, flat models). */
  var MIN_DISTANCE = 0.55;
  /** A marker grows in once over REVEAL_MS, each one REVEAL_STEP later than the one before. */
  var REVEAL_MS = 300;
  var REVEAL_STEP = 45;
  /** The frames of reference of a model: its up axis (the one the camera orbits), where the camera starts (front) and the side that is to the right from there. axis is the index of up. */
  var ORIENTATIONS = {
    y: { up: [0, 1, 0], front: [0, 0, 1], side: [1, 0, 0], axis: 1 },
    // Z-up files: the camera starts on the +Y side (where the Daniel statue, the file this frame exists for, has its toes, its crown's middle point and its forearms), with -X to the right.
    z: { up: [0, 0, 1], front: [0, 1, 0], side: [-1, 0, 0], axis: 2 }
  };
  /** A touch or click that moves less than this and ends within this time is a tap. */
  var TAP_SLOP = 10;
  var TAP_MS = 450;
  var ATLAS_COLS = 8;
  var ATLAS_ROWS = 4;
  var ATLAS_CELL = 64;
  var MARKER_CORNERS = [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1];

  function fail(code, message) {
    var error = new Error(message);
    error.name = 'GlbViewerError';
    error.code = code;
    return error;
  }

  // ------------------------------------------------------------------------------------------------------------------------------ matrices (column-major)

  function mat4Multiply(a, b) {
    var out = new Float32Array(16);
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) {
        out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }

  function mat4FromTRS(t, q, s) {
    var x = q[0], y = q[1], z = q[2], w = q[3];
    var x2 = x + x, y2 = y + y, z2 = z + z;
    var xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
    var wx = w * x2, wy = w * y2, wz = w * z2;
    return new Float32Array([
      (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
      (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
      (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
      t[0], t[1], t[2], 1
    ]);
  }

  function mat4Perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2);
    var nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }

  function lookAt(eye, center, up) {
    var zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    var len = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1;
    zx /= len; zy /= len; zz /= len;
    var xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    len = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1;
    xx /= len; xy /= len; xz /= len;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return {
      matrix: new Float32Array([
        xx, yx, zx, 0,
        xy, yy, zy, 0,
        xz, yz, zz, 0,
        -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1
      ]),
      right: [xx, xy, xz],
      up: [yx, yy, yz],
      back: [zx, zy, zz]
    };
  }

  /** The inverse-transpose of the upper 3x3 of a model matrix (what normals need), plus the sign of its determinant (negative = mirrored, so the winding flips). */
  function normalMatrix(m) {
    var a00 = m[0], a01 = m[1], a02 = m[2], a10 = m[4], a11 = m[5], a12 = m[6], a20 = m[8], a21 = m[9], a22 = m[10];
    var b01 = a22 * a11 - a12 * a21, b11 = -a22 * a10 + a12 * a20, b21 = a21 * a10 - a11 * a20;
    var det = a00 * b01 + a01 * b11 + a02 * b21;
    if (!det) return { matrix: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), mirrored: false };
    var inv = 1 / det;
    var i0 = b01 * inv, i1 = (-a22 * a01 + a02 * a21) * inv, i2 = (a12 * a01 - a02 * a11) * inv;
    var i3 = b11 * inv, i4 = (a22 * a00 - a02 * a20) * inv, i5 = (-a12 * a00 + a02 * a10) * inv;
    var i6 = b21 * inv, i7 = (-a21 * a00 + a01 * a20) * inv, i8 = (a11 * a00 - a01 * a10) * inv;
    return { matrix: new Float32Array([i0, i3, i6, i1, i4, i7, i2, i5, i8]), mirrored: det < 0 };
  }

  function normalize3(v) {
    var len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  function isPow2(n) {
    return n > 0 && (n & (n - 1)) === 0;
  }

  function floorPow2(n) {
    var p = 1;
    while (p * 2 <= n) p *= 2;
    return p;
  }

  /** The inverse of the upper 3x3 of a model matrix (nine numbers, column-major) followed by its translation (three numbers), or null when it cannot be inverted. */
  function affineInverse(m) {
    var a00 = m[0], a01 = m[1], a02 = m[2], a10 = m[4], a11 = m[5], a12 = m[6], a20 = m[8], a21 = m[9], a22 = m[10];
    var b01 = a22 * a11 - a12 * a21, b11 = -a22 * a10 + a12 * a20, b21 = a21 * a10 - a11 * a20;
    var det = a00 * b01 + a01 * b11 + a02 * b21;
    if (!det) return null;
    var inv = 1 / det;
    return [
      b01 * inv, (-a22 * a01 + a02 * a21) * inv, (a12 * a01 - a02 * a11) * inv,
      b11 * inv, (a22 * a00 - a02 * a20) * inv, (-a12 * a00 + a02 * a10) * inv,
      b21 * inv, (-a21 * a00 + a01 * a20) * inv, (a11 * a00 - a01 * a10) * inv,
      m[12], m[13], m[14]
    ];
  }

  /** Whether the ray (origin o, direction d) can reach the box before distance limit. */
  function rayHitsBox(o, d, min, max, limit) {
    var near = 0;
    var far = limit;
    for (var k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-12) {
        if (o[k] < min[k] || o[k] > max[k]) return false;
      } else {
        var t1 = (min[k] - o[k]) / d[k];
        var t2 = (max[k] - o[k]) / d[k];
        if (t1 > t2) { var swap = t1; t1 = t2; t2 = swap; }
        if (t1 > near) near = t1;
        if (t2 < far) far = t2;
        if (near > far) return false;
      }
    }
    return true;
  }

  // ------------------------------------------------------------------------------------------------------------------------------ GLB container

  function parseGlb(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 20) throw fail('invalid', 'This file is not a 3D model.');
    var view = new DataView(buffer);
    if (view.getUint32(0, true) !== 0x46546c67) throw fail('invalid', 'This file is not a GLB 3D model.');
    if (view.getUint32(4, true) !== 2) throw fail('unsupported', 'Only GLB version 2 can be shown.');
    var total = Math.min(view.getUint32(8, true), buffer.byteLength);
    var json = null;
    var binOffset = -1;
    var binLength = 0;
    var offset = 12;
    while (offset + 8 <= total) {
      var length = view.getUint32(offset, true);
      var type = view.getUint32(offset + 4, true);
      var start = offset + 8;
      if (start + length > total) throw fail('invalid', 'This GLB file is damaged or incomplete.');
      if (type === 0x4e4f534a && json === null) {
        json = JSON.parse(new TextDecoder('utf-8').decode(new Uint8Array(buffer, start, length)));
      } else if (type === 0x004e4942 && binOffset < 0) {
        binOffset = start;
        binLength = length;
      }
      offset = start + length;
    }
    if (!json || typeof json !== 'object') throw fail('invalid', 'This GLB file has no scene description.');
    return { json: json, buffer: buffer, binOffset: binOffset, binLength: binLength, sources: {} };
  }

  function decodeDataUri(uri) {
    if (typeof uri !== 'string' || uri.slice(0, 5).toLowerCase() !== 'data:') throw fail('unsupported', 'This model depends on other files and cannot be shown.');
    var at = uri.indexOf('base64,');
    if (at < 0) throw fail('invalid', 'This GLB file is damaged.');
    var binary = atob(uri.slice(at + 7));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function bufferSource(doc, index) {
    if (doc.sources[index]) return doc.sources[index];
    var def = doc.json.buffers && doc.json.buffers[index];
    if (!def) throw fail('invalid', 'This GLB file is damaged.');
    var source;
    if (def.uri === undefined) {
      if (index !== 0 || doc.binOffset < 0) throw fail('invalid', 'This GLB file is damaged: its geometry is missing.');
      source = { buffer: doc.buffer, offset: doc.binOffset, length: doc.binLength };
    } else {
      var decoded = decodeDataUri(def.uri);
      source = { buffer: decoded, offset: 0, length: decoded.byteLength };
    }
    doc.sources[index] = source;
    return source;
  }

  var COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  var COMPONENT_ARRAY = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  var TYPE_WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

  function readComponent(view, at, type) {
    switch (type) {
      case 5126: return view.getFloat32(at, true);
      case 5125: return view.getUint32(at, true);
      case 5123: return view.getUint16(at, true);
      case 5122: return view.getInt16(at, true);
      case 5121: return view.getUint8(at);
      default: return view.getInt8(at);
    }
  }

  function normalizeComponent(value, type) {
    switch (type) {
      case 5120: return Math.max(value / 127, -1);
      case 5121: return value / 255;
      case 5122: return Math.max(value / 32767, -1);
      case 5123: return value / 65535;
      default: return value;
    }
  }

  /** The values of an accessor as a new typed array: Float32Array when asFloat is set (integers are converted, normalized ones scaled to 0..1 or -1..1), else the stored integer type. */
  function readAccessor(doc, index, asFloat) {
    var acc = doc.json.accessors && doc.json.accessors[index];
    if (!acc) throw fail('invalid', 'This GLB file is damaged.');
    var bytesEach = COMPONENT_BYTES[acc.componentType];
    var width = TYPE_WIDTH[acc.type];
    if (!bytesEach || !width || typeof acc.count !== 'number' || acc.count < 0) throw fail('invalid', 'This GLB file is damaged.');
    var count = acc.count;
    var total = count * width;
    var floatOut = Boolean(asFloat) || acc.componentType === 5126;
    var Ctor = floatOut ? Float32Array : COMPONENT_ARRAY[acc.componentType];
    var out = new Ctor(total);
    if (acc.bufferView === undefined) return out;
    var bv = doc.json.bufferViews && doc.json.bufferViews[acc.bufferView];
    if (!bv) throw fail('invalid', 'This GLB file is damaged.');
    if (bv.extensions && bv.extensions.EXT_meshopt_compression) throw fail('unsupported', 'This model uses compression the viewer cannot read yet.');
    var src = bufferSource(doc, bv.buffer);
    var element = bytesEach * width;
    var stride = bv.byteStride || element;
    var base = src.offset + (bv.byteOffset || 0) + (acc.byteOffset || 0);
    if (count > 0 && base + stride * (count - 1) + element > src.offset + src.length) throw fail('invalid', 'This GLB file is damaged: its geometry is cut off.');
    if (count === 0) return out;
    var Source = COMPONENT_ARRAY[acc.componentType];
    if (Ctor === Source && !acc.normalized && stride === element && base % bytesEach === 0) {
      out.set(new Source(src.buffer, base, total));
      return out;
    }
    var view = new DataView(src.buffer);
    for (var i = 0; i < count; i++) {
      for (var j = 0; j < width; j++) {
        var value = readComponent(view, base + i * stride + j * bytesEach, acc.componentType);
        out[i * width + j] = acc.normalized && floatOut ? normalizeComponent(value, acc.componentType) : value;
      }
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------------------------------------------ geometry

  function computeNormals(pos, idx) {
    var n = new Float32Array(pos.length);
    for (var i = 0; i < idx.length; i += 3) {
      var a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      var ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      var vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      n[a] += nx; n[a + 1] += ny; n[a + 2] += nz;
      n[b] += nx; n[b + 1] += ny; n[b + 2] += nz;
      n[c] += nx; n[c + 1] += ny; n[c + 2] += nz;
    }
    for (var k = 0; k < n.length; k += 3) {
      var len = Math.sqrt(n[k] * n[k] + n[k + 1] * n[k + 1] + n[k + 2] * n[k + 2]) || 1;
      n[k] /= len; n[k + 1] /= len; n[k + 2] /= len;
    }
    return n;
  }

  /** The triangle list of a primitive as Uint16Array or Uint32Array (strips and fans are expanded), checked against the vertex count. */
  function triangleIndices(doc, prim, vertexCount) {
    var mode = prim.mode === undefined ? 4 : prim.mode;
    var list;
    var i;
    if (prim.indices !== undefined) {
      list = readAccessor(doc, prim.indices, false);
    } else {
      list = new Uint32Array(vertexCount);
      for (i = 0; i < vertexCount; i++) list[i] = i;
    }
    var tri;
    if (mode === 4) {
      var whole = list.length - (list.length % 3);
      tri = whole === list.length ? list : list.subarray(0, whole);
    } else if (mode === 5) {
      tri = new Uint32Array(Math.max(0, list.length - 2) * 3);
      for (i = 0; i + 2 < list.length; i++) {
        if (i % 2 === 0) { tri[i * 3] = list[i]; tri[i * 3 + 1] = list[i + 1]; tri[i * 3 + 2] = list[i + 2]; }
        else { tri[i * 3] = list[i + 1]; tri[i * 3 + 1] = list[i]; tri[i * 3 + 2] = list[i + 2]; }
      }
    } else {
      tri = new Uint32Array(Math.max(0, list.length - 2) * 3);
      for (i = 1; i + 1 < list.length; i++) { tri[(i - 1) * 3] = list[0]; tri[(i - 1) * 3 + 1] = list[i]; tri[(i - 1) * 3 + 2] = list[i + 1]; }
    }
    var max = 0;
    for (i = 0; i < tri.length; i++) if (tri[i] > max) max = tri[i];
    if (tri.length > 0 && max >= vertexCount) throw fail('invalid', 'This GLB file is damaged: its geometry points outside its data.');
    var wide = max > 65535;
    if (wide) return { data: tri instanceof Uint32Array ? tri : new Uint32Array(tri), wide: true };
    return { data: tri instanceof Uint16Array ? tri : new Uint16Array(tri), wide: false };
  }

  // ------------------------------------------------------------------------------------------------------------------------------ shaders

  var VERTEX_SOURCE = [
    'attribute vec3 aPos;',
    'attribute vec3 aNormal;',
    'attribute vec2 aUv;',
    'attribute vec4 aColor;',
    'uniform mat4 uModel;',
    'uniform mat4 uViewProj;',
    'uniform mat3 uNormalMat;',
    'varying vec3 vWorld;',
    'varying vec3 vNormal;',
    'varying vec2 vUv;',
    'varying vec4 vColor;',
    'void main() {',
    '  vec4 world = uModel * vec4(aPos, 1.0);',
    '  vWorld = world.xyz;',
    '  vNormal = uNormalMat * aNormal;',
    '  vUv = aUv;',
    '  vColor = aColor;',
    '  gl_Position = uViewProj * world;',
    '}'
  ].join(String.fromCharCode(10));

  var FRAGMENT_SOURCE = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec3 vWorld;',
    'varying vec3 vNormal;',
    'varying vec2 vUv;',
    'varying vec4 vColor;',
    'uniform sampler2D uBaseTex;',
    'uniform sampler2D uEmisTex;',
    'uniform vec4 uBase;',
    'uniform vec3 uEmissive;',
    'uniform float uMetal;',
    'uniform float uRough;',
    'uniform float uCutoff;',
    'uniform float uMask;',
    'uniform float uUnlit;',
    'uniform vec3 uCam;',
    'uniform vec3 uUp;',
    'uniform vec3 uL0;',
    'uniform vec3 uL1;',
    'uniform vec3 uL2;',
    'uniform vec3 uC0;',
    'uniform vec3 uC1;',
    'uniform vec3 uC2;',
    'vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }',
    'vec3 toSrgb(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }',
    'vec3 shade(vec3 L, vec3 color, vec3 N, vec3 V, vec3 diffuse, vec3 F0, float shin) {',
    '  float nl = max(dot(N, L), 0.0);',
    '  vec3 H = normalize(L + V);',
    '  float spec = pow(max(dot(N, H), 0.0), shin) * (shin + 8.0) / 25.0;',
    '  return (diffuse * nl + F0 * spec * nl) * color;',
    '}',
    'void main() {',
    '  vec4 tex = texture2D(uBaseTex, vUv);',
    '  vec4 baseCol = vec4(toLinear(tex.rgb) * uBase.rgb * vColor.rgb, tex.a * uBase.a * vColor.a);',
    '  if (uMask > 0.5 && baseCol.a < uCutoff) discard;',
    '  vec3 col;',
    '  if (uUnlit > 0.5) {',
    '    col = baseCol.rgb;',
    '  } else {',
    '    vec3 N = normalize(vNormal);',
    '    if (!gl_FrontFacing) N = -N;',
    '    vec3 V = normalize(uCam - vWorld);',
    '    float r = clamp(uRough, 0.05, 1.0);',
    '    float m = clamp(uMetal, 0.0, 1.0);',
    '    vec3 diffuse = baseCol.rgb * (1.0 - m);',
    '    vec3 F0 = mix(vec3(0.04), baseCol.rgb, m);',
    '    float shin = mix(120.0, 6.0, r);',
    '    float up = dot(N, uUp) * 0.5 + 0.5;',
    '    vec3 ambient = mix(vec3(0.11, 0.11, 0.14), vec3(0.54, 0.56, 0.62), up);',
    '    col = diffuse * ambient;',
    '    col += shade(uL0, uC0, N, V, diffuse, F0, shin);',
    '    col += shade(uL1, uC1, N, V, diffuse, F0, shin);',
    '    col += shade(uL2, uC2, N, V, diffuse, F0, shin);',
    '    vec3 R = reflect(-V, N);',
    '    float sky = smoothstep(-0.25, 0.75, dot(R, uUp));',
    '    vec3 env = mix(vec3(0.05, 0.05, 0.07), vec3(0.72, 0.76, 0.84), sky);',
    '    env += vec3(1.0, 0.95, 0.86) * pow(max(dot(R, uL0), 0.0), 9.0) * 0.6;',
    '    env += vec3(0.55, 0.64, 0.9) * pow(max(dot(R, uL1), 0.0), 11.0) * 0.3;',
    '    float nv = max(dot(N, V), 0.0);',
    '    float fres = pow(1.0 - nv, 5.0);',
    '    vec3 F = F0 + (vec3(1.0) - F0) * fres;',
    '    col += env * F * (1.0 - 0.7 * r);',
    '    float rimLight = pow(1.0 - nv, 2.6);',
    '    col += vec3(0.30, 0.29, 0.27) * rimLight * (0.25 + 0.75 * max(dot(N, uL2), 0.0)) * 0.55;',
    '    col += toLinear(texture2D(uEmisTex, vUv).rgb) * uEmissive;',
    '  }',
    '  gl_FragColor = vec4(toSrgb(col), baseCol.a);',
    '}'
  ].join(String.fromCharCode(10));

  var MARKER_VERTEX_SOURCE = [
    'attribute vec3 aPos;',
    'attribute vec2 aCorner;',
    'attribute vec3 aInfo;',
    'uniform mat4 uViewProj;',
    'uniform vec2 uPixel;',
    'uniform float uRadius;',
    'varying vec2 vCorner;',
    'varying float vCell;',
    'varying float vSel;',
    'void main() {',
    '  vec4 clip = uViewProj * vec4(aPos, 1.0);',
    '  float size = uRadius * (1.0 + 0.3 * aInfo.y) * aInfo.z;',
    '  clip.xy += aCorner * size * uPixel * clip.w;',
    '  gl_Position = clip;',
    '  vCorner = aCorner;',
    '  vCell = aInfo.x;',
    '  vSel = aInfo.y;',
    '}'
  ].join(String.fromCharCode(10));

  var MARKER_FRAGMENT_SOURCE = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec2 vCorner;',
    'varying float vCell;',
    'varying float vSel;',
    'uniform sampler2D uAtlas;',
    'uniform vec3 uFill;',
    'uniform vec3 uRing;',
    'uniform vec3 uInk;',
    'uniform vec3 uSelFill;',
    'uniform vec3 uSelRing;',
    'uniform float uAlpha;',
    'void main() {',
    '  float d = length(vCorner);',
    '  if (d > 1.0) discard;',
    '  float medal = 1.0 - smoothstep(0.66, 0.72, d);',
    '  float core = 1.0 - smoothstep(0.52, 0.58, d);',
    '  float halo = smoothstep(0.78, 0.83, d) * (1.0 - smoothstep(0.93, 0.98, d));',
    '  vec3 fill = mix(uFill, uSelFill, vSel);',
    '  vec3 haloColor = mix(uFill, uSelRing, vSel);',
    '  vec3 face = fill * (0.84 + 0.26 * (vCorner.y * 0.5 + 0.5));',
    '  vec3 body = mix(uRing, face, core);',
    '  vec3 col = mix(haloColor, body, medal);',
    '  float column = mod(vCell, 8.0);',
    '  float row = floor(vCell / 8.0);',
    '  vec2 uv = vec2((column + (vCorner.x * 0.5 + 0.5)) / 8.0, (row + (0.5 - vCorner.y * 0.5)) / 4.0);',
    '  float glyph = texture2D(uAtlas, uv).a;',
    '  col = mix(col, uInk, glyph * core);',
    '  float alpha = max(medal, halo * mix(0.55, 1.0, vSel));',
    '  gl_FragColor = vec4(col, alpha * uAlpha);',
    '}'
  ].join(String.fromCharCode(10));

  var MARKER_UNIFORMS = ['uViewProj', 'uPixel', 'uRadius', 'uAtlas', 'uFill', 'uRing', 'uInk', 'uSelFill', 'uSelRing', 'uAlpha'];

  // The backdrop: one big triangle covering the view, shaded from a soft light in the middle to the edge colour, with a hair of noise so the dark gradient does not band.
  var STAGE_VERTEX_SOURCE = [
    'attribute vec2 aPos;',
    'varying vec2 vNdc;',
    'void main() {',
    '  vNdc = aPos;',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}'
  ].join(String.fromCharCode(10));

  var STAGE_FRAGMENT_SOURCE = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec2 vNdc;',
    'uniform vec3 uCenter;',
    'uniform vec3 uEdge;',
    'uniform vec2 uFocus;',
    'uniform vec2 uReach;',
    'void main() {',
    '  vec2 p = (vNdc - uFocus) / uReach;',
    '  float d = clamp(length(p), 0.0, 1.0);',
    '  float glow = pow(1.0 - d, 1.6);',
    '  vec3 col = mix(uEdge, uCenter, glow);',
    '  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;',
    '  gl_FragColor = vec4(col + grain / 255.0, 1.0);',
    '}'
  ].join(String.fromCharCode(10));

  var STAGE_UNIFORMS = ['uCenter', 'uEdge', 'uFocus', 'uReach'];

  var UNIFORMS = ['uModel', 'uViewProj', 'uNormalMat', 'uBaseTex', 'uEmisTex', 'uBase', 'uEmissive', 'uMetal', 'uRough', 'uCutoff', 'uMask', 'uUnlit', 'uCam', 'uUp', 'uL0', 'uL1', 'uL2', 'uC0', 'uC1', 'uC2'];

  // ------------------------------------------------------------------------------------------------------------------------------ the viewer

  function create(canvas, options) {
    options = options || {};
    var background = options.background && options.background.length === 3 ? options.background : [0.04, 0.05, 0.09];
    var contextOptions = { alpha: false, antialias: true, depth: true, stencil: false, preserveDrawingBuffer: false, powerPreference: 'default' };
    var gl = canvas.getContext('webgl2', contextOptions) || canvas.getContext('webgl', contextOptions) || canvas.getContext('experimental-webgl', contextOptions);
    if (!gl) throw fail('webgl', '3D graphics are not available here.');
    var isGL2 = typeof root.WebGL2RenderingContext !== 'undefined' && gl instanceof root.WebGL2RenderingContext;
    var wideIndices = isGL2 || Boolean(gl.getExtension('OES_element_index_uint'));

    var buffers = [];
    var textures = [];
    var scene = null;
    var disposed = false;
    var lost = false;
    var raf = 0;
    var interacted = false;

    // camera state
    var yaw = HOME_YAW;
    var pitch = HOME_PITCH;
    var zoom = 1;
    var target = [0, 0, 0];
    var spinYaw = 0;
    var spinPitch = 0;
    var lastMoveAt = 0;
    var anim = null;
    // The model's frame of reference (which way is up and where the camera starts), and how much of the view the host covers at the top and bottom (CSS pixels).
    var orient = ORIENTATIONS.y;
    var upAxisName = 'y';
    var insetTop = 0;
    var insetBottom = 0;
    var fitKey = '';
    var fitValue = 0;
    // The optional backdrop (soft light behind the model) and the markers' one-time growth.
    var stage = options.stage && options.stage.center && options.stage.edge && options.stage.center.length === 3 && options.stage.edge.length === 3 ? { center: options.stage.center, edge: options.stage.edge } : null;
    var stageProgram = null;
    var stageShaders = [];
    var stageUniform = {};
    var stageBuffer = null;
    var stageBroken = false;
    var revealStart = -1;
    var drawNow = 0;
    // hotspots: { id, number, order, p: [x,y,z], sx, sy, w, shown } (sx, sy = CSS pixels in the canvas from the last drawn frame)
    var markers = [];
    var selectedId = null;
    var markerProgram = null;
    var markerShaders = [];
    var markerUniform = {};
    var markerBuffer = null;
    var atlasTexture = null;
    var tapState = null;
    var markerData = null;
    // The host may ask for a lower ceiling than the engine's own (a phone holds less than a desktop); it can never raise it.
    var maxTriangles = typeof options.maxTriangles === 'number' && options.maxTriangles > 0 ? Math.min(options.maxTriangles, MAX_TRIANGLES) : MAX_TRIANGLES;
    var style = options.markerStyle || {};
    var colors = {
      fill: style.fill || [0.83, 0.69, 0.22],
      ring: style.ring || [0.03, 0.04, 0.06],
      ink: style.ink || [0.03, 0.04, 0.06],
      selectedFill: style.selectedFill || [0.94, 0.82, 0.4],
      selectedRing: style.selectedRing || [0.95, 0.93, 0.86]
    };

    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.webkitUserSelect = 'none';

    // ---- program
    function compile(type, source) {
      var shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        var log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        if (root.console) root.console.error('GLB viewer shader: ' + log);
        throw fail('webgl', 'The 3D graphics could not be started.');
      }
      return shader;
    }
    var vertexShader = compile(gl.VERTEX_SHADER, VERTEX_SOURCE);
    var fragmentShader = compile(gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.bindAttribLocation(program, 0, 'aPos');
    gl.bindAttribLocation(program, 1, 'aNormal');
    gl.bindAttribLocation(program, 2, 'aUv');
    gl.bindAttribLocation(program, 3, 'aColor');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      if (root.console) root.console.error('GLB viewer program: ' + gl.getProgramInfoLog(program));
      throw fail('webgl', 'The 3D graphics could not be started.');
    }
    var uniform = {};
    for (var u = 0; u < UNIFORMS.length; u++) uniform[UNIFORMS[u]] = gl.getUniformLocation(program, UNIFORMS[u]);

    var whiteTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, whiteTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    textures.push(whiteTexture);

    // ---- GPU uploads
    function uploadBuffer(bindPoint, data) {
      var buffer = gl.createBuffer();
      gl.bindBuffer(bindPoint, buffer);
      gl.bufferData(bindPoint, data, gl.STATIC_DRAW);
      buffers.push(buffer);
      return buffer;
    }

    function uploadImage(image, sampler) {
      var w = image.width;
      var h = image.height;
      var limit = Math.min(MAX_TEXTURE_PX, gl.getParameter(gl.MAX_TEXTURE_SIZE));
      var mipsPossible = isGL2 || (isPow2(w) && isPow2(h));
      var source = image;
      if (w > limit || h > limit || (!isGL2 && !mipsPossible)) {
        var scale = Math.min(1, limit / Math.max(w, h));
        var tw = Math.max(1, Math.round(w * scale));
        var th = Math.max(1, Math.round(h * scale));
        if (!isGL2) { tw = floorPow2(tw); th = floorPow2(th); }
        var scratch = document.createElement('canvas');
        scratch.width = tw;
        scratch.height = th;
        scratch.getContext('2d').drawImage(image, 0, 0, tw, th);
        source = scratch;
        w = tw;
        h = th;
        mipsPossible = isGL2 || (isPow2(w) && isPow2(h));
      }
      var texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      if (gl.UNPACK_COLORSPACE_CONVERSION_WEBGL) gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      var s = sampler || {};
      var wantsMips = s.minFilter === undefined || s.minFilter === 9984 || s.minFilter === 9985 || s.minFilter === 9986 || s.minFilter === 9987;
      var minFilter;
      if (wantsMips && mipsPossible) {
        gl.generateMipmap(gl.TEXTURE_2D);
        minFilter = s.minFilter === undefined ? 9987 : s.minFilter;
      } else {
        minFilter = s.minFilter === 9728 || s.minFilter === 9984 || s.minFilter === 9986 ? 9728 : 9729;
      }
      var wrap = function (mode) {
        if (!isGL2 && !mipsPossible) return 33071;
        return mode === 33071 || mode === 33648 ? mode : 10497;
      };
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, s.magFilter === 9728 ? 9728 : 9729);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap(s.wrapS));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap(s.wrapT));
      textures.push(texture);
      if (image.close) image.close();
      return texture;
    }

    function decodeImage(bytes, mime) {
      var blob = new Blob([bytes], { type: mime });
      if (typeof root.createImageBitmap === 'function') {
        return root.createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }).catch(function () {
          return root.createImageBitmap(blob);
        });
      }
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(blob);
        var image = new Image();
        image.onload = function () { URL.revokeObjectURL(url); resolve(image); };
        image.onerror = function () { URL.revokeObjectURL(url); reject(new Error('image')); };
        image.src = url;
      });
    }

    function imageBytes(doc, index) {
      var def = doc.json.images && doc.json.images[index];
      if (!def) return null;
      if (def.bufferView !== undefined) {
        var bv = doc.json.bufferViews && doc.json.bufferViews[def.bufferView];
        if (!bv) return null;
        var src = bufferSource(doc, bv.buffer);
        return { bytes: new Uint8Array(src.buffer, src.offset + (bv.byteOffset || 0), bv.byteLength), mime: def.mimeType || 'image/png' };
      }
      if (typeof def.uri === 'string' && def.uri.slice(0, 5).toLowerCase() === 'data:') {
        return { bytes: new Uint8Array(decodeDataUri(def.uri)), mime: def.mimeType || 'image/png' };
      }
      return null;
    }

    // ---- scene building
    function disposeScene() {
      var i;
      for (i = 0; i < buffers.length; i++) gl.deleteBuffer(buffers[i]);
      buffers = [];
      for (i = 1; i < textures.length; i++) gl.deleteTexture(textures[i]);
      textures = [whiteTexture];
      scene = null;
    }

    function doLoad(buffer) {
      if (lost) throw fail('context-lost', 'The 3D view was interrupted.');
      disposeScene();
      var doc = parseGlb(buffer);
      var json = doc.json;
      var required = json.extensionsRequired || [];
      for (var r = 0; r < required.length; r++) {
        if (NOT_READABLE.indexOf(required[r]) >= 0) throw fail('unsupported', 'This model uses compression the viewer cannot read yet.');
      }
      var warnings = [];
      var warned = {};
      var warn = function (text) { if (!warned[text]) { warned[text] = true; warnings.push(text); } };
      var textureJobs = {};
      var pending = [];

      function textureFor(texIndex, assign) {
        var def = json.textures && json.textures[texIndex];
        if (!def || def.source === undefined) { warn('Some textures could not be shown.'); return; }
        if (!textureJobs[texIndex]) {
          textureJobs[texIndex] = Promise.resolve()
            .then(function () {
              var found = imageBytes(doc, def.source);
              if (!found) throw new Error('image');
              return decodeImage(found.bytes, found.mime);
            })
            .then(function (image) { return uploadImage(image, json.samplers && json.samplers[def.sampler]); })
            .catch(function () { warn('Some textures could not be shown.'); return null; });
        }
        pending.push(textureJobs[texIndex].then(function (texture) { assign(texture); }));
      }

      var materialCache = {};
      function materialFor(index) {
        var key = index === undefined ? 'default' : String(index);
        if (materialCache[key]) return materialCache[key];
        var def = index === undefined ? null : json.materials && json.materials[index];
        // A primitive with no material (colours come from the vertices) is drawn as a glossy semi-metal; a material the file defines replaces all of these values below.
        var material = { base: [1, 1, 1, 1], metal: 0.55, rough: 0.42, emissive: [0, 0, 0], mask: false, cutoff: 0.5, blend: false, doubleSided: false, unlit: false, baseTexture: null, emissiveTexture: null };
        if (def) {
          var pbr = def.pbrMetallicRoughness || {};
          var ext = def.extensions || {};
          material.base = pbr.baseColorFactor && pbr.baseColorFactor.length === 4 ? pbr.baseColorFactor.slice() : [1, 1, 1, 1];
          material.metal = pbr.metallicFactor === undefined ? 1 : pbr.metallicFactor;
          material.rough = pbr.roughnessFactor === undefined ? 1 : pbr.roughnessFactor;
          var baseTexInfo = pbr.baseColorTexture;
          var legacy = ext.KHR_materials_pbrSpecularGlossiness;
          if (legacy) {
            material.base = legacy.diffuseFactor && legacy.diffuseFactor.length === 4 ? legacy.diffuseFactor.slice() : [1, 1, 1, 1];
            material.metal = 0;
            material.rough = 1 - (legacy.glossinessFactor === undefined ? 1 : legacy.glossinessFactor);
            baseTexInfo = legacy.diffuseTexture;
          }
          var strength = ext.KHR_materials_emissive_strength && ext.KHR_materials_emissive_strength.emissiveStrength;
          var factor = def.emissiveFactor && def.emissiveFactor.length === 3 ? def.emissiveFactor : [0, 0, 0];
          var gain = typeof strength === 'number' ? strength : 1;
          material.emissive = [factor[0] * gain, factor[1] * gain, factor[2] * gain];
          material.mask = def.alphaMode === 'MASK';
          material.blend = def.alphaMode === 'BLEND';
          material.cutoff = def.alphaCutoff === undefined ? 0.5 : def.alphaCutoff;
          material.doubleSided = Boolean(def.doubleSided);
          material.unlit = Boolean(ext.KHR_materials_unlit);
          if (baseTexInfo && baseTexInfo.index !== undefined && !baseTexInfo.texCoord) textureFor(baseTexInfo.index, function (t) { material.baseTexture = t; });
          if (def.emissiveTexture && def.emissiveTexture.index !== undefined && !def.emissiveTexture.texCoord) textureFor(def.emissiveTexture.index, function (t) { material.emissiveTexture = t; });
        }
        materialCache[key] = material;
        return material;
      }

      var triangleCount = 0;
      var meshCache = {};

      function buildPrimitive(prim) {
        var mode = prim.mode === undefined ? 4 : prim.mode;
        if (mode < 4 || mode > 6) return null;
        if (!prim.attributes || prim.attributes.POSITION === undefined) return null;
        if (prim.extensions && prim.extensions.KHR_draco_mesh_compression) throw fail('unsupported', 'This model uses compression the viewer cannot read yet.');
        var position = readAccessor(doc, prim.attributes.POSITION, true);
        var vertexCount = position.length / 3;
        if (vertexCount === 0) return null;
        var indices = triangleIndices(doc, prim, vertexCount);
        if (indices.data.length === 0) return null;
        if (indices.wide && !wideIndices) throw fail('unsupported', 'This model is too detailed for this device.');
        triangleCount += indices.data.length / 3;
        if (triangleCount > maxTriangles) throw fail('too-large', 'This model is too detailed to show on this device.');
        var normal = prim.attributes.NORMAL !== undefined ? readAccessor(doc, prim.attributes.NORMAL, true) : computeNormals(position, indices.data);
        if (normal.length !== position.length) normal = computeNormals(position, indices.data);
        var uv = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(doc, prim.attributes.TEXCOORD_0, true) : null;
        if (uv && uv.length !== vertexCount * 2) uv = null;
        var colorAccessor = prim.attributes.COLOR_0 !== undefined ? json.accessors[prim.attributes.COLOR_0] : null;
        var colorWidth = colorAccessor && colorAccessor.type === 'VEC3' ? 3 : 4;
        var color = colorAccessor ? readAccessor(doc, prim.attributes.COLOR_0, true) : null;
        if (color && color.length !== vertexCount * colorWidth) color = null;
        var min = [Infinity, Infinity, Infinity];
        var max = [-Infinity, -Infinity, -Infinity];
        for (var i = 0; i < position.length; i += 3) {
          for (var k = 0; k < 3; k++) {
            var value = position[i + k];
            if (value < min[k]) min[k] = value;
            if (value > max[k]) max[k] = value;
          }
        }
        return {
          position: uploadBuffer(gl.ARRAY_BUFFER, position),
          normal: uploadBuffer(gl.ARRAY_BUFFER, normal),
          uv: uv ? uploadBuffer(gl.ARRAY_BUFFER, uv) : null,
          color: color ? uploadBuffer(gl.ARRAY_BUFFER, color) : null,
          colorWidth: colorWidth,
          index: uploadBuffer(gl.ELEMENT_ARRAY_BUFFER, indices.data),
          count: indices.data.length,
          indexType: indices.wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
          material: materialFor(prim.material),
          min: min,
          max: max,
          pickPosition: options.pickable ? position : null,
          pickIndex: options.pickable ? indices.data : null,
          // Held only until the model's real extent has been measured (end of doLoad), then released.
          vertices: position
        };
      }

      function primitivesOf(meshIndex) {
        if (meshCache[meshIndex]) return meshCache[meshIndex];
        var mesh = json.meshes && json.meshes[meshIndex];
        var list = [];
        var prims = mesh && mesh.primitives ? mesh.primitives : [];
        for (var p = 0; p < prims.length; p++) {
          var built = buildPrimitive(prims[p]);
          if (built) list.push(built);
        }
        meshCache[meshIndex] = list;
        return list;
      }

      var items = [];
      var lo = [Infinity, Infinity, Infinity];
      var hi = [-Infinity, -Infinity, -Infinity];
      var visits = 0;
      var identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

      function visit(nodeIndex, parent, depth) {
        var node = json.nodes && json.nodes[nodeIndex];
        visits += 1;
        if (!node || depth > MAX_DEPTH || visits > MAX_NODES) return;
        var local = node.matrix && node.matrix.length === 16 ? new Float32Array(node.matrix) : mat4FromTRS(node.translation || [0, 0, 0], node.rotation || [0, 0, 0, 1], node.scale || [1, 1, 1]);
        var world = mat4Multiply(parent, local);
        if (node.mesh !== undefined) {
          var prims = primitivesOf(node.mesh);
          var normals = normalMatrix(world);
          for (var p = 0; p < prims.length; p++) {
            var prim = prims[p];
            var center = [0, 0, 0];
            for (var cx = 0; cx < 2; cx++) {
              for (var cy = 0; cy < 2; cy++) {
                for (var cz = 0; cz < 2; cz++) {
                  var px = cx ? prim.max[0] : prim.min[0], py = cy ? prim.max[1] : prim.min[1], pz = cz ? prim.max[2] : prim.min[2];
                  var wx = world[0] * px + world[4] * py + world[8] * pz + world[12];
                  var wy = world[1] * px + world[5] * py + world[9] * pz + world[13];
                  var wz = world[2] * px + world[6] * py + world[10] * pz + world[14];
                  if (wx < lo[0]) lo[0] = wx; if (wy < lo[1]) lo[1] = wy; if (wz < lo[2]) lo[2] = wz;
                  if (wx > hi[0]) hi[0] = wx; if (wy > hi[1]) hi[1] = wy; if (wz > hi[2]) hi[2] = wz;
                  center[0] += wx / 8; center[1] += wy / 8; center[2] += wz / 8;
                }
              }
            }
            items.push({ prim: prim, model: world, normals: normals.matrix, mirrored: normals.mirrored, center: center });
          }
        }
        var children = node.children || [];
        for (var c = 0; c < children.length; c++) visit(children[c], world, depth + 1);
      }

      var roots = [];
      var sceneIndex = json.scene === undefined ? 0 : json.scene;
      if (json.scenes && json.scenes[sceneIndex] && json.scenes[sceneIndex].nodes) {
        roots = json.scenes[sceneIndex].nodes;
      } else if (json.nodes) {
        var isChild = {};
        for (var n = 0; n < json.nodes.length; n++) {
          var kids = json.nodes[n] && json.nodes[n].children ? json.nodes[n].children : [];
          for (var q = 0; q < kids.length; q++) isChild[kids[q]] = true;
        }
        for (var m = 0; m < json.nodes.length; m++) if (!isChild[m]) roots.push(m);
      }
      for (var ri = 0; ri < roots.length; ri++) visit(roots[ri], identity, 0);
      if (items.length === 0) throw fail('empty', 'This model has nothing to show.');
      if (gl.getError() === gl.OUT_OF_MEMORY) throw fail('memory', 'This model is too large for this device.');

      return Promise.all(pending).then(function () {
        if (disposed || lost) throw fail('context-lost', 'The 3D view was interrupted.');
        if (gl.getError() === gl.OUT_OF_MEMORY) throw fail('memory', 'This model is too large for this device.');
        var chosen = chooseUp(json, lo, hi);
        var shape = measure(items, lo, hi, ORIENTATIONS[chosen].axis);
        for (var released = 0; released < items.length; released++) items[released].prim.vertices = null;
        orient = ORIENTATIONS[chosen];
        upAxisName = chosen;
        scene = { items: items, center: shape.center, radius: shape.radius, half: shape.half, reach: shape.reach };
        fitKey = '';
        revealStart = -1;
        yaw = HOME_YAW;
        pitch = HOME_PITCH;
        zoom = 1;
        target = shape.center.slice();
        anim = null;
        spinYaw = 0;
        spinPitch = 0;
        requestRender();
        return { triangles: Math.round(triangleCount), warnings: warnings, up: upAxisName };
      });
    }

    /**
     * Which way is up for this file: 'y' (glTF's own, and the answer for every file but one kind) or 'z'. The one kind: a file written by the trimesh library (named in asset.generator), which
     * writes its models' own Z-up coordinates with no rotation, and whose extent along Z is clearly the largest. The decision is about the camera's frame only; no coordinate is changed.
     */
    function chooseUp(json, lo, hi) {
      if (options.upAxis === 'y' || options.upAxis === 'z') return options.upAxis;
      var generator = json.asset && typeof json.asset.generator === 'string' ? json.asset.generator.toLowerCase() : '';
      if (generator.indexOf('trimesh') < 0) return 'y';
      var ex = hi[0] - lo[0], ey = hi[1] - lo[1], ez = hi[2] - lo[2];
      return ez > ey * 1.25 && ez > ex ? 'z' : 'y';
    }

    /**
     * The model's real extent from its vertices (each placed by its node's transform), not from the loose boxes of its parts: the centre, the sphere radius, the half-height along the up axis
     * and the reach (the greatest distance of any vertex from the vertical line through the centre). The home view is fitted to the cylinder these make. Two passes, one multiply-add per
     * coordinate per vertex; if a part has no vertices to read, the boxes the walk of the scene made are used instead.
     */
    function measure(list, looseLo, looseHi, axis) {
      var a1 = (axis + 1) % 3;
      var a2 = (axis + 2) % 3;
      var minimum = [Infinity, Infinity, Infinity];
      var maximum = [-Infinity, -Infinity, -Infinity];
      var n;
      var i;
      for (n = 0; n < list.length; n++) {
        var m = list[n].model;
        var pos = list[n].prim.vertices;
        if (!pos) continue;
        for (i = 0; i + 2 < pos.length; i += 3) {
          var x = pos[i], y = pos[i + 1], z = pos[i + 2];
          var wx = m[0] * x + m[4] * y + m[8] * z + m[12];
          var wy = m[1] * x + m[5] * y + m[9] * z + m[13];
          var wz = m[2] * x + m[6] * y + m[10] * z + m[14];
          if (wx < minimum[0]) minimum[0] = wx; if (wx > maximum[0]) maximum[0] = wx;
          if (wy < minimum[1]) minimum[1] = wy; if (wy > maximum[1]) maximum[1] = wy;
          if (wz < minimum[2]) minimum[2] = wz; if (wz > maximum[2]) maximum[2] = wz;
        }
      }
      if (!isFinite(minimum[0] + minimum[1] + minimum[2] + maximum[0] + maximum[1] + maximum[2])) {
        minimum = looseLo.slice();
        maximum = looseHi.slice();
      }
      var center = [(minimum[0] + maximum[0]) / 2, (minimum[1] + maximum[1]) / 2, (minimum[2] + maximum[2]) / 2];
      var dx = maximum[0] - minimum[0], dy = maximum[1] - minimum[1], dz = maximum[2] - minimum[2];
      var radius = Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;
      if (!(radius > 0) || !isFinite(radius)) radius = 1;
      var half = ([dx, dy, dz][axis]) / 2;
      var reachSquared = 0;
      for (n = 0; n < list.length; n++) {
        var q = list[n].model;
        var verts = list[n].prim.vertices;
        if (!verts) continue;
        for (i = 0; i + 2 < verts.length; i += 3) {
          var px = verts[i], py = verts[i + 1], pz = verts[i + 2];
          var ox = q[0] * px + q[4] * py + q[8] * pz + q[12] - center[0];
          var oy = q[1] * px + q[5] * py + q[9] * pz + q[13] - center[1];
          var oz = q[2] * px + q[6] * py + q[10] * pz + q[14] - center[2];
          var first = a1 === 0 ? ox : a1 === 1 ? oy : oz;
          var second = a2 === 0 ? ox : a2 === 1 ? oy : oz;
          var around = first * first + second * second;
          if (around > reachSquared) reachSquared = around;
        }
      }
      var reach = Math.sqrt(reachSquared);
      // A model that is only a box (or has no vertices to read): use the half-diagonal of its footprint, which cannot be too small.
      if (!(reach > 0) || !isFinite(reach)) reach = Math.sqrt(Math.pow([dx, dy, dz][a1] / 2, 2) + Math.pow([dx, dy, dz][a2] / 2, 2));
      if (!(half > 0) || !isFinite(half)) half = radius;
      if (!(reach > 0) || !isFinite(reach)) reach = radius;
      return { center: center, radius: radius, half: half, reach: reach };
    }

    // ---- drawing
    /** The share of the view's height a host leaves free of its own controls (1 when it covers none). */
    function viewShare() {
      var h = Math.max(1, canvas.clientHeight);
      return Math.max(0.35, Math.min(1, (h - insetTop - insetBottom) / h));
    }

    /** How far (in clip-space units, upwards) the middle of the free space is above the middle of the view. */
    function shiftY() {
      var h = Math.max(1, canvas.clientHeight);
      return Math.max(-0.6, Math.min(0.6, (insetBottom - insetTop) / h));
    }

    /**
     * The distance at which the whole model fits the free part of the view at the home view. The model is the cylinder round the up axis that its vertices make (scene.reach, scene.half): the
     * rim of each end of the cylinder is sampled, and for each point the distance that keeps it inside the (narrowed) field of view, horizontally and vertically, is worked out from where the
     * point is in the camera's frame (a nearer point looks larger, so it needs more room). The greatest of those wins, so nothing is cropped. Remembered until the view's shape changes.
     */
    function homeDistance(aspect) {
      var share = viewShare();
      var key = aspect + ':' + share;
      if (fitKey === key && fitValue > 0) return fitValue;
      var tanHalf = Math.tan(FOV / 2);
      var tx = tanHalf * aspect * FIT_X;
      var ty = tanHalf * share * FIT_Y;
      var cp = Math.cos(HOME_PITCH);
      var sp = Math.sin(HOME_PITCH);
      var need = 0;
      for (var end = -1; end <= 1; end += 2) {
        var height = end * scene.half;
        for (var k = 0; k < 24; k++) {
          var angle = (k / 24) * TWO_PI;
          var toward = scene.reach * Math.cos(angle);
          var across = scene.reach * Math.sin(angle);
          var depth = toward * cp + height * sp;
          var rise = height * cp - toward * sp;
          need = Math.max(need, depth + Math.abs(across) / tx, depth + Math.abs(rise) / ty);
        }
      }
      var distance = Math.max(need, scene.radius * 1.3);
      fitKey = key;
      fitValue = distance;
      return distance;
    }

    /** The direction from the camera's target to the camera for the current yaw and pitch (a unit vector), in the model's own frame of reference. */
    function eyeOffset() {
      var cp = Math.cos(pitch), sp = Math.sin(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw);
      var u = orient.up, f = orient.front, s = orient.side;
      return [
        cp * (sy * s[0] + cy * f[0]) + sp * u[0],
        cp * (sy * s[1] + cy * f[1]) + sp * u[1],
        cp * (sy * s[2] + cy * f[2]) + sp * u[2]
      ];
    }

    function syncSize() {
      var dpr = Math.min(root.devicePixelRatio || 1, 2);
      var w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      var h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    function bindAttributes(prim) {
      gl.bindBuffer(gl.ARRAY_BUFFER, prim.position);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, prim.normal);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      if (prim.uv) {
        gl.bindBuffer(gl.ARRAY_BUFFER, prim.uv);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
      } else {
        gl.disableVertexAttribArray(2);
        gl.vertexAttrib2f(2, 0, 0);
      }
      if (prim.color) {
        gl.bindBuffer(gl.ARRAY_BUFFER, prim.color);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, prim.colorWidth, gl.FLOAT, false, 0, 0);
      } else {
        gl.disableVertexAttribArray(3);
        gl.vertexAttrib4f(3, 1, 1, 1, 1);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, prim.index);
    }

    function drawItem(item) {
      var material = item.prim.material;
      if (material.doubleSided) gl.disable(gl.CULL_FACE);
      else { gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); }
      gl.frontFace(item.mirrored ? gl.CW : gl.CCW);
      gl.uniformMatrix4fv(uniform.uModel, false, item.model);
      gl.uniformMatrix3fv(uniform.uNormalMat, false, item.normals);
      gl.uniform4fv(uniform.uBase, material.base);
      gl.uniform3fv(uniform.uEmissive, material.emissive);
      gl.uniform1f(uniform.uMetal, material.metal);
      gl.uniform1f(uniform.uRough, material.rough);
      gl.uniform1f(uniform.uCutoff, material.cutoff);
      gl.uniform1f(uniform.uMask, material.mask ? 1 : 0);
      gl.uniform1f(uniform.uUnlit, material.unlit ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, material.baseTexture || whiteTexture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, material.emissiveTexture || whiteTexture);
      bindAttributes(item.prim);
      gl.drawElements(gl.TRIANGLES, item.prim.count, item.prim.indexType, 0);
    }

    /** The camera as the next frame (and a pick) sees it. */
    function cameraState() {
      var aspect = canvas.width / canvas.height;
      var distance = homeDistance(aspect) * zoom;
      var offset = eyeOffset();
      var eye = [target[0] + distance * offset[0], target[1] + distance * offset[1], target[2] + distance * offset[2]];
      return { aspect: aspect, distance: distance, eye: eye, view: lookAt(eye, target, orient.up) };
    }

    /** The backdrop: a soft light behind the middle of the free space, drawn first and never into the depth buffer. Any trouble with it leaves the flat colour. */
    function drawStage() {
      if (!stage || stageBroken) return;
      if (!stageProgram) {
        try {
          var vs = compile(gl.VERTEX_SHADER, STAGE_VERTEX_SOURCE);
          var fs = compile(gl.FRAGMENT_SHADER, STAGE_FRAGMENT_SOURCE);
          var created = gl.createProgram();
          gl.attachShader(created, vs);
          gl.attachShader(created, fs);
          gl.bindAttribLocation(created, 0, 'aPos');
          gl.linkProgram(created);
          if (!gl.getProgramParameter(created, gl.LINK_STATUS)) throw fail('webgl', 'The backdrop could not be started.');
          stageShaders = [vs, fs];
          for (var s = 0; s < STAGE_UNIFORMS.length; s++) stageUniform[STAGE_UNIFORMS[s]] = gl.getUniformLocation(created, STAGE_UNIFORMS[s]);
          stageBuffer = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, stageBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
          stageProgram = created;
        } catch (ignored) {
          stageBroken = true;
          return;
        }
      }
      var w = Math.max(1, canvas.clientWidth);
      var h = Math.max(1, canvas.clientHeight);
      var reachPx = 0.55 * Math.sqrt(w * w + h * h);
      gl.useProgram(stageProgram);
      gl.uniform3fv(stageUniform.uCenter, stage.center);
      gl.uniform3fv(stageUniform.uEdge, stage.edge);
      gl.uniform2f(stageUniform.uFocus, 0, shiftY());
      gl.uniform2f(stageUniform.uReach, reachPx / (w / 2), reachPx / (h / 2));
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.depthMask(false);
      gl.bindBuffer(gl.ARRAY_BUFFER, stageBuffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.disableVertexAttribArray(1);
      gl.disableVertexAttribArray(2);
      gl.disableVertexAttribArray(3);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.depthMask(true);
    }

    function draw() {
      syncSize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(background[0], background[1], background[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      drawStage();
      if (!scene) return;
      var cam = cameraState();
      var aspect = cam.aspect;
      var distance = cam.distance;
      var eye = cam.eye;
      var view = cam.view;
      // The depth range reaches 3 radii either side of the target: a model panned off-centre (up to a radius, or more after Focus) is never cut by the near or far plane.
      var near = Math.max(scene.radius * 0.01, distance - scene.radius * 3);
      var far = distance + scene.radius * 4;
      // The projection is shifted up or down by the host's insets, so the target (the middle of the model) lands in the middle of the free space rather than of the whole view.
      var projection = mat4Perspective(FOV, aspect, near, far);
      projection[9] = -shiftY();
      var viewProj = mat4Multiply(projection, view.matrix);
      var r = view.right, u = view.up, b = view.back;
      var key = normalize3([-0.5 * r[0] + 0.8 * u[0] + 0.9 * b[0], -0.5 * r[1] + 0.8 * u[1] + 0.9 * b[1], -0.5 * r[2] + 0.8 * u[2] + 0.9 * b[2]]);
      var fill = normalize3([0.8 * r[0] + 0.1 * u[0] + 0.6 * b[0], 0.8 * r[1] + 0.1 * u[1] + 0.6 * b[1], 0.8 * r[2] + 0.1 * u[2] + 0.6 * b[2]]);
      var rim = normalize3([0.2 * r[0] + 0.4 * u[0] - 1.0 * b[0], 0.2 * r[1] + 0.4 * u[1] - 1.0 * b[1], 0.2 * r[2] + 0.4 * u[2] - 1.0 * b[2]]);

      gl.useProgram(program);
      gl.uniformMatrix4fv(uniform.uViewProj, false, viewProj);
      gl.uniform3fv(uniform.uCam, eye);
      gl.uniform3fv(uniform.uUp, orient.up);
      gl.uniform3fv(uniform.uL0, key);
      gl.uniform3fv(uniform.uL1, fill);
      gl.uniform3fv(uniform.uL2, rim);
      gl.uniform3f(uniform.uC0, 1.3, 1.24, 1.12);
      gl.uniform3f(uniform.uC1, 0.3, 0.37, 0.52);
      gl.uniform3f(uniform.uC2, 0.5, 0.5, 0.58);
      gl.uniform1i(uniform.uBaseTex, 0);
      gl.uniform1i(uniform.uEmisTex, 1);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);

      var blended = [];
      var i;
      for (i = 0; i < scene.items.length; i++) {
        var item = scene.items[i];
        if (item.prim.material.blend) blended.push(item);
        else drawItem(item);
      }
      if (blended.length > 0) {
        for (i = 0; i < blended.length; i++) {
          var c = blended[i].center;
          blended[i].distance = (c[0] - eye[0]) * (c[0] - eye[0]) + (c[1] - eye[1]) * (c[1] - eye[1]) + (c[2] - eye[2]) * (c[2] - eye[2]);
        }
        blended.sort(function (a, z) { return z.distance - a.distance; });
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
        gl.depthMask(false);
        for (i = 0; i < blended.length; i++) drawItem(blended[i]);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
      drawMarkers(viewProj, eye);
    }

    function clampPitch(value) {
      return Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, value));
    }

    function clampZoom(value) {
      var low = ZOOM_MIN;
      // A wide, flat model is framed close, so 0.4x of that could be inside it: the camera is also kept MIN_DISTANCE radii from the target.
      if (scene) {
        var floor = (scene.radius * MIN_DISTANCE) / homeDistance(canvas.width / Math.max(1, canvas.height));
        if (floor > low) low = Math.min(floor, 1);
      }
      return Math.max(low, Math.min(ZOOM_MAX, value));
    }

    function frame(now) {
      raf = 0;
      if (disposed || lost) return;
      var again = false;
      if (anim) {
        var t = Math.min(1, (now - anim.start) / RESET_MS);
        var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        yaw = anim.from.yaw + anim.dyaw * e;
        pitch = anim.from.pitch + (anim.to.pitch - anim.from.pitch) * e;
        zoom = anim.from.zoom + (anim.to.zoom - anim.from.zoom) * e;
        for (var k = 0; k < 3; k++) target[k] = anim.from.target[k] + (anim.to.target[k] - anim.from.target[k]) * e;
        if (t >= 1) anim = null;
        else again = true;
      }
      if (pointerCount() === 0 && (Math.abs(spinYaw) > 0.0002 || Math.abs(spinPitch) > 0.0002)) {
        yaw += spinYaw;
        pitch = clampPitch(pitch + spinPitch);
        spinYaw *= 0.9;
        spinPitch *= 0.9;
        again = true;
      }
      // The markers' one-time growth: it starts with the first frame that has both a model and markers and runs for a fraction of a second; with Reduce Motion there is none.
      drawNow = now;
      if (scene && markers.length > 0 && !options.reducedMotion) {
        if (revealStart < 0) revealStart = now;
        if (now - revealStart < REVEAL_MS + REVEAL_STEP * (markers.length - 1)) again = true;
      }
      draw();
      if (again) requestRender();
    }

    function requestRender() {
      if (raf || disposed || lost) return;
      raf = root.requestAnimationFrame(frame);
    }

    // ---- hotspot markers
    function ensureMarkerGl() {
      if (markerProgram) return;
      var vs = compile(gl.VERTEX_SHADER, MARKER_VERTEX_SOURCE);
      var fs = compile(gl.FRAGMENT_SHADER, MARKER_FRAGMENT_SOURCE);
      var created = gl.createProgram();
      gl.attachShader(created, vs);
      gl.attachShader(created, fs);
      gl.bindAttribLocation(created, 0, 'aPos');
      gl.bindAttribLocation(created, 1, 'aCorner');
      gl.bindAttribLocation(created, 2, 'aInfo');
      gl.linkProgram(created);
      if (!gl.getProgramParameter(created, gl.LINK_STATUS)) {
        if (root.console) root.console.error('GLB viewer marker program: ' + gl.getProgramInfoLog(created));
        throw fail('webgl', 'The 3D graphics could not be started.');
      }
      markerShaders = [vs, fs];
      for (var m = 0; m < MARKER_UNIFORMS.length; m++) markerUniform[MARKER_UNIFORMS[m]] = gl.getUniformLocation(created, MARKER_UNIFORMS[m]);
      markerBuffer = gl.createBuffer();
      atlasTexture = buildAtlas();
      markerProgram = created;
    }

    /** The numerals 1 to 30 as white text on a transparent sheet; the shader colours them. */
    function buildAtlas() {
      var sheet = document.createElement('canvas');
      sheet.width = ATLAS_COLS * ATLAS_CELL;
      sheet.height = ATLAS_ROWS * ATLAS_CELL;
      var context = sheet.getContext('2d');
      context.fillStyle = 'white';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      for (var n = 1; n <= MAX_HOTSPOTS; n++) {
        var cell = n - 1;
        // Two digits are set a little smaller so they sit inside the medallion's face as one digit does.
        context.font = n >= 10 ? 'bold 27px sans-serif' : 'bold 36px sans-serif';
        context.fillText(String(n), (cell % ATLAS_COLS) * ATLAS_CELL + ATLAS_CELL / 2, Math.floor(cell / ATLAS_COLS) * ATLAS_CELL + ATLAS_CELL / 2 + 2);
      }
      var texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sheet);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    }

    /**
     * Draws the hotspot markers over the model with the SAME camera. Each is a screen-facing disc at its 3D position, depth-tested against the model: where the spot is in front of the
     * surface it is drawn solid, where the model is in front of it a faint ghost. Also records where each marker is on screen (for taps).
     */
    function drawMarkers(viewProj, eye) {
      if (markers.length === 0 || !scene) return;
      var width = canvas.clientWidth;
      var height = canvas.clientHeight;
      var shown = [];
      for (var i = 0; i < markers.length; i++) {
        var m = markers[i];
        var p = m.p;
        var w = viewProj[3] * p[0] + viewProj[7] * p[1] + viewProj[11] * p[2] + viewProj[15];
        var cx = viewProj[0] * p[0] + viewProj[4] * p[1] + viewProj[8] * p[2] + viewProj[12];
        var cy = viewProj[1] * p[0] + viewProj[5] * p[1] + viewProj[9] * p[2] + viewProj[13];
        m.w = w;
        m.shown = w > 0;
        if (!m.shown) continue;
        m.sx = (cx / w * 0.5 + 0.5) * width;
        m.sy = (1 - (cy / w * 0.5 + 0.5)) * height;
        if (m.id !== selectedId) shown.push(m);
      }
      for (var s = 0; s < markers.length; s++) if (markers[s].shown && markers[s].id === selectedId) shown.push(markers[s]); // the chosen one on top
      if (shown.length === 0) return;
      ensureMarkerGl();
      // One buffer for the life of the viewer (at most 30 markers), refilled each frame, instead of a new array every frame.
      if (markerData === null) markerData = new Float32Array(MAX_HOTSPOTS * 6 * 8);
      var data = markerData;
      var at = 0;
      var bias = scene.radius * 0.012;
      for (var k = 0; k < shown.length; k++) {
        var item = shown[k];
        var dx = eye[0] - item.p[0], dy = eye[1] - item.p[1], dz = eye[2] - item.p[2];
        var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        var bx = item.p[0] + (dx / len) * bias, by = item.p[1] + (dy / len) * bias, bz = item.p[2] + (dz / len) * bias;
        var cell = Math.min(MAX_HOTSPOTS, Math.max(1, item.number)) - 1;
        var chosen = item.id === selectedId ? 1 : 0;
        // Growth: 0 to 1 (eased out) over REVEAL_MS, each marker REVEAL_STEP after the one before; always 1 with Reduce Motion or once it has run.
        var grown = 1;
        if (!options.reducedMotion && revealStart >= 0) {
          var progress = (drawNow - revealStart - item.order * REVEAL_STEP) / REVEAL_MS;
          grown = progress <= 0 ? 0 : progress >= 1 ? 1 : 1 - Math.pow(1 - progress, 3);
        }
        for (var v = 0; v < 6; v++) {
          data[at++] = bx; data[at++] = by; data[at++] = bz;
          data[at++] = MARKER_CORNERS[v * 2]; data[at++] = MARKER_CORNERS[v * 2 + 1];
          data[at++] = cell; data[at++] = chosen; data[at++] = grown;
        }
      }
      gl.useProgram(markerProgram);
      gl.uniformMatrix4fv(markerUniform.uViewProj, false, viewProj);
      gl.uniform2f(markerUniform.uPixel, 2 / canvas.width, 2 / canvas.height);
      gl.uniform1f(markerUniform.uRadius, MARKER_RADIUS * (canvas.width / Math.max(1, width)));
      gl.uniform3fv(markerUniform.uFill, colors.fill);
      gl.uniform3fv(markerUniform.uRing, colors.ring);
      gl.uniform3fv(markerUniform.uInk, colors.ink);
      gl.uniform3fv(markerUniform.uSelFill, colors.selectedFill);
      gl.uniform3fv(markerUniform.uSelRing, colors.selectedRing);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.uniform1i(markerUniform.uAtlas, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, markerBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, at), gl.DYNAMIC_DRAW);
      gl.disableVertexAttribArray(3);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 32, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 32, 20);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
      gl.depthFunc(gl.LEQUAL);
      gl.uniform1f(markerUniform.uAlpha, 1);
      gl.drawArrays(gl.TRIANGLES, 0, shown.length * 6);
      gl.depthFunc(gl.GREATER);
      gl.uniform1f(markerUniform.uAlpha, 0.32);
      gl.drawArrays(gl.TRIANGLES, 0, shown.length * 6);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    /** The id of the marker nearest to a point of the canvas (CSS pixels from its top-left), within a finger-sized radius; the one nearer the camera wins a near tie. */
    function markerAt(x, y) {
      var best = null;
      var bestDistance = MARKER_HIT * MARKER_HIT;
      for (var i = 0; i < markers.length; i++) {
        var m = markers[i];
        if (!m.shown) continue;
        var d = (m.sx - x) * (m.sx - x) + (m.sy - y) * (m.sy - y);
        if (d > MARKER_HIT * MARKER_HIT) continue;
        if (best === null || d < bestDistance - 100 || (d < bestDistance + 100 && m.w < best.w)) {
          best = m;
          bestDistance = d;
        }
      }
      return best ? best.id : null;
    }

    function emitTap(clientX, clientY) {
      if (!options.onTap) return;
      var rect = canvas.getBoundingClientRect();
      options.onTap({ clientX: clientX, clientY: clientY, hotspotId: markerAt(clientX - rect.left, clientY - rect.top) });
    }

    /**
     * The nearest visible surface point under a point of the screen, in model space, or null. Ray: from the camera through the point (the canvas is mapped with the same field of view and
     * aspect as the drawing, from the page rectangle, so the device pixel ratio does not matter). Each mesh is tested in its own space: the ray is moved there with the inverse of the
     * mesh's world matrix (a box test first, then every triangle, Moller-Trumbore), and the distances are comparable because the move is affine. Only called when asked.
     */
    function pick(clientX, clientY) {
      if (!scene || disposed || lost) return null;
      var rect = canvas.getBoundingClientRect();
      if (!(rect.width > 0) || !(rect.height > 0)) return null;
      var nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      var ny = 1 - ((clientY - rect.top) / rect.height) * 2;
      if (nx < -1 || nx > 1 || ny < -1 || ny > 1) return null;
      // A host that covers part of the view has the projection shifted; the ray goes through the point of the unshifted view that lands here.
      ny -= shiftY();
      syncSize();
      var cam = cameraState();
      var tanHalf = Math.tan(FOV / 2);
      var r = cam.view.right, u = cam.view.up, b = cam.view.back;
      var dir = normalize3([
        -b[0] + nx * tanHalf * cam.aspect * r[0] + ny * tanHalf * u[0],
        -b[1] + nx * tanHalf * cam.aspect * r[1] + ny * tanHalf * u[1],
        -b[2] + nx * tanHalf * cam.aspect * r[2] + ny * tanHalf * u[2]
      ]);
      var origin = cam.eye;
      var bestT = Infinity;
      for (var n = 0; n < scene.items.length; n++) {
        var item = scene.items[n];
        var prim = item.prim;
        if (!prim.pickPosition || !prim.pickIndex) continue;
        if (item.inverse === undefined) item.inverse = affineInverse(item.model);
        var inv = item.inverse;
        if (!inv) continue;
        var vx = origin[0] - inv[9], vy = origin[1] - inv[10], vz = origin[2] - inv[11];
        var o = [inv[0] * vx + inv[3] * vy + inv[6] * vz, inv[1] * vx + inv[4] * vy + inv[7] * vz, inv[2] * vx + inv[5] * vy + inv[8] * vz];
        var d = [inv[0] * dir[0] + inv[3] * dir[1] + inv[6] * dir[2], inv[1] * dir[0] + inv[4] * dir[1] + inv[7] * dir[2], inv[2] * dir[0] + inv[5] * dir[1] + inv[8] * dir[2]];
        if (!rayHitsBox(o, d, prim.min, prim.max, bestT)) continue;
        var pos = prim.pickPosition;
        var idx = prim.pickIndex;
        var twoSided = prim.material.doubleSided;
        for (var i = 0; i < idx.length; i += 3) {
          var a = idx[i] * 3, bb = idx[i + 1] * 3, c = idx[i + 2] * 3;
          var e1x = pos[bb] - pos[a], e1y = pos[bb + 1] - pos[a + 1], e1z = pos[bb + 2] - pos[a + 2];
          var e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
          var px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
          var det = e1x * px + e1y * py + e1z * pz;
          if (Math.abs(det) < 1e-18) continue;
          if (!twoSided && det < 0) continue; // the back of a one-sided surface is not drawn, so it is not hit
          var f = 1 / det;
          var tx = o[0] - pos[a], ty = o[1] - pos[a + 1], tz = o[2] - pos[a + 2];
          var su = (tx * px + ty * py + tz * pz) * f;
          if (su < 0 || su > 1) continue;
          var qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
          var sv = (d[0] * qx + d[1] * qy + d[2] * qz) * f;
          if (sv < 0 || su + sv > 1) continue;
          var t = (e2x * qx + e2y * qy + e2z * qz) * f;
          if (t > 1e-6 && t < bestT) bestT = t;
        }
      }
      if (!isFinite(bestT)) return null;
      return { position: [origin[0] + dir[0] * bestT, origin[1] + dir[1] * bestT, origin[2] + dir[2] * bestT], distance: bestT };
    }

    // ---- camera controls
    var pointers = {};
    var pinchDistance = 0;
    var pinchMid = null;

    function pointerCount() {
      var n = 0;
      for (var id in pointers) if (Object.prototype.hasOwnProperty.call(pointers, id)) n += 1;
      return n;
    }

    function touched() {
      if (!interacted) {
        interacted = true;
        if (options.onFirstInteraction) options.onFirstInteraction();
      }
    }

    function rotate(dx, dy) {
      // A turn of the whole view takes the same swipe on a tall phone as on a squarer view: the length measured is the shorter of the height and 1.4 x the width.
      var basis = Math.max(1, Math.min(canvas.clientHeight, canvas.clientWidth * 1.4));
      var step = (Math.PI * 1.2) / basis;
      yaw -= dx * step;
      pitch = clampPitch(pitch + dy * step);
      spinYaw = -dx * step;
      spinPitch = dy * step;
      lastMoveAt = root.performance.now();
      anim = null;
      requestRender();
    }

    function pan(dx, dy) {
      if (!scene) return;
      var aspect = canvas.width / canvas.height;
      var distance = homeDistance(aspect) * zoom;
      var perPixel = (2 * distance * Math.tan(FOV / 2)) / Math.max(1, canvas.clientHeight);
      var eye = eyeOffset();
      var view = lookAt(eye, [0, 0, 0], orient.up);
      var before = Math.sqrt(
        (target[0] - scene.center[0]) * (target[0] - scene.center[0]) + (target[1] - scene.center[1]) * (target[1] - scene.center[1]) + (target[2] - scene.center[2]) * (target[2] - scene.center[2])
      );
      for (var k = 0; k < 3; k++) target[k] += (-view.right[k] * dx + view.up[k] * dy) * perPixel;
      var off = [target[0] - scene.center[0], target[1] - scene.center[1], target[2] - scene.center[2]];
      var len = Math.sqrt(off[0] * off[0] + off[1] * off[1] + off[2] * off[2]);
      // The offset may not grow past the limit, but one that is already past it (after Focus) is not pulled back: it can only shrink.
      var limit = Math.max(scene.radius * PAN_LIMIT, before);
      if (len > limit) for (var j = 0; j < 3; j++) target[j] = scene.center[j] + (off[j] / len) * limit;
      anim = null;
      requestRender();
    }

    function onPointerDown(event) {
      touched();
      try { canvas.setPointerCapture(event.pointerId); } catch (ignored) { /* a pointer that is already gone */ }
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      spinYaw = 0;
      spinPitch = 0;
      // A tap is one finger (or the left button) that goes down and up in place and soon; anything else is a drag or a pinch and never a tap.
      tapState = pointerCount() === 1 ? { id: event.pointerId, x: event.clientX, y: event.clientY, at: root.performance.now(), ok: event.button === 0 && !event.shiftKey, moved: false } : null;
      if (pointerCount() === 2) {
        var ids = Object.keys(pointers);
        var a = pointers[ids[0]], b = pointers[ids[1]];
        pinchDistance = Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
        pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
      event.preventDefault();
    }

    function onPointerMove(event) {
      var previous = pointers[event.pointerId];
      if (!previous) return;
      if (tapState && tapState.id === event.pointerId && !tapState.moved) {
        var slopX = event.clientX - tapState.x;
        var slopY = event.clientY - tapState.y;
        if (slopX * slopX + slopY * slopY > TAP_SLOP * TAP_SLOP) tapState.moved = true;
      }
      var dx = event.clientX - previous.x;
      var dy = event.clientY - previous.y;
      previous.x = event.clientX;
      previous.y = event.clientY;
      var count = pointerCount();
      if (count === 1) {
        if (event.pointerType === 'mouse' && (event.shiftKey || (event.buttons & 6) !== 0)) pan(dx, dy);
        else rotate(dx, dy);
      } else if (count === 2) {
        var ids = Object.keys(pointers);
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var distance = Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
        var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (pinchDistance > 0 && distance > 0) zoom = clampZoom(zoom * (pinchDistance / distance));
        if (pinchMid) pan(mid.x - pinchMid.x, mid.y - pinchMid.y);
        pinchDistance = distance;
        pinchMid = mid;
        anim = null;
        requestRender();
      }
      event.preventDefault();
    }

    function onPointerEnd(event) {
      if (!pointers[event.pointerId]) return;
      var tap = tapState && tapState.id === event.pointerId ? tapState : null;
      if (tap) tapState = null;
      delete pointers[event.pointerId];
      if (tap && tap.ok && !tap.moved && event.type === 'pointerup' && root.performance.now() - tap.at < TAP_MS) emitTap(event.clientX, event.clientY);
      pinchDistance = 0;
      pinchMid = null;
      // A short glide after a quick flick is kept; a finger that had stopped, a pinch, or Reduce Motion leaves the model where it is.
      var stopped = root.performance.now() - lastMoveAt > 80;
      if (options.reducedMotion || stopped || pointerCount() > 0) {
        spinYaw = 0;
        spinPitch = 0;
      }
      requestRender();
    }

    function onWheel(event) {
      touched();
      event.preventDefault();
      // deltaMode 0 is pixels; some browsers report wheel notches in lines (1) or pages (2), which are scaled to about the same amount.
      var wheel = event.deltaY * (event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1);
      zoom = clampZoom(zoom * Math.exp(Math.max(-300, Math.min(300, wheel)) * 0.0015));
      anim = null;
      requestRender();
    }

    function onKeyDown(event) {
      var handled = true;
      var step = 0.12;
      touched();
      if (event.key === 'ArrowLeft') yaw += step;
      else if (event.key === 'ArrowRight') yaw -= step;
      else if (event.key === 'ArrowUp') pitch = clampPitch(pitch + step);
      else if (event.key === 'ArrowDown') pitch = clampPitch(pitch - step);
      else if (event.key === '+' || event.key === '=') zoom = clampZoom(zoom / 1.15);
      else if (event.key === '-' || event.key === '_') zoom = clampZoom(zoom * 1.15);
      else if (event.key === '0' || event.key === 'Home') { reset(); return; }
      else handled = false;
      if (handled) {
        event.preventDefault();
        anim = null;
        requestRender();
      }
    }

    function reset() {
      spinYaw = 0;
      spinPitch = 0;
      if (!scene) return;
      var to = { yaw: HOME_YAW, pitch: HOME_PITCH, zoom: 1, target: scene.center.slice() };
      if (options.reducedMotion) {
        yaw = to.yaw;
        pitch = to.pitch;
        zoom = to.zoom;
        target = to.target;
        anim = null;
        requestRender();
        return;
      }
      var delta = to.yaw - yaw;
      delta = delta - Math.round(delta / TWO_PI) * TWO_PI;
      anim = { start: root.performance.now(), from: { yaw: yaw, pitch: pitch, zoom: zoom, target: target.slice() }, to: to, dyaw: delta };
      requestRender();
    }

    /**
     * Frames a hotspot: the viewing direction stays as the learner has it; the camera's target moves to the hotspot's point (lowered by offsetY half-heights so a host that covers part of the
     * view with a panel can have the point in the uncovered part) and the camera comes closer if it was farther out than FOCUS_ZOOM. Nothing about the hotspot is changed.
     */
    function focusMarker(id, offsetY, offsetX) {
      var found = markerById(id);
      if (!found) return;
      frameMarker(found, offsetY, offsetX, Math.min(zoom, FOCUS_ZOOM));
    }

    /**
     * Brings a hotspot into the free part of the view only if it is not already there: a host that opens a panel over part of the view (everything below freeBottom, or right of freeRight, in
     * CSS pixels; null for none) calls this so the point it is explaining is never hidden under the panel. The camera glides (the viewing direction and the distance stay); nothing moves
     * when the point is already in the free part, in front of the model and not at its very edge.
     */
    function revealMarker(id, offsetY, offsetX, freeBottom, freeRight) {
      var found = markerById(id);
      if (!found) return;
      var margin = 40;
      var bottom = typeof freeBottom === 'number' && isFinite(freeBottom) ? freeBottom : canvas.clientHeight;
      var right = typeof freeRight === 'number' && isFinite(freeRight) ? freeRight : canvas.clientWidth;
      var inside = found.shown && found.sx >= margin && found.sx <= right - margin && found.sy >= insetTop + margin && found.sy <= bottom - margin;
      if (!inside) frameMarker(found, offsetY, offsetX, zoom);
    }

    function markerById(id) {
      if (!scene || disposed || lost || typeof id !== 'string') return null;
      for (var i = 0; i < markers.length; i++) if (markers[i].id === id) return markers[i];
      return null;
    }

    function frameMarker(found, offsetY, offsetX, zoomTo) {
      var cam = cameraState();
      // Where the point should land, measured from the middle of the whole view in half-heights (up) and half-widths (right). Without an offsetY it lands in the middle of the free space.
      var wantY = typeof offsetY === 'number' && isFinite(offsetY) ? Math.max(-0.8, Math.min(0.8, offsetY)) : shiftY();
      var wantX = typeof offsetX === 'number' && isFinite(offsetX) ? Math.max(-0.8, Math.min(0.8, offsetX)) : 0;
      var depth = homeDistance(cam.aspect) * zoomTo;
      var tanHalf = Math.tan(FOV / 2);
      // The target (which lands at shiftY) is moved so the point lands where it was asked to.
      var rise = (wantY - shiftY()) * tanHalf * depth;
      var slide = wantX * tanHalf * cam.aspect * depth;
      var up = cam.view.up;
      var right = cam.view.right;
      var to = {
        yaw: yaw,
        pitch: pitch,
        zoom: zoomTo,
        target: [found.p[0] - up[0] * rise - right[0] * slide, found.p[1] - up[1] * rise - right[1] * slide, found.p[2] - up[2] * rise - right[2] * slide]
      };
      spinYaw = 0;
      spinPitch = 0;
      if (options.reducedMotion) {
        zoom = to.zoom;
        target = to.target;
        anim = null;
        requestRender();
        return;
      }
      anim = { start: root.performance.now(), from: { yaw: yaw, pitch: pitch, zoom: zoom, target: target.slice() }, to: to, dyaw: 0 };
      requestRender();
    }

    function onContextLost(event) {
      event.preventDefault();
      lost = true;
      if (raf) { root.cancelAnimationFrame(raf); raf = 0; }
      if (options.onContextLost) options.onContextLost();
    }

    function onDoubleClick() { reset(); }
    function onContextMenu(event) { event.preventDefault(); }
    function onGesture(event) { event.preventDefault(); }
    function onResize() { requestRender(); }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);
    canvas.addEventListener('lostpointercapture', onPointerEnd);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('dblclick', onDoubleClick);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('gesturestart', onGesture);
    var observer = null;
    if (typeof root.ResizeObserver === 'function') {
      observer = new root.ResizeObserver(onResize);
      observer.observe(canvas);
    } else {
      root.addEventListener('resize', onResize);
    }

    return {
      load: function (buffer) {
        return Promise.resolve()
          .then(function () { return doLoad(buffer); })
          .catch(function (error) {
            if (error && error.code) throw error;
            if (root.console) root.console.error(error);
            throw fail('invalid', 'This model file could not be read.');
          });
      },
      reset: reset,
      resize: onResize,
      pick: pick,
      focus: focusMarker,
      reveal: revealMarker,
      setHotspots: function (list) {
        var next = [];
        if (Array.isArray(list)) {
          for (var i = 0; i < list.length && next.length < MAX_HOTSPOTS; i++) {
            var h = list[i];
            if (!h || typeof h.id !== 'string' || h.id.length === 0 || h.id.length > 64 || !Array.isArray(h.position) || h.position.length !== 3) continue;
            var x = h.position[0], y = h.position[1], z = h.position[2];
            if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') continue;
            if (!isFinite(x) || !isFinite(y) || !isFinite(z) || Math.abs(x) > COORD_LIMIT || Math.abs(y) > COORD_LIMIT || Math.abs(z) > COORD_LIMIT) continue;
            var number = typeof h.number === 'number' && h.number >= 1 && h.number <= MAX_HOTSPOTS ? Math.floor(h.number) : next.length + 1;
            next.push({ id: h.id, number: number, order: next.length, p: [x, y, z], sx: 0, sy: 0, w: 0, shown: false });
          }
        }
        // The markers grow in once, when the first ones appear; changing a list that already has markers does not replay it.
        if (markers.length === 0 && next.length > 0) revealStart = -1;
        markers = next;
        if (selectedId !== null && !next.some(function (m) { return m.id === selectedId; })) selectedId = null;
        requestRender();
      },
      /** How much of the view (CSS pixels from its top and bottom edges) the host covers with its own controls; the model is framed and centred in the space between. */
      setInsets: function (top, bottom) {
        var t = typeof top === 'number' && isFinite(top) ? Math.max(0, top) : 0;
        var b = typeof bottom === 'number' && isFinite(bottom) ? Math.max(0, bottom) : 0;
        if (t === insetTop && b === insetBottom) return;
        insetTop = t;
        insetBottom = b;
        fitKey = '';
        requestRender();
      },
      upAxis: function () { return upAxisName; },
      setSelected: function (id) {
        selectedId = typeof id === 'string' ? id : null;
        requestRender();
      },
      dispose: function () {
        if (disposed) return;
        disposed = true;
        if (raf) { root.cancelAnimationFrame(raf); raf = 0; }
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerEnd);
        canvas.removeEventListener('pointercancel', onPointerEnd);
        canvas.removeEventListener('lostpointercapture', onPointerEnd);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('keydown', onKeyDown);
        canvas.removeEventListener('dblclick', onDoubleClick);
        canvas.removeEventListener('contextmenu', onContextMenu);
        canvas.removeEventListener('webglcontextlost', onContextLost);
        canvas.removeEventListener('gesturestart', onGesture);
        if (observer) observer.disconnect();
        else root.removeEventListener('resize', onResize);
        if (!lost) {
          disposeScene();
          gl.deleteTexture(whiteTexture);
          if (atlasTexture) gl.deleteTexture(atlasTexture);
          if (markerBuffer) gl.deleteBuffer(markerBuffer);
          if (markerProgram) gl.deleteProgram(markerProgram);
          for (var ms = 0; ms < markerShaders.length; ms++) gl.deleteShader(markerShaders[ms]);
          if (stageBuffer) gl.deleteBuffer(stageBuffer);
          if (stageProgram) gl.deleteProgram(stageProgram);
          for (var ss = 0; ss < stageShaders.length; ss++) gl.deleteShader(stageShaders[ss]);
          gl.deleteProgram(program);
          gl.deleteShader(vertexShader);
          gl.deleteShader(fragmentShader);
          var loser = gl.getExtension('WEBGL_lose_context');
          if (loser) loser.loseContext();
        }
        scene = null;
      }
    };
  }

  root.GlbViewer = { version: VERSION, create: create };
})(typeof self !== 'undefined' ? self : this);
`;
