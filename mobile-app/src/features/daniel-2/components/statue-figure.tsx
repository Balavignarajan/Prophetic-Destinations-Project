import { Pressable, View, type ViewStyle } from 'react-native';

import { type ColorTokens, useTheme } from '@/theme';

import type { MaterialKey, StatueSectionId, StatueSectionInfo } from '../types';

export function materialColor(colors: ColorTokens, key: MaterialKey): string {
  switch (key) {
    case 'gold':
      return colors.materialGold;
    case 'silver':
      return colors.materialSilver;
    case 'bronze':
      return colors.materialBronze;
    case 'iron':
      return colors.materialIron;
    case 'ironClay':
      return colors.materialClay;
    case 'stone':
      return colors.materialStone;
  }
}

export type StatueFigureProps = {
  sections: StatueSectionInfo[];
  /** The part to emphasise; the others are dimmed. */
  highlight?: StatueSectionId | null;
  /** Makes each part a button. */
  onSelect?: (id: StatueSectionId) => void;
  /** Draws the stone beside the feet (the point of impact). */
  showStone?: boolean;
  /** 1 is full size (about 330 tall). */
  scale?: number;
};

/**
 * The great image, drawn from plain views: a stylised illustration, not a model. Parts are tappable when `onSelect` is given.
 * Fills come from the theme's material tokens; every part is outlined so it reads on a light or dark page.
 */
export function StatueFigure({ sections, highlight = null, onSelect, showStone = false, scale = 1 }: StatueFigureProps) {
  const { colors, layout } = useTheme();
  const s = (n: number) => Math.round(n * scale);
  const byId = (id: StatueSectionId) => sections.find((section) => section.id === id)!;

  const part = (id: StatueSectionId, style: ViewStyle, children?: React.ReactNode, fill?: string) => {
    const info = byId(id);
    const selected = highlight === id;
    const dimmed = highlight !== null && !selected;
    const body = (
      <View
        style={[
          style,
          {
            backgroundColor: fill ?? materialColor(colors, info.materialKey),
            borderWidth: selected ? 2 : layout.hairline,
            borderColor: selected ? colors.primaryHighlight : colors.textMuted,
            opacity: dimmed ? 0.45 : 1,
            overflow: 'hidden',
          },
        ]}>
        {children}
      </View>
    );
    if (!onSelect) return body;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${info.name}, ${info.material}`}
        aria-selected={selected}
        onPress={() => onSelect(id)}
        hitSlop={4}
        style={{ minWidth: layout.minTouchTarget, minHeight: layout.minTouchTarget, alignItems: 'center', justifyContent: 'center' }}>
        {body}
      </Pressable>
    );
  };

  const gap = Math.max(2, s(4));
  return (
    <View
      accessible={!onSelect}
      accessibilityLabel={onSelect ? undefined : 'The great image: gold head, silver chest and arms, bronze belly and thighs, iron legs, feet of iron mixed with clay'}
      style={{ alignItems: 'center', gap, minWidth: s(190) }}>
      {part('head', { width: s(62), height: s(62), borderRadius: s(31) })}
      {part('chest', { width: s(150), height: s(78), borderTopLeftRadius: s(26), borderTopRightRadius: s(26), borderBottomLeftRadius: s(8), borderBottomRightRadius: s(8) })}
      {part('belly', { width: s(118), height: s(58), borderRadius: s(8) })}
      <View style={{ flexDirection: 'row', gap }}>
        {part('legs', { width: s(48), height: s(92), borderRadius: s(6) })}
        {part('legs', { width: s(48), height: s(92), borderRadius: s(6) })}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap }}>
        {part('feet', { width: s(54), height: s(26), borderRadius: s(8) }, undefined, colors.materialIron)}
        {part('feet', { width: s(54), height: s(26), borderRadius: s(8) }, undefined, colors.materialClay)}
        {showStone ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              position: 'absolute',
              right: -s(52),
              bottom: s(2),
              width: s(34),
              height: s(30),
              borderRadius: s(15),
              backgroundColor: colors.materialStone,
              borderWidth: 2,
              borderColor: colors.primaryHighlight,
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

/** A triangle of stone for the mountain: drawn from borders, filled from the stone token. */
export function Mountain({ size = 120 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 0,
        height: 0,
        borderLeftWidth: size,
        borderRightWidth: size,
        borderBottomWidth: size * 0.9,
        borderLeftColor: colors.transparent,
        borderRightColor: colors.transparent,
        borderBottomColor: colors.materialStone,
      }}
    />
  );
}
