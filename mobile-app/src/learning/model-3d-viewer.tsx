import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { AppText } from '@/components/ui';
import { buildViewerHtml } from '@/learning/glb-viewer-html';
import { type ExplanationHotspot, HotspotContent, HotspotNavigator, HotspotTopBar, PanelButton } from '@/learning/hotspot-explanation';
import { useTheme } from '@/theme';
import { NATIVE_DRIVER, motion } from '@/theme/motion';

/**
 * The full-screen 3D viewer of an Interactive 3D Model block: the REAL uploaded GLB, drawn by the shared viewer engine inside a WebView (glb-viewer-html.ts), in a modal over the lesson.
 *
 * WHY A FULL-SCREEN MODAL. Rotating and pinching need the whole gesture to themselves. Inside the lesson's scroll view the two would fight (a vertical drag would scroll the lesson); in a modal
 * the lesson is not under the finger at all, the lesson's scroll position is not touched, and closing puts the learner exactly where they were. The modal is mounted ONLY while the viewer is
 * open and is removed the moment it is closed (no exit animation of our own, nothing to wait for), so no layer, WebView or WebGL context can outlive it and nothing can be left over the
 * lesson that catches touches. Android Back steps back one level (the explanation, then the list it came from, then the viewer itself). The back button, Reset view and Hotspots buttons are
 * ordinary native buttons outside the WebView, so they work without any gesture.
 *
 * LAYOUT. A header (back, the model's title, Reset view), the model filling the rest, and, only when the model has hotspots, a footer with the Hotspots button. Nothing sits on the model but
 * the markers, a short first-use hint and, while one is chosen, the hotspot's panel.
 *
 * HOTSPOTS. The block's hotspots (already the learner's level's: the server leaves out the others, the app filters nothing) are drawn by the engine as numbered markers attached to the model, so
 * they follow every rotation, zoom and pan. Choosing one, by tapping its marker or from the LIST, opens its explanation in a panel over the lower part of the view: the title, the author's
 * text and its Scripture cards (the same components the interactive-image sheet uses; they know nothing of 2D coordinates), with the numbers, Previous and Next, and an optional "Focus on this
 * point" that frames it (the camera only; the hotspot is never moved). The panel is an ordinary view inside this modal (no second modal, no gesture handler, no exit animation): it fades in when
 * it appears, is removed at once when it closes, leaves the rest of the view to the WebView (so the model can still be turned and pinched with the panel open) and cannot linger. On a short view
 * (a phone held sideways) it takes the whole height so it stays readable, and closes the same way. The list is the accessible way to reach every hotspot without hitting a small marker; it marks
 * the one chosen last. Choosing a hotspot never moves the camera by itself; only Focus and Reset view do. The chosen hotspot is held by id, and a stale id selects nothing.
 *
 * BRIDGE. The page tells the app what the learner did ({ t: 'hotspot', id } and so on); the app tells the page what to draw through a few fixed commands (set the markers, set the chosen one,
 * focus, reset). The app checks every id the page reports against the hotspots it knows. Nothing from the lesson is ever run as code, and commands never trigger messages, so there is no loop.
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
export type Model3DHotspot = ExplanationHotspot & { position: [number, number, number] | null };

/** The longest the app waits for the model to become visible before it reports a timeout. */
const LOAD_LIMIT_MS = 90000;
/** How long the first-use hint stays over the model if the learner does not touch it. */
const HINT_MS = 5000;
/** The most triangles a phone is asked to hold. */
const MAX_TRIANGLES = 2000000;
/** Below this height (in points) the view is "short" (a phone held sideways) and the hotspot panel may take all of it. */
const SHORT_VIEW = 380;
const NOUN = 'Hotspot';

/** Whether the first-use hint has been shown (or dismissed by touching the model) during this session; it is not shown again. */
let hintSeen = false;

const FAILURES: Record<string, { message: string; retry: boolean }> = {
  network: { message: 'The 3D model could not be downloaded. Check your internet connection and try again.', retry: true },
  timeout: { message: 'The 3D model is taking too long to load. Check your connection and try again.', retry: true },
  server: { message: 'The 3D model could not be loaded right now. Please try again in a moment.', retry: true },
  'context-lost': { message: 'The 3D view was interrupted. Please try again.', retry: true },
  process: { message: 'The 3D view was interrupted. Please try again.', retry: true },
  script: { message: 'The 3D viewer could not start. Please try again.', retry: true },
  missing: { message: 'This 3D model is not available. It may have been removed or changed.', retry: false },
  invalid: { message: 'This 3D model file could not be read.', retry: false },
  unsupported: { message: 'This 3D model uses a feature the viewer cannot show yet.', retry: false },
  empty: { message: 'This 3D model has nothing to show.', retry: false },
  'too-large': { message: 'This 3D model is too detailed to show on this device.', retry: false },
  memory: { message: 'This 3D model is too large for this device.', retry: false },
  webgl: { message: '3D graphics are not available on this device.', retry: false },
};

