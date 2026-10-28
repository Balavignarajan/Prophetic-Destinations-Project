import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Image, Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { AppText } from '@/components/ui';
import { buildViewerHtml } from '@/learning/glb-viewer-html';
import { DiscoveryPanel, HotspotListPanel, PanelDock, type PanelBox, type PanelHotspot } from '@/learning/model-3d-panels';
import { ErrorCard, HintPill, LoadingCard, Pill, RiseIn, RoundButton } from '@/learning/model-3d-ui';
import { useTheme, withAlpha } from '@/theme';

/**
 * The full-screen 3D viewer of an Interactive 3D Model block: the REAL uploaded GLB, drawn by the shared viewer engine inside a WebView (glb-viewer-html.ts), in a modal over the lesson.
 *
 * WHY A FULL-SCREEN MODAL. Rotating and pinching need the whole gesture to themselves. Inside the lesson's scroll view the two would fight (a vertical drag would scroll the lesson); in a modal
 * the lesson is not under the finger at all, the lesson's scroll position is not touched, and closing puts the learner exactly where they were. The modal is mounted ONLY while the viewer is
 * open and is removed the moment it is closed (no exit animation of our own, nothing to wait for), so no layer, WebView or WebGL context can outlive it and nothing can be left over the
 * lesson that catches touches. Android Back steps back one level (the explanation, then the list it came from, then the viewer itself).
 *
 * LAYOUT. The model is the hero: the WebView fills the whole screen and draws its own backdrop (a soft light on a deep stage, from the theme). Over it float, and only they take touches
 * (every wrapper passes touches through): a light header (back, "3D EXPLORATION" and the title, Reset), at the bottom a Hotspots pill and a help button (the Hotspots pill only for a model that
 * has hotspots), the first-use hint, and the open panel. The model is framed in the space the header and the bottom controls leave (the engine is told their sizes), so it starts centred and
 * large, not tiny in an empty canvas, and nothing covers it at rest. Every control is a native button outside the WebView, so all of them work without any gesture.
 *
 * HOTSPOTS. The block's hotspots (already the learner's level's: the server leaves out the others, the app filters nothing) are drawn by the engine as numbered gold medallions attached to the
 * model, so they follow every rotation, zoom and pan. Choosing one, by tapping its marker or from the list ("Explore the Model"), opens its discovery panel (model-3d-panels.tsx): the title, the
 * author's text and its Scripture, with Previous, Next and "Focus on point". In portrait the panel is a sheet along the bottom; in landscape a drawer on the right. If the chosen point would be
 * hidden under the panel the camera glides it into the free part (and does nothing when it is already there: choosing never moves the camera by itself otherwise); "Focus on point" always frames
 * it and comes closer. Only the camera moves, never the hotspot, and Reset view returns. The chosen hotspot is held by id, and a stale id selects nothing.
 *
 * BRIDGE. The page tells the app what the learner did ({ t: 'hotspot', id } and so on); the app tells the page what to draw and where through a few fixed commands (set the markers, the chosen
 * one, the insets, focus, reveal, reset). The app checks every id the page reports against the hotspots it knows. Nothing from the lesson is ever run as code, and commands never trigger
 * messages, so there is no loop.
 *
 * LIFECYCLE. The owner (model-3d-block.tsx) closes it when the lesson loses focus or the app goes to the background, and unmounting the owner removes it too. A new attempt (Retry) builds a new
 * WebView (`key`), never reuses a broken one, and a failed attempt unmounts its WebView at once. The WebView reports progress, readiness and failures as messages; if it reports nothing for too
 * long, the app itself gives up (`LOAD_LIMIT_MS`) and shows the error with Close (and Try again where it can help), so there is never an endless spinner. The poster, when there is one, stays
 * visible behind the status until the model is shown.
 *
 * LIMITS. A model with more than MAX_TRIANGLES triangles is refused on this device with a plain message (the engine's ceiling is 3,000,000; a phone is asked for no more than 2,000,000).
 *
 * OFFLINE. The model is online-only: it is requested from the learner media route when the viewer opens, and never saved with the lesson. Offline (or a failed download) is reported plainly.
 */
