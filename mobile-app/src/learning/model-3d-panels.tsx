import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useEffect, useRef } from 'react';
import { type LayoutChangeEvent, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { CompactScripture } from '@/learning/compact-scripture';
import { Crossfade, type ExplanationHotspot } from '@/learning/hotspot-explanation';
import { Glyph, NumberBadge, Pill, RiseIn, RoundButton } from '@/learning/model-3d-ui';
import { useTheme } from '@/theme';

/**
 * The two panels of the 3D viewer, "Explore the Model" (the list of hotspots) and the discovery panel (one hotspot's explanation), and the dock that holds whichever is open.
 *
 * THE DOCK. In portrait a panel is a sheet along the bottom edge (rounded at the top, never taller than `maxHeight`); in landscape it is a drawer on the right (below the header, as wide as
 * `dockWidth`), so the model keeps the larger part of a wide, short screen. The dock is an ordinary view inside the viewer's modal: not a second modal, no gesture handler, no exit animation
 * (it comes in once and is removed the instant it is not rendered), and its wrapper passes touches through, so the model can still be turned and pinched wherever the panel is not. It reports its
 * size so the viewer can keep the chosen point in the free part of the view.
 *
 * THE CONTENT is the CMS's: the hotspot's title and explanation as the author wrote them, in paragraphs, and its Scripture as the compact cards the interactive image uses (the reference, Read
 * Passage, Open in Bible). The explanation scrolls inside the panel when it is long. Nothing here knows any lesson, kingdom or verse.
 */
const NEWLINE = String.fromCharCode(10);

export type PanelBox = { width: number; height: number };

/** A hotspot as the panels need it: its text and Scripture, and whether it has a point on the model (only then can the camera be brought to it). */
export type PanelHotspot = ExplanationHotspot & { position: [number, number, number] | null };

export function PanelDock({
  landscape,
  dockWidth,
  headerHeight,
  maxHeight,
  onBox,
  children,
}: {
  landscape: boolean;
  dockWidth: number;
  headerHeight: number;
  maxHeight: number;
  onBox: (box: PanelBox) => void;
  children: ReactNode;
}) {
  const { colors, radius, layout, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    onBox({ width: Math.round(width), height: Math.round(height) });
  };
  const surface = { backgroundColor: colors.surfaceElevated, borderColor: colors.borderGold, overflow: 'hidden' as const };

  if (landscape) {
    return (
      <View pointerEvents="box-none" style={{ position: 'absolute', top: headerHeight, bottom: 0, right: 0, width: dockWidth + insets.right }}>
        <RiseIn from="right" style={{ flex: 1 }}>
          <View
            onLayout={onLayout}
            style={[shadows.card, surface, { flex: 1, paddingRight: insets.right, paddingBottom: insets.bottom, borderTopLeftRadius: radius.xl, borderTopWidth: layout.hairline, borderLeftWidth: layout.hairline }]}>
            {children}
          </View>
        </RiseIn>
      </View>
    );
  }
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' }}>
      <RiseIn style={{ width: '100%', maxWidth: layout.maxContentWidth }}>
        <View
          onLayout={onLayout}
          style={[
            shadows.card,
            surface,
            { width: '100%', maxHeight, paddingBottom: insets.bottom, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: layout.hairline, borderLeftWidth: layout.hairline, borderRightWidth: layout.hairline },
          ]}>
          {children}
        </View>
      </RiseIn>
    </View>
  );
}

/**
 * One hotspot's explanation as a guided-discovery panel. Top: its number, "DISCOVERY POINT", where it is in the sequence and Close. Then a thin progress line, the title, a gold rule, the
 * author's text and, in its own section, the Scripture. Bottom (always in view, whatever the text length): Previous, "Focus on point" (only for a hotspot that has a point on the model) and Next.
 */