/** The page's origin (scheme, host and port) from an http(s) address, or an empty string. */
function originOf(url: string): string {
  const scheme = url.indexOf('://');
  if (scheme < 0) return '';
  const end = url.indexOf('/', scheme + 3);
  return end < 0 ? url : url.slice(0, end);
}

/** A theme colour as [red, green, blue] from 0 to 1 for the engine; anything that is not a plain 6-digit colour value gets the stand-in. */
function toFloats(color: string, standIn: [number, number, number]): [number, number, number] {
  if (color.length === 7 && color.charAt(0) === '#') {
    const red = parseInt(color.slice(1, 3), 16);
    const green = parseInt(color.slice(3, 5), 16);
    const blue = parseInt(color.slice(5, 7), 16);
    if (!Number.isNaN(red) && !Number.isNaN(green) && !Number.isNaN(blue)) return [red / 255, green / 255, blue / 255];
  }
  return standIn;
}

/** A quiet native button with a comfortable touch target (48 points, 44 when compact). */
function ToolButton({
  label,
  hint,
  onPress,
  disabled = false,
  filled = false,
  open = false,
  compact = false,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
  filled?: boolean;
  /** For a button that shows or hides something: it is filled while that is shown. */
  open?: boolean;
  compact?: boolean;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled, expanded: open || undefined }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        minHeight: compact ? 44 : 48,
        minWidth: 44,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: compact ? spacing.md : spacing.lg,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderGold,
        backgroundColor: filled || open ? colors.primary : pressed ? colors.surfaceElevated : colors.surface,
        opacity: disabled ? 0.45 : 1,
      })}>
      <AppText variant="label" color={filled || open ? 'onPrimary' : 'primaryHighlight'}>
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * Fades its content in when it appears. That is all: there is no exit animation, no callback and no state, so the content is removed the instant its owner stops rendering it and a half-run
 * animation can never keep anything on screen. With Reduce Motion it just appears.
 */