type Phase = 'loading' | 'ready' | 'error';

/** A hotspot of the block as the viewer needs it: its text and Scripture, and its point on the model (model space), or null when it has none. */
export type Model3DHotspot = PanelHotspot;

/** The longest the app waits for the model to become visible before it reports a timeout. */
const LOAD_LIMIT_MS = 90000;
/** How long the hint stays over the model if the learner does not touch it. */
const HINT_MS = 5000;
/** The most triangles a phone is asked to hold. */
const MAX_TRIANGLES = 2000000;

/** Whether the first-use hint has been shown during this session; it is not shown again by itself (the help button shows it on request). */
let hintSeen = false;

type Rgb = [number, number, number];

/** What the learner is told when the model cannot be shown: a short title and a plain sentence; `retry` says whether trying again can help. Never a code or a stack. */
const FAILURES: Record<string, { title: string; message: string; retry: boolean }> = {
  network: { title: 'Connection problem', message: 'The 3D model could not be downloaded. Check your internet connection and try again.', retry: true },
  timeout: { title: 'Taking too long', message: 'The 3D model is taking too long to load. Check your connection and try again.', retry: true },
  server: { title: 'Could not load the model', message: 'The 3D model could not be loaded right now. Please try again in a moment.', retry: true },
  'context-lost': { title: '3D view interrupted', message: 'The 3D view was interrupted. Please try again.', retry: true },
  process: { title: '3D view interrupted', message: 'The 3D view was interrupted. Please try again.', retry: true },
  script: { title: 'The viewer could not start', message: 'The 3D viewer could not start. Please try again.', retry: true },
  missing: { title: 'Model unavailable', message: 'This 3D model is not available. It may have been removed or changed.', retry: false },
  invalid: { title: 'Model could not be read', message: 'This 3D model file could not be read.', retry: false },
  unsupported: { title: 'Model not supported', message: 'This 3D model uses a feature the viewer cannot show yet.', retry: false },
  empty: { title: 'Nothing to show', message: 'This 3D model has nothing to show.', retry: false },
  'too-large': { title: 'Model too detailed', message: 'This 3D model is too detailed to show on this device.', retry: false },
  memory: { title: 'Model too large', message: 'This 3D model is too large for this device.', retry: false },
  webgl: { title: '3D not available', message: '3D graphics are not available on this device.', retry: false },
};

/** The page's origin (scheme, host and port) from an http(s) address, or an empty string. */
function originOf(url: string): string {
  const scheme = url.indexOf('://');
  if (scheme < 0) return '';
  const end = url.indexOf('/', scheme + 3);
  return end < 0 ? url : url.slice(0, end);
}

/** A theme colour as [red, green, blue] from 0 to 1 for the engine; anything that is not a plain 6-digit colour value gets the stand-in. */
function toFloats(color: string, standIn: Rgb): Rgb {
  if (color.length === 7 && color.charAt(0) === '#') {
    const red = parseInt(color.slice(1, 3), 16);
    const green = parseInt(color.slice(3, 5), 16);
    const blue = parseInt(color.slice(5, 7), 16);
    if (!Number.isNaN(red) && !Number.isNaN(green) && !Number.isNaN(blue)) return [red / 255, green / 255, blue / 255];
  }
  return standIn;
}

