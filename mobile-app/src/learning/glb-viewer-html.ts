import { GLB_VIEWER_ENGINE } from '@/learning/glb-viewer-engine';

/**
 * The page the 3D viewer runs in (inside a WebView): one canvas, the GLB viewer engine (embedded, nothing is loaded from the internet) and a short script that downloads the model
 * and drives the engine. The page is built here as a string and handed to the WebView as `html` with the API's origin as its `baseUrl`, so the download of the model is a request to
 * the page's OWN origin (no cross-origin access is needed). The page's Content-Security-Policy allows only its own inline code, `blob:` / `data:` images (the model's textures) and
 * connections to that one origin, so it can load nothing else and the model's data is never run as code.
 *
 * MESSAGES to the app (JSON text through `ReactNativeWebView.postMessage`):
 *   { t: 'boot' } (the page's commands exist: the app sends what it knows, such as the insets, now)
 *   { t: 'status', phase: 'download' | 'prepare', progress: 0..1 or -1 when unknown }   { t: 'ready' }   { t: 'interact' } (the learner touched the model for the first time)
 *   { t: 'hotspot', id } (a tap landed on a numbered marker: the app checks the id against the hotspots it knows before it does anything)
 *   { t: 'error', code }  with code one of: missing, server, network, timeout, invalid, unsupported, empty, too-large, memory, webgl, context-lost, script
 * COMMANDS from the app (run through `injectJavaScript`, each a fixed call with plain numbers, ids or JSON text that the page parses and the engine validates; nothing from the lesson is ever run as code):
 *   `window.__glb.reset()`   `window.__setInsets(top, bottom)` (how much of the view, in CSS pixels, the app covers with its own controls: the model is framed in the space between)
 *   `window.__focusHotspot(id, offsetY, offsetX)` (frames a hotspot and comes closer; never moves it)   `window.__revealHotspot(id, offsetY, offsetX, freeBottom, freeRight)` (brings a hotspot out from under a
 *   panel only if it is hidden, without changing the distance)   `window.__setHotspots(jsonText)` (the markers: [{ id, position: [x,y,z], number }], model-space points)   `window.__setSelected(id or null)`.
 * Commands never send messages back, so the two directions cannot loop: the page only reports what the learner did.
 *
 * The download has a stall timer: if nothing arrives for 25 seconds the request is aborted and reported as 'timeout', so the app never waits on a spinner forever.
 */
const BACKSLASH = String.fromCharCode(92);

/** JSON that is safe inside a script element: a "<" never appears in it, so nothing in it can end the script. */
const safeJson = (value: unknown): string => JSON.stringify(value).split('<').join(BACKSLASH + 'u003c');