export function DiscoveryPanel({
  hotspot,
  index,
  total,
  onClose,
  onPrevious,
  onNext,
  onFocus,
}: {
  hotspot: PanelHotspot;
  index: number;
  total: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onFocus: () => void;
}) {
  const { colors, spacing, layout, gradients } = useTheme();
  const body = useRef<ScrollView>(null);
  // A new hotspot starts at the top of its text.
  useEffect(() => {
    body.current?.scrollTo({ y: 0, animated: false });
  }, [hotspot.id]);
  const paragraphs = hotspot.explanation
    .split(NEWLINE)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const hasScripture = Array.isArray(hotspot.scripture) && hotspot.scripture.length > 0;
  const position = `${index + 1} of ${total}`;

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg, paddingLeft: spacing.lg, paddingRight: spacing.sm }}>
        <NumberBadge value={index + 1} size={30} active />
        <View accessible accessibilityLabel={`Discovery point ${position}`} style={{ flex: 1 }}>
          <AppText variant="caption" color="primaryHighlight" style={{ fontWeight: '700', letterSpacing: 1.6 }}>
            DISCOVERY POINT
          </AppText>
          <AppText variant="caption" color="textMuted">
            {position}
          </AppText>
        </View>
        <RoundButton glyph="close" tone="plain" label="Close hotspot details" onPress={onClose} />
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 2, marginHorizontal: spacing.lg, marginTop: spacing.xs, borderRadius: 1, backgroundColor: colors.borderSubtle }}>
        <View style={{ width: `${((index + 1) / Math.max(1, total)) * 100}%`, height: 2, borderRadius: 1, backgroundColor: colors.primary }} />
      </View>

      <ScrollView
        ref={body}
        style={{ flexShrink: 1, flexGrow: 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg }}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled">
        <Crossfade id={hotspot.id}>
          <View key={hotspot.id} style={{ gap: spacing.md }}>
            <AppText variant="heading" accessibilityRole="header">
              {hotspot.label || 'Discovery point'}
            </AppText>
            <LinearGradient colors={gradients.metallicGold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: 48, height: 2, borderRadius: 1 }} />
            {paragraphs.map((paragraph, i) => (
              <AppText key={i} variant="body" style={{ fontSize: 16, lineHeight: 27 }}>
                {paragraph}
              </AppText>
            ))}
            {hasScripture ? (
              <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <AppText variant="caption" color="textMuted" style={{ fontWeight: '700', letterSpacing: 1.6 }} accessibilityRole="header">
                    IN SCRIPTURE
                  </AppText>
                  <View style={{ flex: 1, height: layout.hairline, backgroundColor: colors.borderSubtle }} />
                </View>
                <CompactScripture entries={hotspot.scripture} />
              </View>
            ) : null}
          </View>
        </Crossfade>
      </ScrollView>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderTopWidth: layout.hairline,
          borderTopColor: colors.borderSubtle,
        }}>
        <RoundButton glyph="left" label="Previous discovery point" disabled={index <= 0} onPress={onPrevious} />
        {hotspot.position ? (
          <Pill
            label="Focus on point"
            accessibilityLabel="Focus on this point"
            hint="Brings this point of the model into view. Reset view returns to the starting view."
            variant="outline"
            grow
            onPress={onFocus}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center' }}>
            <AppText variant="bodySmall" color="textMuted">
              {position}
            </AppText>
          </View>
        )}
        <RoundButton glyph="right" tone="filled" label="Next discovery point" disabled={index >= total - 1} onPress={onNext} />
      </View>
    </>
  );
}

/**
 * "Explore the Model": every hotspot, in order, as large rows, so none needs a tap on a small marker. Each row has its number, its title (long ones wrap) and, for the one chosen last, a gold
 * border and the selected state for screen readers. Many hotspots scroll. Choosing a row opens that hotspot's panel; it never moves the camera by itself.
 */
export function HotspotListPanel({
  hotspots,
  currentId,
  onChoose,
  onClose,
}: {
  hotspots: readonly PanelHotspot[];
  currentId: string | null;
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  const { colors, spacing, radius, layout } = useTheme();
  const count = `${hotspots.length} ${hotspots.length === 1 ? 'hotspot' : 'hotspots'}`;
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg, paddingLeft: spacing.lg, paddingRight: spacing.sm }}>
        <View accessible accessibilityRole="header" accessibilityLabel={`Explore the model, ${count}`} style={{ flex: 1 }}>
          <AppText variant="heading" style={{ fontSize: 18, lineHeight: 26 }}>
            Explore the Model
          </AppText>
          <AppText variant="caption" color="primaryHighlight" style={{ fontWeight: '700', letterSpacing: 1.2 }}>
            {count.toUpperCase()}
          </AppText>
        </View>
        <RoundButton glyph="close" tone="plain" label="Close the list of hotspots" onPress={onClose} />
      </View>
      <ScrollView style={{ flexShrink: 1, flexGrow: 1 }} contentContainerStyle={{ padding: spacing.md, gap: spacing.xs }} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
        {hotspots.map((h, index) => {
          const current = h.id === currentId;
          return (
            <Pressable
              key={h.id}
              accessibilityRole="button"
              accessibilityLabel={`Hotspot ${index + 1}: ${h.label || 'no title'}`}
              accessibilityHint="Opens its explanation"
              accessibilityState={{ selected: current }}
              onPress={() => onChoose(h.id)}
              style={({ pressed }) => ({
                minHeight: 56,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radius.lg,
                borderWidth: layout.hairline,
                borderColor: current ? colors.borderGold : colors.transparent,
                backgroundColor: pressed || current ? colors.surface : colors.transparent,
              })}>
              <NumberBadge value={index + 1} size={28} active={current} />
              <View style={{ flex: 1 }}>
                <AppText variant="body" style={{ fontWeight: current ? '700' : '500' }}>
                  {h.label || 'Hotspot'}
                </AppText>
              </View>
              <Glyph name="right" color={current ? colors.primaryHighlight : colors.textMuted} size={14} />
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
}