/** `a` moved `t` (0 to 1) of the way to `b`. */
function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function Model3DViewer({
  title,
  modelUrl,
  posterUri,
  hotspots,
  onClose,
}: {
  title: string;
  modelUrl: string;
  posterUri: string | null;
  hotspots: readonly Model3DHotspot[];
  onClose: () => void;
}) {
  const { colors, spacing, layout, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const [phase, setPhase] = useState<Phase>('loading');
  const [step, setStep] = useState<'download' | 'prepare'>('download');
  const [progress, setProgress] = useState<number | null>(null);
  const [errorCode, setErrorCode] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [booted, setBooted] = useState(false);
  const [hint, setHint] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The hotspot chosen last (it stays marked in the list), and whether the open explanation was reached from the list (Back then returns to it).
  const [lastId, setLastId] = useState<string | null>(null);
  const [fromList, setFromList] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  // The size of the whole view, of the header, and of the panel that is open (all in points, measured).
  const [view, setView] = useState({ width: 0, height: 0 });
  const [headerHeight, setHeaderHeight] = useState(0);
  const [box, setBox] = useState<PanelBox>({ width: 0, height: 0 });
  const webView = useRef<WebView>(null);

  const origin = useMemo(() => originOf(modelUrl), [modelUrl]);
  // The page is built ONCE, when the viewer opens. A change of theme or of the Reduce Motion setting while it is open must not replace the page: that would reload the WebView and download the
  // model again. It takes effect the next time the viewer opens.
  const [html] = useState(() => {
    const edge = toFloats(colors.background, [0.03, 0.04, 0.06]);
    const raised = toFloats(colors.surfaceElevated, [0.1, 0.13, 0.2]);
    const gold = toFloats(colors.primary, [0.83, 0.69, 0.22]);
    return buildViewerHtml({
      url: modelUrl,
      origin,
      background: colors.background,
      reducedMotion: reduce,
      maxTriangles: MAX_TRIANGLES,
      // The stage: a deep backdrop with a soft light behind the middle, the faintest warmth of gold in it.
      stage: { center: mixRgb(raised, gold, 0.06), edge },
      markers: {
        fill: toFloats(colors.primary, [0.83, 0.69, 0.22]),
        ring: toFloats(colors.onPrimary, [0.03, 0.04, 0.06]),
        ink: toFloats(colors.onPrimary, [0.03, 0.04, 0.06]),
        // The chosen marker is the brighter gold. In the light theme the highlight token is a DARK gold (it is meant for text), which would make the dark numeral hard to read, so it is the
        // theme's gold lightened instead.
        selectedFill: isDark ? toFloats(colors.primaryHighlight, [0.94, 0.82, 0.4]) : mixRgb(gold, [1, 0.95, 0.75], 0.45),
        selectedRing: toFloats(colors.textOnImage, [0.95, 0.93, 0.86]),
      },
    });
  });

  // The chosen hotspot, by id: an id that is not in the list (changed meanwhile) selects nothing, so a stale selection can never show an explanation.
  const selectedIndex = selectedId === null ? -1 : hotspots.findIndex((h) => h.id === selectedId);
  const selected = selectedIndex >= 0 ? hotspots[selectedIndex] : null;
  const hasHotspots = hotspots.length > 0;
  const ready = phase === 'ready';
  const panelOpen = ready && (selected !== null || (listOpen && hasHotspots));

  // What the page draws: the hotspots that have a point on the model, numbered by their place in the list.
  const markersJson = useMemo(
    () => JSON.stringify(hotspots.flatMap((h, index) => (h.position ? [{ id: h.id, position: h.position, number: index + 1 }] : []))),
    [hotspots],
  );

  const fail = useCallback((code: string) => {
    setErrorCode(code);
    setPhase('error');
  }, []);

  const retry = useCallback(() => {
    setErrorCode('');
    setProgress(null);
    setStep('download');
    setBooted(false);
    setPhase('loading');
    setAttempt((count) => count + 1);
  }, []);

  const run = useCallback((script: string) => {
    webView.current?.injectJavaScript(`${script} true;`);
  }, []);

  // Never wait for ever: if the model has not appeared (or failed by itself) in time, say so.
  useEffect(() => {
    if (phase !== 'loading') return;
    const timer = setTimeout(() => fail('timeout'), LOAD_LIMIT_MS);
    return () => clearTimeout(timer);
  }, [phase, attempt, fail]);

  // The first-use hint: once the model is shown, for a few seconds, unless the learner touches the model first. The help button shows it again on request.
  useEffect(() => {
    if (phase !== 'ready' || hintSeen) return;
    hintSeen = true;
    setHint(true);
  }, [phase]);
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(false), HINT_MS);
    return () => clearTimeout(timer);
  }, [hint]);

  // Tell a screen reader the model is there (a visual loading state has no sound of its own).
  useEffect(() => {
    if (phase === 'ready') void AccessibilityInfo.announceForAccessibility(hasHotspots ? 'The 3D model is ready. Use Hotspots to read about each point.' : 'The 3D model is ready.');
  }, [phase, hasHotspots]);

  // The markers and the highlight follow the data. The argument is a JSON TEXT (a quoted string), which the page parses and the engine validates.
  useEffect(() => {
    if (phase === 'ready') run(`window.__setHotspots && window.__setHotspots(${JSON.stringify(markersJson)});`);
  }, [phase, markersJson, run]);
  useEffect(() => {
    if (phase === 'ready') run(`window.__setSelected && window.__setSelected(${JSON.stringify(selected ? selected.id : null)});`);
  }, [phase, selected, markersJson, run]);

  // How much of the view the app's own controls cover at the top and the bottom: the engine frames and centres the model in the space between. In landscape the bottom pill sits in a corner
  // (the model is centred and does not reach it), so only the safe area is kept clear there.
  const landscape = view.width > view.height;
  const topInset = Math.round(headerHeight);
  const footerZone = layout.minTouchTarget + spacing.md * 2;
  const bottomInset = Math.round(insets.bottom + (landscape ? spacing.md : footerZone));
  useEffect(() => {
    if (!booted || topInset <= 0) return;
    run(`window.__setInsets && window.__setInsets(${topInset}, ${bottomInset});`);
  }, [booted, topInset, bottomInset, run]);

  // Where a chosen point should be put, given the panel that covers part of the view: in portrait above the sheet, in landscape left of the drawer (measured, so it holds on any screen).
  const region = useMemo(() => {
    if (view.width <= 0 || view.height <= 0 || box.height <= 0) return null;
    if (landscape) return { offsetY: null, offsetX: -(box.width / view.width), freeBottom: null, freeRight: Math.round(view.width - box.width) };
    return { offsetY: (box.height - topInset) / view.height, offsetX: 0, freeBottom: Math.round(view.height - box.height), freeRight: null };
  }, [view.width, view.height, box.width, box.height, landscape, topInset]);

  const selectedHasPoint = Boolean(selected && selected.position);
  // A chosen point that the panel would hide is brought into the free part of the view (the camera glides; nothing moves when it is already there).
  useEffect(() => {
    if (!ready || selectedId === null || !selectedHasPoint || region === null) return;
    run(
      `window.__revealHotspot && window.__revealHotspot(${JSON.stringify(selectedId)}, ${JSON.stringify(region.offsetY)}, ${JSON.stringify(region.offsetX)}, ${JSON.stringify(region.freeBottom)}, ${JSON.stringify(region.freeRight)});`,
    );
  }, [ready, selectedId, selectedHasPoint, region, run]);

  const onBox = useCallback((next: PanelBox) => {
    setBox((current) => (current.width === next.width && current.height === next.height ? current : next));
  }, []);

  /** Chooses a hotspot, from a marker (`fromTheList` false) or from the list (true). */
  const choose = useCallback((id: string, fromTheList: boolean) => {
    setSelectedId(id);
    setLastId(id);
    setFromList(fromTheList);
    setListOpen(false);
  }, []);
  /** Closes the explanation; if it was reached from the list, the list comes back. */
  const clearSelection = useCallback(() => {
    setSelectedId(null);
    if (fromList) setListOpen(true);
    setFromList(false);
  }, [fromList]);
  const goToIndex = useCallback(
    (index: number) => {
      const target = hotspots[index];
      if (target) {
        setSelectedId(target.id);
        setLastId(target.id);
      }
    },
    [hotspots],
  );
  const openList = useCallback(() => {
    setSelectedId(null);
    setFromList(false);
    setListOpen(true);
  }, []);
  const focusSelected = useCallback(() => {
    if (!selected || !selected.position) return;
    // The point is put in the middle of the part of the view the panel does not cover, and the camera comes closer.
    run(`window.__focusHotspot && window.__focusHotspot(${JSON.stringify(selected.id)}, ${JSON.stringify(region ? region.offsetY : null)}, ${JSON.stringify(region ? region.offsetX : null)});`);
  }, [selected, region, run]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let data: unknown;
      try {
        data = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (typeof data !== 'object' || data === null) return;
      const message = data as { t?: unknown; phase?: unknown; progress?: unknown; code?: unknown; id?: unknown };
      if (message.t === 'boot') {
        setBooted(true);
      } else if (message.t === 'status') {
        setStep(message.phase === 'prepare' ? 'prepare' : 'download');
        setProgress(typeof message.progress === 'number' && message.progress >= 0 ? Math.min(1, message.progress) : null);
      } else if (message.t === 'ready') {
        setPhase((current) => (current === 'error' ? current : 'ready'));
      } else if (message.t === 'error') {
        fail(typeof message.code === 'string' ? message.code : 'script');
      } else if (message.t === 'interact') {
        hintSeen = true;
        setHint(false);
      } else if (message.t === 'hotspot') {
        // Only a hotspot this block really has can be chosen from the page.
        const id = message.id;
        if (typeof id === 'string' && hotspots.some((h) => h.id === id)) choose(id, false);
      }
    },
    [fail, choose, hotspots],
  );

  const resetView = useCallback(() => {
    run('window.__glb && window.__glb.reset();');
  }, [run]);

  /** Back steps back one level: the explanation, then the list, then the viewer. */
  const onBack = selected ? clearSelection : listOpen ? () => setListOpen(false) : onClose;

  const failure = FAILURES[errorCode] ?? FAILURES.script;
  const percent = progress === null || step === 'prepare' ? null : Math.round(progress * 100);
  const statusText = step === 'prepare' ? 'Preparing the 3D view…' : percent === null ? 'Downloading the 3D model…' : `Downloading the 3D model… ${percent}%`;
  const hintText = hasHotspots ? 'Drag to rotate · Pinch to zoom · Tap a number' : 'Drag to rotate · Pinch to zoom';
  const dockWidth = Math.min(440, Math.round(view.width * 0.46));
  // A sheet never takes more than about three fifths of the view (a little less on a short phone), so some of the model is always left above it.
  const maxPanelHeight = view.height > 0 ? Math.round(view.height * (view.height < 700 ? 0.56 : 0.62)) : 360;

  return (
    <Modal visible animationType={reduce ? 'none' : 'fade'} onRequestClose={onBack} statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>
      <View
        accessibilityViewIsModal
        style={{ flex: 1, backgroundColor: colors.background }}
        onLayout={(event) => setView({ width: Math.round(event.nativeEvent.layout.width), height: Math.round(event.nativeEvent.layout.height) })}>
        {/* The stage: the model fills the whole screen. A failed attempt releases its WebView (and its WebGL context) at once; Try again builds a new one. */}
        {phase !== 'error' ? (
          <WebView
            key={attempt}
            ref={webView}
            source={{ html, baseUrl: origin }}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled={false}
            scrollEnabled={false}
            bounces={false}
            overScrollMode="never"
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            setSupportMultipleWindows={false}
            javaScriptCanOpenWindowsAutomatically={false}
            allowFileAccess={false}
            allowsLinkPreview={false}
            thirdPartyCookiesEnabled={false}
            androidLayerType="hardware"
            setBuiltInZoomControls={false}
            setDisplayZoomControls={false}
            textZoom={100}
            onMessage={onMessage}
            onError={() => fail('script')}
            onRenderProcessGone={() => fail('process')}
            onContentProcessDidTerminate={() => fail('process')}
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
          />
        ) : null}

        {/* The poster stays behind the status until the model is there. */}
        {phase !== 'ready' && posterUri ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: topInset, bottom: bottomInset, left: 0, right: 0, opacity: 0.4 }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants">
            <Image source={{ uri: posterUri }} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
          </View>
        ) : null}

        {phase === 'loading' ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: spacing.xl }]}>
            <LoadingCard status={statusText} percent={percent} />
          </View>
        ) : null}

        {phase === 'error' ? (
          <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: spacing.xl }]}>
            <ErrorCard title={failure.title} message={failure.message} canRetry={failure.retry} onRetry={retry} onClose={onClose} />
          </View>
        ) : null}

        {/* The header floats over the stage on a soft fade of its colour; only its buttons take touches, so the model can be turned from under it. */}
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0 }} onLayout={(event) => setHeaderHeight(Math.round(event.nativeEvent.layout.height))}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <LinearGradient colors={[withAlpha(colors.background, 0.92), withAlpha(colors.background, 0)]} style={StyleSheet.absoluteFill} />
          </View>
          <RiseIn from="top">
            <View
              pointerEvents="box-none"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingTop: insets.top + spacing.sm,
                paddingBottom: spacing.md,
                paddingLeft: insets.left + spacing.md,
                paddingRight: insets.right + spacing.md,
              }}>
              <RoundButton glyph="left" label="Close the 3D viewer" hint="Returns to the lesson" onPress={onClose} />
              <View pointerEvents="none" style={{ flex: 1 }}>
                <AppText variant="caption" color="primaryHighlight" style={{ fontWeight: '700', letterSpacing: 1.6 }}>
                  3D EXPLORATION
                </AppText>
                {title ? (
                  <AppText variant="heading" numberOfLines={2} accessibilityRole="header" style={{ fontSize: 18, lineHeight: 26 }}>
                    {title}
                  </AppText>
                ) : null}
              </View>
              <Pill label="Reset" accessibilityLabel="Reset view" hint="Returns the model to its starting view" onPress={resetView} disabled={!ready} />
            </View>
          </RiseIn>
        </View>

        {/* Shown once per session, briefly (and when asked for), and never blocks the model. */}
        {hint && ready && !panelOpen ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: bottomInset, alignItems: 'center', paddingHorizontal: spacing.xl }}>
            <HintPill text={hintText} />
          </View>
        ) : null}

        {/* The discovery controls: the Hotspots pill (only for a model that has hotspots) and the help button. They give way to a panel while one is open. */}
        {ready && !panelOpen ? (
          <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + spacing.md }}>
            <RiseIn from="bottom">
              <View
                pointerEvents="box-none"
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: insets.left + spacing.lg, paddingRight: insets.right + spacing.lg }}>
                {hasHotspots ? (
                  <Pill
                    label="Hotspots"
                    accessibilityLabel={`Hotspots, ${hotspots.length}`}
                    hint="Shows every hotspot of this model as a list"
                    onPress={openList}
                    leading={
                      <View
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                        style={{ minWidth: 24, height: 24, paddingHorizontal: spacing.xs + 2, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                        <AppText variant="caption" color="onPrimary" style={{ fontWeight: '700' }} allowFontScaling={false}>
                          {hotspots.length}
                        </AppText>
                      </View>
                    }
                  />
                ) : (
                  <View />
                )}
                <RoundButton glyph="help" label="How to move the model" hint="Shows how to rotate and zoom" onPress={() => setHint(true)} />
              </View>
            </RiseIn>
          </View>
        ) : null}

        {/* The discovery panel of the chosen hotspot. It covers only its own card; everything else in the view is still the model. */}
        {ready && selected ? (
          <PanelDock landscape={landscape} dockWidth={dockWidth} headerHeight={headerHeight} maxHeight={maxPanelHeight} onBox={onBox}>
            <DiscoveryPanel
              hotspot={selected}
              index={selectedIndex}
              total={hotspots.length}
              onClose={clearSelection}
              onPrevious={() => goToIndex(selectedIndex - 1)}
              onNext={() => goToIndex(selectedIndex + 1)}
              onFocus={focusSelected}
            />
          </PanelDock>
        ) : null}

        {/* "Explore the Model": every hotspot, in order, as large rows, so none needs a tap on a small marker. */}
        {ready && !selected && listOpen && hasHotspots ? (
          <PanelDock landscape={landscape} dockWidth={dockWidth} headerHeight={headerHeight} maxHeight={maxPanelHeight} onBox={onBox}>
            <HotspotListPanel hotspots={hotspots} currentId={lastId} onChoose={(id) => choose(id, true)} onClose={() => setListOpen(false)} />
          </PanelDock>
        ) : null}
      </View>
    </Modal>
  );
}
