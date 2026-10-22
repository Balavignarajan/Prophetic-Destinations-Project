import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Reveal, TurnChevron } from '@/components/ui';
import { ScripturePassage, ScriptureReference, isReferenceOnly } from '@/learning/scripture-passage';
import { useTheme } from '@/theme';

/**
 * The Scripture passages attached to a lesson block. Each entry in the published snapshot is the FROZEN passage
 * ({ reference, display, source, verses }, see backend scripture-embed.service.ts), so it is shown from the lesson itself, offline
 * through the lesson cache, and never re-read from another edition. A malformed passage shows the "not available" message for that passage
 * only; the block's own text and its other passages stay readable. Nothing is shown when there are no entries (older lessons).
 *
 * The block that owns the Scripture chooses how it is presented (`presentation`), because only the block knows whether the passage is
 * what the learner needs in order to follow it, or a supporting reference:
 *  - `expandable` (the default): a button labelled with the reference opens the passage and closes it again. For supporting
 *    references, such as cross-references, timeline events and "deeper study", where hiding the text keeps the block short.
 *  - `inline`: the passage is simply there, in normal reading flow, drawn without a card of its own (the gold rule and the text) because it
 *    sits inside the owning block. For Scripture the explanation depends on (LESS-007: necessary Scripture is not hidden behind a tap).
 *  - `standalone`: the same, drawn as the full Scripture card of a Scripture passage block, for Scripture that stands directly in the lesson
 *    flow rather than inside another block.
 * A passage that has a reference but NO verse text is never an empty quotation and never a button that opens an error: in every mode
 * it is shown as its reference alone (ScriptureReference).
 */
export type ScripturePresentation = 'expandable' | 'inline' | 'standalone';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const nameOf = (entry: unknown) => (isRecord(entry) && typeof entry.display === 'string' ? entry.display.trim().toLowerCase() : '');

/**
 * `entries` without the passages that the same block already shows in full elsewhere (matched by their reference label), so that no
 * passage is printed twice. Always a list; entries without a label are kept.
 */
export function withoutPassages(entries: unknown, shown: unknown[]): unknown[] {
  const names = new Set(shown.map(nameOf).filter(Boolean));
  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    const name = nameOf(entry);
    return !name || !names.has(name);
  });
}

export function ScriptureLinks({ entries, presentation = 'expandable' }: { entries: unknown; presentation?: ScripturePresentation }) {
  const { spacing, colors, radius } = useTheme();
  const [open, setOpen] = useState<number | null>(null);
  if (!Array.isArray(entries) || entries.length === 0) return null;

  return (
    <View style={{ gap: presentation === 'expandable' ? spacing.sm : spacing.lg }}>
      {entries.map((raw, index) => {
        const entry = isRecord(raw) ? raw : {};
        if (isReferenceOnly(entry)) return <ScriptureReference key={index} content={entry} />;
        if (presentation === 'inline') return <ScripturePassage key={index} content={entry} embedded />;
        if (presentation === 'standalone') return <ScripturePassage key={index} content={entry} />;

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
