import { View } from 'react-native';
import type { ReactNode } from 'react';

import { AppText } from '@/components/ui';
import { type ColorToken, useTheme } from '@/theme';

import type { Identification } from '../types';

/**
 * The four kinds of statement the lesson keeps apart. Each has its own label text AND its own border style (solid, dashed,
 * dotted), so the difference never depends on colour alone.
 */
export type ContentKind = 'scripture' | 'interpretation' | 'historical-context' | 'historical-application';

const LABELS: Record<ContentKind, string> = {
  scripture: 'Bible text / Scripture reference',
  interpretation: 'Biblical interpretation',
  'historical-context': 'Historical context',
  'historical-application': 'Historical application',
};

const BORDER: Record<ContentKind, 'solid' | 'dashed' | 'dotted'> = {
  scripture: 'solid',
  interpretation: 'dashed',
  'historical-context': 'solid',
  'historical-application': 'dotted',
};

/** A bordered block that states what kind of content it holds. */
export function ContentSection({ kind, children }: { kind: ContentKind; children: ReactNode }) {
  const { colors, layout, radius, spacing } = useTheme();
  const gold = kind === 'scripture';
  return (
    <View
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: layout.hairline + (gold ? 1 : 0),
        borderStyle: BORDER[kind],
        borderColor: gold ? colors.borderGold : colors.border,
        backgroundColor: colors.surface,
      }}>
      <AppText variant="caption" color={gold ? 'primaryHighlight' : 'textMuted'} style={{ fontWeight: '700', textTransform: 'uppercase' }}>
        {LABELS[kind]}
      </AppText>
      {children}
    </View>
  );
}

const IDENTIFICATION: Record<Identification, { label: string; token: ColorToken }> = {
  stated: { label: 'Stated in the passage', token: 'success' },
  traditional: { label: 'Traditional identification', token: 'textSecondary' },
  disputed: { label: 'Interpretations differ', token: 'warning' },
};

/** A small outlined tag saying how firmly the passage supports an identification. */
export function IdentificationTag({ value }: { value: Identification }) {
  const { colors, layout, radius, spacing } = useTheme();
  const { label, token } = IDENTIFICATION[value];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingVertical: spacing.xxs,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.pill,
        borderWidth: layout.hairline,
        borderColor: colors[token],
      }}>
      <AppText variant="caption" color={token} style={{ fontWeight: '700' }}>
        {label}
      </AppText>
    </View>
  );
}
