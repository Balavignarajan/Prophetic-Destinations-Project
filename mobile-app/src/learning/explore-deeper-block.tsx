import { useEffect, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { AppText, BlockNotice, Reveal, TurnChevron } from '@/components/ui';
import type { LearningLevel } from '@/learning/levels';
import { NestedBlocks } from '@/learning/nested-blocks';
import { ScriptureLinks } from '@/learning/scripture-links';
import { useTheme } from '@/theme';
import { motion } from '@/theme/motion';

/**
 * Renders a published EXPLORE_DEEPER block (backend/src/modules/lessons/domain/blocks/map-explore.ts; PROPOSED schema):
 *   { title, intro, scripture?: FROZEN passages [{ reference, display, source, verses }], blocks?: [{ id, type, content }] }
 * An optional deeper-study section: a button labelled with its title opens and closes it, and the screen reader hears whether it is expanded.
 * It starts closed. All of its content is part of the saved lesson, so it opens offline with nothing to download. The introduction is the
 * author's text shown as plain paragraphs; then the NESTED blocks, if the author added any, in their published order (NestedBlocks: the lesson's own
 * components, drawn from the snapshot, so they work offline and keep no state of their own); cross-references are the frozen passages (ScriptureLinks), apart from that text.
 * A section without nested blocks looks and behaves exactly as it always did. It is shown to every
 * level the block is visible to: nothing here depends on the learner's level. If the title or introduction is missing the section is "not
 * available" instead of an empty control; the rest of the lesson is unaffected. Long text and large fonts wrap.
 */
const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function ExploreDeeperBlock({ lessonId, level, content }: { lessonId: string; level: LearningLevel; content: Record<string, unknown> }) {
  const { spacing, colors, radius } = useTheme();
  const [open, setOpen] = useState(false);
  const reduce = useReduceMotion();
  // 0 closed, 1 open: the card's border and surface ease between the two (colours, so this one runs on the JavaScript thread; it is tiny).
  const [tint] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) {
      tint.setValue(open ? 1 : 0);
      return;
    }
    const animation = Animated.timing(tint, { toValue: open ? 1 : 0, duration: motion.duration.selection, easing: motion.easing.standard, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [open, reduce, tint]);
  const title = asText(content.title);
  const paragraphs = asText(content.intro).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  if (!title || paragraphs.length === 0) {
    return (
      <BlockNotice title="Explore Deeper section not available" message="This section could not be shown. The rest of the lesson is not affected." />
    );
  }

  return (
    <Animated.View
      style={{
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: tint.interpolate({ inputRange: [0, 1], outputRange: [colors.borderSubtle, colors.borderGold] }),
        backgroundColor: tint.interpolate({ inputRange: [0, 1], outputRange: [colors.surface, colors.surfaceElevated] }),
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
        <TurnChevron open={open} />
      </Pressable>
      {open ? (
        <Reveal style={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
          {paragraphs.map((p, index) => (
            <AppText key={index} variant="body" style={{ fontSize: 17, lineHeight: 28 }}>
              {p}
            </AppText>
          ))}
          <NestedBlocks lessonId={lessonId} level={level} blocks={content.blocks} />
          <ScriptureLinks entries={content.scripture} />
        </Reveal>
      ) : null}
    </Animated.View>
  );
}
