import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui';
import { ScriptureLinks } from '@/learning/scripture-links';
import { useTheme } from '@/theme';

/**
 * Renders a published EXPLORE_DEEPER block (backend/src/modules/lessons/domain/blocks/map-explore.ts; PROPOSED schema):
 *   { title, intro, scripture?: FROZEN passages [{ reference, display, source, verses }] }
 * An optional deeper-study section: a button labelled with its title opens and closes it, and the screen reader hears whether it is expanded.
 * It starts closed. All of its content is part of the saved lesson, so it opens offline with nothing to download. The introduction is the
 * author's text shown as plain paragraphs; cross-references are the frozen passages (ScriptureLinks), apart from that text. It is shown to every
 * level the block is visible to: nothing here depends on the learner's level. If the title or introduction is missing the section is "not
 * available" instead of an empty control; the rest of the lesson is unaffected. Long text and large fonts wrap.
 */
const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function ExploreDeeperBlock({ content }: { content: Record<string, unknown> }) {
  const { spacing, colors, radius } = useTheme();
  const [open, setOpen] = useState(false);
  const title = asText(content.title);
  const paragraphs = asText(content.intro).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  if (!title || paragraphs.length === 0) {
    return (
      <View style={{ gap: spacing.xs, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface }}>
        <AppText variant="label" color="warning">
          Explore Deeper section not available
        </AppText>
        <AppText variant="bodySmall" color="textSecondary" accessibilityLiveRegion="polite">
          This section could not be shown. The rest of the lesson is not affected.
        </AppText>
      </View>
    );
  }

  return (
    <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: open ? colors.borderGold : colors.borderSubtle, backgroundColor: colors.surface }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Explore deeper: ${title}`}
        accessibilityHint={open ? 'Double tap to hide this section' : 'Double tap to show this section'}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText variant="label" color="primaryHighlight">
            Explore deeper
          </AppText>
          <AppText variant="body">{title}</AppText>
        </View>
        <AppText variant="label" color="textSecondary" accessibilityElementsHidden importantForAccessibility="no">
          {open ? 'Hide' : 'Show'}
        </AppText>
      </Pressable>
      {open ? (
        <View style={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
          {paragraphs.map((p, index) => (
            <AppText key={index} variant="body">
              {p}
            </AppText>
          ))}
          <ScriptureLinks entries={content.scripture} />
        </View>
      ) : null}
    </View>
  );
}
