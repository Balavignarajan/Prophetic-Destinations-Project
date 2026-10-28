import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, type LayoutChangeEvent, Pressable, ScrollView, View } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { AppText } from '@/components/ui';
import { CompactScripture } from '@/learning/compact-scripture';
import { useTheme } from '@/theme';
import { NATIVE_DRIVER, motion } from '@/theme/motion';

/** What the explanation shows of a hotspot; the published CMS text, exactly as it came. */
export type ExplanationHotspot = { id: string; label: string; explanation: string; scripture: unknown };

const HIT = 44;
const CHIP = 44;
const CHIP_GAP = 4;
const NEWLINE = String.fromCharCode(10);
/** How long the explanation takes to change when another hotspot is chosen, and how far it settles. */
const SWITCH_MS = 190;
const SWITCH_FROM = 0.3;

/** A small round control (previous, next, close): a 44-point touch target, named for screen readers, quieter when it cannot be used. */
export function PanelButton({ glyph, label, disabled = false, onPress }: { glyph: string; label: string; disabled?: boolean; onPress: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: HIT,
        height: HIT,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        backgroundColor: pressed ? colors.surface : colors.transparent,
        opacity: disabled ? 0.35 : 1,
      })}>
      <AppText variant="heading" color={disabled ? 'textMuted' : 'textSecondary'} allowFontScaling={false} style={{ lineHeight: 26 }}>
        {glyph}
      </AppText>
    </Pressable>
  );
}

/** "HOTSPOT 2 OF 5" with its small gold number, and the Close button. */
export function HotspotTopBar({ noun, index, total, onClose }: { noun: string; index: number; total: number; onClose: () => void }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 }}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="caption" color="onPrimary" style={{ fontWeight: '700' }} allowFontScaling={false}>
            {index + 1}
          </AppText>
        </View>
        <AppText variant="caption" color="primaryHighlight" style={{ fontWeight: '700', letterSpacing: 1, flexShrink: 1 }} accessibilityLabel={`${noun} ${index + 1} of ${total}`}>
          {noun.toUpperCase()} {index + 1} OF {total}
        </AppText>
      </View>
      <PanelButton glyph="✕" label={`Close ${noun.toLowerCase()} details`} onPress={onClose} />
    </View>
  );
}

/**
 * Previous, the numbers, Next: "‹  1 2 3 4 5  ›". The numbers scroll sideways, so any number of hotspots fits a narrow phone, and the active one is kept in view. The active number is
 * filled gold, which is also carried by the accessibility state (not by colour alone). Previous is off on the first hotspot and Next on the last. The order is the order of `hotspots`,
 * which is already the learner's level's.
 */