/** A CSS colour from the theme, or null if it is not a plain colour value (only letters, digits, "#", "(", ")", ",", "." and "%" are accepted). */
function plainColor(value: string): string | null {
  return /^[#a-zA-Z0-9(),.% ]+$/.test(value) ? value : null;
}

const BOOT = `
(function () {
  var cfg = window.__CFG;
  var ready = false;
  var failed = false;
  function post(message) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(message)); } catch (ignored) { /* nothing to tell */ }
  }
  function fail(code) {
    if (failed) return;
    failed = true;
    post({ t: 'error', code: code });
  }
  window.onerror = function (message) {
    if (String(message).indexOf('ResizeObserver') >= 0) return;
    if (!ready) fail('script');
  };
  function colorToArray(value) {
    if (typeof value === 'string' && value.charAt(0) === '#' && value.length === 7) {
      return [parseInt(value.slice(1, 3), 16) / 255, parseInt(value.slice(3, 5), 16) / 255, parseInt(value.slice(5, 7), 16) / 255];
    }
    return [0.05, 0.06, 0.1];
  }
  function joinChunks(chunks, size) {
    var out = new Uint8Array(size);
    var at = 0;
    for (var i = 0; i < chunks.length; i++) { out.set(chunks[i], at); at += chunks[i].length; }
    return out.buffer;
  }
  var canvas = document.getElementById('c');
  var viewer;
  // The engine is the script just before this one: if it did not run (a script error), say so rather than blaming the graphics.
  if (!window.GlbViewer) { fail('script'); return; }
  try {
    viewer = window.GlbViewer.create(canvas, {
      background: colorToArray(cfg.background),
      reducedMotion: Boolean(cfg.reducedMotion),
      markerStyle: cfg.markers,
      stage: cfg.stage,
      maxTriangles: cfg.maxTriangles,
      onTap: function (tap) { if (tap && typeof tap.hotspotId === 'string') post({ t: 'hotspot', id: tap.hotspotId }); },
      onFirstInteraction: function () { post({ t: 'interact' }); },
      onContextLost: function () { fail('context-lost'); }
    });
  } catch (error) {
    fail(error && error.code ? error.code : 'webgl');
    return;
  }
  window.__glb = viewer;
  window.__setHotspots = function (text) {
    var list = [];
    try { list = JSON.parse(text); } catch (ignored) { list = []; }
    viewer.setHotspots(Array.isArray(list) ? list : []);
  };
  window.__setSelected = function (id) {
    viewer.setSelected(typeof id === 'string' ? id : null);
  };
  window.__focusHotspot = function (id, offsetY, offsetX) {
    if (typeof id === 'string') viewer.focus(id, typeof offsetY === 'number' ? offsetY : undefined, typeof offsetX === 'number' ? offsetX : undefined);
  };
  window.__revealHotspot = function (id, offsetY, offsetX, freeBottom, freeRight) {
    if (typeof id === 'string') viewer.reveal(id, typeof offsetY === 'number' ? offsetY : undefined, typeof offsetX === 'number' ? offsetX : undefined, typeof freeBottom === 'number' ? freeBottom : undefined, typeof freeRight === 'number' ? freeRight : undefined);
  };
  window.__setInsets = function (top, bottom) {
    viewer.setInsets(typeof top === 'number' ? top : 0, typeof bottom === 'number' ? bottom : 0);
  };
  document.addEventListener('gesturestart', function (event) { event.preventDefault(); });
  post({ t: 'boot' });

  var controller = new AbortController();
  var timer = 0;
  var timedOut = false;
  function arm() {
    clearTimeout(timer);
    timer = setTimeout(function () { timedOut = true; controller.abort(); }, 25000);
  }
  arm();
  post({ t: 'status', phase: 'download', progress: -1 });
  fetch(cfg.url, { signal: controller.signal, credentials: 'omit' })
    .then(function (response) {
      if (!response.ok) {
        var problem = new Error('http');
        problem.code = response.status === 404 || response.status === 403 || response.status === 410 ? 'missing' : 'server';
        throw problem;
      }
      var total = parseInt(response.headers.get('content-length') || '0', 10) || 0;
      if (!response.body || !response.body.getReader) return response.arrayBuffer();
      var reader = response.body.getReader();
      var chunks = [];
      var received = 0;
      var lastPercent = -2;
      function pump() {
        return reader.read().then(function (step) {
          if (step.done) return joinChunks(chunks, received);
          chunks.push(step.value);
          received += step.value.length;
          arm();
          var percent = total > 0 ? Math.min(99, Math.floor((received / total) * 100)) : -1;
          if (percent !== lastPercent) {
            lastPercent = percent;
            post({ t: 'status', phase: 'download', progress: percent < 0 ? -1 : percent / 100 });
          }
          return pump();
        });
      }
      return pump();
    })
    .then(function (buffer) {
      clearTimeout(timer);
      post({ t: 'status', phase: 'prepare', progress: -1 });
      return viewer.load(buffer);
    })
    .then(function () {
      ready = true;
      post({ t: 'ready' });
    })
    .catch(function (error) {
      clearTimeout(timer);
      if (timedOut) { fail('timeout'); return; }
      fail(error && error.code ? error.code : 'network');
    });
})();
`;

export type ViewerPage = {
  /** The learner media route of the model. */
  url: string;
  /** Its origin; the page may connect to this and nothing else. */
  origin: string;
  /** The page and canvas background (a colour from the theme). */
  background: string;
  reducedMotion: boolean;
  /** The hotspot markers' colours from the theme, as [red, green, blue] from 0 to 1. */
  markers: { fill: number[]; ring: number[]; ink: number[]; selectedFill: number[]; selectedRing: number[] };
  /** The backdrop behind the model, as [red, green, blue] from 0 to 1: a soft light of `center` in the middle fading to `edge`. */
  stage: { center: number[]; edge: number[] };
  /** The most triangles this device is asked to hold (a model with more is refused with the error code too-large). */
  maxTriangles: number;
};

/** The complete HTML document of the viewer for this model. */
export function buildViewerHtml(page: ViewerPage): string {
  const background = plainColor(page.background);
  const cssBackground = background ?? 'transparent';
  const csp = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob: data:; connect-src ${page.origin}`;
  const config = safeJson({ url: page.url, background: page.background, reducedMotion: page.reducedMotion, markers: page.markers, stage: page.stage, maxTriangles: page.maxTriangles });
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    `<style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:${cssBackground};-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}canvas{display:block;width:100%;height:100%;touch-action:none;outline:none}</style>`,
    '</head><body><canvas id="c"></canvas>',
    `<script>window.__CFG=${config};</script>`,
    `<script>${GLB_VIEWER_ENGINE}</script>`,
    `<script>${BOOT}</script>`,
    '</body></html>',
  ].join(String.fromCharCode(10));
}
