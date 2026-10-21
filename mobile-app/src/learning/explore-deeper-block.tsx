import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, BlockNotice, ChevronIcon } from '@/components/ui';
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
      <BlockNotice title="Explore Deeper section not available" message="This section could not be shown. The rest of the lesson is not affected." />
    );
  }

  return (
    <View
      style={{
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: open ? colors.borderGold : colors.borderSubtle,
        backgroundColor: open ? colors.surfaceElevated : colors.surface,
      }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Explore deeper: ${title}`}
        accessibilityHint={open ? 'Double tap to hide this section' : 'Double tap to show this section'}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700' }}>
            Explore deeper
          </AppText>
          <AppText variant="body" style={{ fontWeight: '600' }}>
            {title}
          </AppText>
        </View>
        {/* The chevron points down when closed and up when open; the state is also in the accessibility state above. */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
            <ChevronIcon direction="right" color="primaryHighlight" />
          </View>
        </View>
      </Pressable>
      {open ? (
        <View style={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
          {paragraphs.map((p, index) => (
            <AppText key={index} variant="body" style={{ fontSize: 17, lineHeight: 28 }}>
              {p}
            </AppText>
          ))}
          <ScriptureLinks entries={content.scripture} />
        </View>
      ) : null}
    </View>
  );
}
