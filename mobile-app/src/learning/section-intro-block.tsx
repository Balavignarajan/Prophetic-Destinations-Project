import { View } from 'react-native';

import { AppText, BlockNotice } from '@/components/ui';
import { LessonImage } from '@/learning/lesson-image';
import type { LearningLevel } from '@/learning/levels';
import { useTheme } from '@/theme';

/**
 * Renders a published SECTION_INTRO block (backend/src/modules/lessons/domain/blocks/section-callout.ts; PROPOSED schema):
 *   { title, subtitle?, image?: { mediaId, altText } }
 * A major transition in the lesson: the title is a real heading (read as one by screen readers), the optional subtitle follows it, then the
 * optional picture (the same image component as lesson images: saved copy when there is one, a quiet fallback if it fails). Nothing is numbered
 * and nothing is navigable or counted for completion. A block without a usable title shows a short "not available" note instead of an empty
 * heading; the rest of the lesson is unaffected.
 */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function SectionIntroBlock({ lessonId, level, content }: { lessonId: string; level: LearningLevel; content: Record<string, unknown> }) {
  const { spacing, colors } = useTheme();
  const title = asText(content.title);
  const imageOk = content.image === undefined || (isRecord(content.image) && Boolean(asText(content.image.mediaId)));

  if (!title || !imageOk) {
    return (
      <BlockNotice title="Section heading not available" message="This section heading could not be shown. The rest of the lesson is not affected." />
    );
  }
  const subtitle = asText(content.subtitle);
  const image = isRecord(content.image) ? { mediaId: asText(content.image.mediaId), altText: asText(content.image.altText) } : null;

  return (
    <View style={{ gap: spacing.md, paddingTop: spacing.xl }} accessible={false}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 40, height: 2, backgroundColor: colors.primary }} />
      <AppText variant="sectionHeading" accessibilityRole="header">
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="subtitle" color="textSecondary">
          {subtitle}
        </AppText>
      ) : null}
      {image ? <LessonImage lessonId={lessonId} level={level} content={image} /> : null}
    </View>
  );
}