function FadeIn({ children }: { children: ReactNode }) {
  const reduce = useReduceMotion();
  const [opacity] = useState(() => new Animated.Value(reduce ? 1 : 0));
  useEffect(() => {
    if (reduce) {
      opacity.setValue(1);
      return;
    }
    const animation = Animated.timing(opacity, { toValue: 1, duration: motion.duration.selection, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER });
    animation.start();
    return () => animation.stop();
  }, [reduce, opacity]);
  // `box-none`: only the card inside takes touches, never the empty strip beside it (on a wide screen the card is narrower than its row), so the model stays free to turn there.
  return (
    <Animated.View pointerEvents="box-none" style={{ opacity }}>
      {children}
    </Animated.View>
  );
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
  const { colors, spacing, radius, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const [phase, setPhase] = useState<Phase>('loading');
  const [stage, setStage] = useState<'download' | 'prepare'>('download');
  const [progress, setProgress] = useState<number | null>(null);
  const [errorCode, setErrorCode] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [hint, setHint] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The hotspot chosen last (it stays marked in the list), and whether the open explanation was reached from the list (Back then returns to it).
  const [lastId, setLastId] = useState<string | null>(null);
  const [fromList, setFromList] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [area, setArea] = useState(0);
  const webView = useRef<WebView>(null);
  const panelScroll = useRef<ScrollView>(null);

  const origin = useMemo(() => originOf(modelUrl), [modelUrl]);
  // The page is built ONCE, when the viewer opens. A change of theme or of the Reduce Motion setting while it is open must not replace the page: that would reload the WebView and download the
  // model again. It takes effect the next time the viewer opens.
  const [html] = useState(() =>
      buildViewerHtml({
        url: modelUrl,
        origin,
        background: colors.surface,
        reducedMotion: reduce,
        maxTriangles: MAX_TRIANGLES,
        markers: {
          fill: toFloats(colors.primary, [0.83, 0.69, 0.22]),
          ring: toFloats(colors.onPrimary, [0.03, 0.04, 0.06]),
          ink: toFloats(colors.onPrimary, [0.03, 0.04, 0.06]),
          selectedFill: toFloats(colors.primaryHighlight, [0.94, 0.82, 0.4]),
          selectedRing: toFloats(colors.textOnImage, [0.95, 0.93, 0.86]),
        },
      }),
  );

  // The chosen hotspot, by id: an id that is not in the list (changed meanwhile) selects nothing, so a stale selection can never show an explanation.
  const selectedIndex = selectedId === null ? -1 : hotspots.findIndex((h) => h.id === selectedId);
  const selected = selectedIndex >= 0 ? hotspots[selectedIndex] : null;
  const hasHotspots = hotspots.length > 0;

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
    setStage('download');
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

  // The first-use hint: once the model is shown, for a few seconds, unless the learner touches the model first.
  useEffect(() => {
    if (phase !== 'ready' || hintSeen) return;
    setHint(true);
    const timer = setTimeout(() => {
      hintSeen = true;
      setHint(false);
    }, HINT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // The markers and the highlight follow the data. The argument is a JSON TEXT (a quoted string), which the page parses and the engine validates.
  useEffect(() => {
    if (phase === 'ready') run(`window.__setHotspots && window.__setHotspots(${JSON.stringify(markersJson)});`);
  }, [phase, markersJson, run]);
  useEffect(() => {
    if (phase === 'ready') run(`window.__setSelected && window.__setSelected(${JSON.stringify(selected ? selected.id : null)});`);
  }, [phase, selected, markersJson, run]);

  // A new hotspot starts at the top of its text.
  useEffect(() => {
    panelScroll.current?.scrollTo({ y: 0, animated: false });
  }, [selectedId]);

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
  const focusSelected = useCallback(() => {
    if (!selected) return;
    // The point is put in the upper part of the view, which the panel does not cover.
    run(`window.__focusHotspot && window.__focusHotspot(${JSON.stringify(selected.id)}, 0.5);`);
  }, [selected, run]);

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
      if (message.t === 'status') {
        setStage(message.phase === 'prepare' ? 'prepare' : 'download');
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
  const percent = progress === null ? null : Math.round(progress * 100);
  const statusText = stage === 'prepare' ? 'Preparing the 3D view…' : percent === null ? 'Downloading the 3D model…' : `Downloading the 3D model… ${percent}%`;
  const hintText = hasHotspots ? 'Drag to rotate · Pinch to zoom · Tap a number' : 'Drag to rotate · Pinch to zoom';

  /** The frame of both panels: a raised card over the lower part of the view (all of it when the view is short), the model above it still free to turn. */
  const short = area > 0 && area < SHORT_VIEW;
  const panelStyle = {
    width: '100%' as const,
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center' as const,
    maxHeight: area > 0 ? (short ? Math.max(120, area - spacing.md) : Math.round(area * 0.6)) : ('58%' as const),
    marginBottom: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderGold,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden' as const,
  };

  return (
    <Modal visible animationType={reduce ? 'none' : 'fade'} onRequestClose={onBack} statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>
      <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingTop: insets.top + spacing.sm,
            paddingBottom: spacing.sm,
            paddingLeft: insets.left + spacing.sm,
            paddingRight: insets.right + spacing.md,
          }}>
          <PanelButton glyph="‹" label="Close the 3D viewer" onPress={onClose} />
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <AppText variant="caption" color="primaryHighlight" style={{ fontWeight: '700', letterSpacing: 1 }}>
              3D MODEL
            </AppText>
            {title ? (
              <AppText variant="heading" numberOfLines={2} accessibilityRole="header">
                {title}
              </AppText>
            ) : null}
          </View>
          <ToolButton label="Reset view" hint="Returns the model to its starting view" onPress={resetView} disabled={phase !== 'ready'} compact />
        </View>

        <View style={{ flex: 1 }} onLayout={(event) => setArea(Math.round(event.nativeEvent.layout.height))}>
          {/* A failed attempt releases its WebView (and its WebGL context) at once; Try again builds a new one. */}
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
              style={{ flex: 1, backgroundColor: colors.surface }}
            />
          ) : null}

          {/* The poster stays behind the status until the model is there. */}
          {phase !== 'ready' && posterUri ? (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Image source={{ uri: posterUri }} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
            </View>
          ) : null}

          {phase === 'loading' ? (
            <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: spacing.xl }]}>
              <View
                accessibilityLiveRegion="polite"
                accessibilityRole="progressbar"
                accessibilityLabel={statusText}
                accessibilityValue={percent === null || stage === 'prepare' ? undefined : { min: 0, max: 100, now: percent }}
                style={{ alignItems: 'center', gap: spacing.md, padding: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surfaceElevated, minWidth: 240 }}>
                <ActivityIndicator color={colors.primaryHighlight} />
                <AppText variant="bodySmall" color="textSecondary" align="center">
                  {statusText}
                </AppText>
                {percent !== null && stage === 'download' ? (
                  <View style={{ width: 200, height: 4, borderRadius: 2, backgroundColor: colors.borderSubtle, overflow: 'hidden' }}>
                    <View style={{ width: `${percent}%`, height: 4, backgroundColor: colors.primary }} />
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {phase === 'error' ? (
            <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: spacing.xl }]}>
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                style={{ alignItems: 'center', gap: spacing.lg, padding: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderGold, backgroundColor: colors.surfaceElevated, maxWidth: 360 }}>
                <AppText variant="body" align="center">
                  {failure.message}
                </AppText>
                <View style={{ flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {failure.retry ? <ToolButton label="Try again" onPress={retry} filled /> : null}
                  <ToolButton label="Close" onPress={onClose} />
                </View>
              </View>
            </View>
          ) : null}

          {/* Shown once per session, briefly, and never blocks the model. */}
          {hint && phase === 'ready' && !selected && !listOpen ? (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'flex-end', padding: spacing.xl }]}>
              <View
                accessibilityLiveRegion="polite"
                style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderGold, backgroundColor: colors.surfaceElevated }}>
                <AppText variant="bodySmall" color="textSecondary" align="center">
                  {hintText}
                </AppText>
              </View>
            </View>
          ) : null}

          {/* The explanation of the chosen hotspot. It covers only its own card; everything else in the view is still the model. */}
          {selected && phase === 'ready' ? (
            <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', paddingHorizontal: spacing.sm }]}>
              <FadeIn>
                <View style={panelStyle}>
                  <View style={{ paddingTop: spacing.md, paddingLeft: spacing.lg, paddingRight: spacing.sm, gap: spacing.xs }}>
                    <HotspotTopBar noun={NOUN} index={selectedIndex} total={hotspots.length} onClose={clearSelection} />
                    <HotspotNavigator noun={NOUN} hotspots={hotspots} index={selectedIndex} onSelect={goToIndex} />
                  </View>
                  <ScrollView
                    ref={panelScroll}
                    style={{ flexShrink: 1 }}
                    contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg }}
                    showsVerticalScrollIndicator
                    keyboardShouldPersistTaps="handled">
                    <HotspotContent noun={NOUN} hotspot={selected} />
                    {selected.position ? (
                      <View style={{ marginTop: spacing.lg, alignItems: 'flex-start' }}>
                        <ToolButton label="Focus on this point" hint="Brings this point of the model into view. Reset view returns to the starting view." onPress={focusSelected} compact />
                      </View>
                    ) : null}
                  </ScrollView>
                </View>
              </FadeIn>
            </View>
          ) : null}

          {/* The list: every hotspot, in order, as large buttons, so none needs a tap on a small marker. */}
          {listOpen && !selected && phase === 'ready' && hasHotspots ? (
            <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', paddingHorizontal: spacing.sm }]}>
              <FadeIn>
                <View style={panelStyle}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.md, paddingLeft: spacing.lg, paddingRight: spacing.sm }}>
                    <AppText variant="caption" color="primaryHighlight" style={{ fontWeight: '700', letterSpacing: 1 }} accessibilityRole="header">
                      HOTSPOTS · {hotspots.length}
                    </AppText>
                    <ToolButton label="Close list" onPress={() => setListOpen(false)} compact />
                  </View>
                  <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: spacing.sm, gap: spacing.xs }} keyboardShouldPersistTaps="handled">
                    {hotspots.map((h, index) => {
                      const current = h.id === lastId;
                      return (
                        <Pressable
                          key={h.id}
                          accessibilityRole="button"
                          accessibilityLabel={`${NOUN} ${index + 1}: ${h.label || 'no label'}`}
                          accessibilityHint="Opens its explanation"
                          accessibilityState={{ selected: current }}
                          onPress={() => choose(h.id, true)}
                          style={({ pressed }) => ({
                            minHeight: 52,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: spacing.md,
                            paddingHorizontal: spacing.md,
                            paddingVertical: spacing.sm,
                            borderRadius: radius.md,
                            borderWidth: 1,
                            borderColor: current ? colors.borderGold : colors.transparent,
                            backgroundColor: pressed || current ? colors.surface : colors.transparent,
                          })}>
                          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: current ? colors.primaryHighlight : colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                            <AppText variant="caption" color="onPrimary" style={{ fontWeight: '700' }} allowFontScaling={false}>
                              {index + 1}
                            </AppText>
                          </View>
                          <View style={{ flex: 1 }}>
                            <AppText variant="body" style={{ fontWeight: current ? '700' : '500' }}>
                              {h.label || NOUN}
                            </AppText>
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              </FadeIn>
            </View>
          ) : null}
        </View>

        {/* The footer exists only for a model with hotspots; without any, the model uses the whole height. */}
        {hasHotspots ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              paddingTop: spacing.sm,
              paddingBottom: insets.bottom + spacing.md,
              paddingLeft: insets.left + spacing.lg,
              paddingRight: insets.right + spacing.lg,
            }}>
            <ToolButton
              label={`Hotspots (${hotspots.length})`}
              hint="Shows every hotspot of this model as a list"
              onPress={() => {
                setSelectedId(null);
                setFromList(false);
                setListOpen((isOpen) => !isOpen);
              }}
              disabled={phase !== 'ready'}
              open={listOpen}
            />
          </View>
        ) : (
          <View style={{ height: insets.bottom }} />
        )}
      </View>
    </Modal>
  );
}