export function HotspotNavigator({
  noun,
  hotspots,
  index,
  onSelect,
}: {
  noun: string;
  hotspots: readonly ExplanationHotspot[];
  index: number;
  onSelect: (index: number) => void;
}) {
  const { colors, spacing } = useTheme();
  const reduce = useReduceMotion();
  const scroller = useRef<ScrollView>(null);
  const [viewport, setViewport] = useState(0);

  useEffect(() => {
    if (viewport <= 0) return;
    const x = Math.max(0, index * (CHIP + CHIP_GAP) - viewport / 2 + CHIP / 2);
    scroller.current?.scrollTo({ x, animated: !reduce });
  }, [index, viewport, reduce]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <PanelButton glyph="‹" label={`Previous ${noun.toLowerCase()}`} disabled={index <= 0} onPress={() => onSelect(index - 1)} />
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(event: LayoutChangeEvent) => setViewport(event.nativeEvent.layout.width)}
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: 'center', gap: CHIP_GAP }}>
        {hotspots.map((h, i) => {
          const active = i === index;
          return (
            <Pressable
              key={h.id}
              accessibilityRole="button"
              accessibilityLabel={`${noun} ${i + 1}: ${h.label || 'no label'}`}
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(i)}
              style={{ width: CHIP, height: HIT, alignItems: 'center', justifyContent: 'center' }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  borderWidth: active ? 0 : 1,
                  borderColor: colors.borderSubtle,
                  backgroundColor: active ? colors.primary : colors.transparent,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <AppText variant="bodySmall" color={active ? 'onPrimary' : 'textSecondary'} style={{ fontWeight: active ? '700' : '500' }} allowFontScaling={false}>
                  {i + 1}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <PanelButton glyph="›" label={`Next ${noun.toLowerCase()}`} disabled={index >= hotspots.length - 1} onPress={() => onSelect(index + 1)} />
    </View>
  );
}

/**
 * Changes what it shows when `id` changes by dipping and returning to full opacity with a very small lift (about 190 ms), instead of cutting. The new content is already in place when the
 * dip begins, so nothing ever flashes empty, and it works the same when the learner switches quickly (the running animation is replaced). Opacity and position only, on the native driver; with
 * Reduce Motion it just changes. The first appearance is not animated here (the sheet or panel that holds it does that).
 */
export function Crossfade({ id, children }: { id: string; children: ReactNode }) {
  const reduce = useReduceMotion();
  const [progress] = useState(() => new Animated.Value(1));
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) {
      progress.setValue(1);
      return;
    }
    progress.setValue(SWITCH_FROM);
    const animation = Animated.timing(progress, { toValue: 1, duration: SWITCH_MS, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER });
    animation.start();
    return () => animation.stop();
  }, [id, reduce, progress]);

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={{ opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [SWITCH_FROM, 1], outputRange: [6, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

/**
 * The explanation itself: the title, the author's text as readable paragraphs and the compact Scripture references. Nothing is cut: a long explanation is simply longer, and the sheet or panel that
 * holds it scrolls. Keyed by the hotspot, so each hotspot starts with its own Scripture cards closed.
 */
export function HotspotContent({ noun, hotspot }: { noun: string; hotspot: ExplanationHotspot }) {
  const { spacing, colors } = useTheme();
  const paragraphs = hotspot.explanation
    .split(NEWLINE)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return (
    <Crossfade id={hotspot.id}>
      <View key={hotspot.id} style={{ gap: spacing.md }}>
        <AppText variant="heading" accessibilityRole="header">
          {hotspot.label || noun}
        </AppText>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 40, height: 2, backgroundColor: colors.primary }} />
        {paragraphs.map((paragraph, i) => (
          <AppText key={i} variant="body" style={{ fontSize: 16, lineHeight: 27 }}>
            {paragraph}
          </AppText>
        ))}
        <CompactScripture entries={hotspot.scripture} />
      </View>
    </Crossfade>
  );
}

/**
 * The explanation beside the picture on a wide block: the same top bar, numbers and content as the sheet, in a raised card. The text scrolls inside the card when it is taller than
 * `maxBodyHeight` (the height of the picture), so a long explanation never stretches the lesson past the image.
 */
export function HotspotSidePanel({
  noun,
  hotspots,
  index,
  maxBodyHeight,
  onSelect,
  onClose,
}: {
  noun: string;
  hotspots: readonly ExplanationHotspot[];
  index: number;
  maxBodyHeight: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  const { spacing, colors, radius } = useTheme();
  const body = useRef<ScrollView>(null);
  const hotspot = hotspots[index];
  const hotspotId = hotspot ? hotspot.id : '';
  useEffect(() => {
    body.current?.scrollTo({ y: 0, animated: false });
  }, [hotspotId]);
  if (!hotspot) return null;
  return (
    <View
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: colors.surfaceElevated,
      }}>
      <HotspotTopBar noun={noun} index={index} total={hotspots.length} onClose={onClose} />
      <HotspotNavigator noun={noun} hotspots={hotspots} index={index} onSelect={onSelect} />
      <ScrollView ref={body} nestedScrollEnabled style={{ maxHeight: maxBodyHeight }} contentContainerStyle={{ paddingVertical: spacing.sm }}>
        <HotspotContent noun={noun} hotspot={hotspot} />
      </ScrollView>
    </View>
  );
}
