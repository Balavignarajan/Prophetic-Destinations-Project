import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Reveal, TurnChevron } from '@/components/ui';
import { ScripturePassage } from '@/learning/scripture-passage';
import { useTheme } from '@/theme';

/**
 * The Scripture passages attached to a timeline event or a hotspot. Each entry in the published snapshot is the FROZEN passage
 * ({ reference, display, source, verses }, see backend scripture-embed.service.ts), so it is shown from the lesson itself, offline
 * through the lesson cache, and never re-read from another edition. A learner opens a passage with a button labelled with its reference;
 * it then appears in the same bordered Scripture card as a Scripture passage block (`ScripturePassage`), clearly apart from the
 * author's explanation above it. A malformed passage shows that card's "not available" message for that passage only; the event or
 * hotspot text and its other passages stay readable. Nothing is shown when there are no entries (older lessons).
 */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function ScriptureLinks({ entries }: { entries: unknown }) {
  const { spacing, colors, radius } = useTheme();
  const [open, setOpen] = useState<number | null>(null);
  if (!Array.isArray(entries) || entries.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      {entries.map((raw, index) => {
        const entry = isRecord(raw) ? raw : {};
        const name = typeof entry.display === 'string' && entry.display.trim() ? entry.display.trim() : 'Scripture passage';
        const expanded = open === index;
        return (
          <View key={index} style={{ gap: spacing.sm }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${expanded ? 'Hide' : 'Read'} Scripture: ${name}`}
              accessibilityState={{ expanded }}
              onPress={() => setOpen(expanded ? null : index)}
              style={({ pressed }) => ({
                minHeight: 44,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.borderGold,
                backgroundColor: pressed ? colors.surfaceElevated : colors.transparent,
                alignSelf: 'flex-start',
              })}>
              <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '600', flexShrink: 1 }}>
                {expanded ? 'Hide' : 'Read'} {name}
              </AppText>
              <TurnChevron open={expanded} size={10} />
            </Pressable>
            {expanded ? (
              <Reveal>
                <ScripturePassage content={entry} />
              </Reveal>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
