import { Linking, View } from 'react-native';

import { AppText, SecondaryButton } from '@/components/ui';
import { LessonImage } from '@/learning/lesson-image';
import type { LearningLevel } from '@/learning/levels';
import { useTheme } from '@/theme';

/**
 * Renders a published HISTORICAL_EVIDENCE block (backend/src/modules/lessons/domain/blocks/historical-evidence.ts; PROPOSED schema):
 *   { title, dateLabel, explanation, quote?, source: { citation, url? }, image?: { mediaId, altText, caption?, credit? } }
 * Three kinds of text are kept visibly apart: the author's EXPLANATION (plain), the QUOTED source text (set off as a "Source quotation" in ordinary quotation styling, with a neutral border
 * and the normal text face, so it is never mistaken for a Bible passage card), and the SOURCE attribution (always shown, in text, so it stays readable offline or when the website is unavailable). The source
 * link is labelled as external, opens only http(s) addresses in the system browser, and is never downloaded for offline use. An image
 * uses the same image component as lesson images (saved copy when there is one); if it fails only the image falls back.
 *
 * Nothing is presented as complete when it is not: the publisher refuses incomplete evidence, so if a required part (title, date, explanation,
 * source) is missing or the structure is malformed, the WHOLE block is replaced by a short "not available" message. The rest of the lesson is
 * unaffected.
 */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

function safeHttpUrl(value: string): string | null {
  if (!/^https?:\/\//i.test(value) || /\s/.test(value)) return null;
  return value;
}

function readEvidence(content: Record<string, unknown>) {
  const source = content.source;
  if (!isRecord(source)) return null;
  if (content.image !== undefined && !isRecord(content.image)) return null;
  const title = asText(content.title);
  const dateLabel = asText(content.dateLabel);
  const explanation = asText(content.explanation);
  const citation = asText(source.citation);
  if (!title || !dateLabel || !explanation || !citation) return null;
  const rawUrl = asText(source.url);
  const image = isRecord(content.image) && asText(content.image.mediaId) ? content.image : null;
  return {
    title,
    dateLabel,
    explanation,
    citation,
    quote: asText(content.quote),
    url: rawUrl ? safeHttpUrl(rawUrl) : null,
    image: image
      ? { mediaId: asText(image.mediaId), altText: asText(image.altText), caption: asText(image.caption), source: asText(image.credit) }
      : null,
  };
}

export function EvidenceBlock({ lessonId, level, content }: { lessonId: string; level: LearningLevel; content: Record<string, unknown> }) {
  const { spacing, colors, radius } = useTheme();
  const evidence = readEvidence(content);

  if (!evidence) {
    return (
      <View style={{ gap: spacing.xs, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface }}>
        <AppText variant="label" color="warning">
          Historical evidence not available
        </AppText>
        <AppText variant="bodySmall" color="textSecondary" accessibilityLiveRegion="polite">
          This evidence could not be shown completely, so it is hidden rather than shown with parts missing. The rest of the lesson is not affected.
        </AppText>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.md }} accessible={false}>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" color="primaryHighlight">
          {evidence.dateLabel}
        </AppText>
        <AppText variant="heading" accessibilityRole="header">
          {evidence.title}
        </AppText>
      </View>

      <AppText variant="body" color="textSecondary">
        {evidence.explanation}
      </AppText>

      {evidence.quote ? (
        <View
          accessible
          accessibilityLabel={`Source quotation: ${evidence.quote}`}
          style={{ gap: spacing.xs, padding: spacing.lg, borderRadius: radius.md, borderLeftWidth: 4, borderLeftColor: colors.border, backgroundColor: colors.surface }}>
          <AppText variant="caption" color="textMuted" style={{ textTransform: 'uppercase' }}>
            Source quotation
          </AppText>
          <AppText variant="body" style={{ fontStyle: 'italic' }}>
            {evidence.quote}
          </AppText>
        </View>
      ) : null}

      {evidence.image ? <LessonImage lessonId={lessonId} level={level} content={evidence.image} /> : null}

      <View style={{ gap: spacing.sm }}>
        <AppText variant="bodySmall" color="textSecondary">
          Source: {evidence.citation}
        </AppText>
        {evidence.url ? (
          <SecondaryButton
            label="Open the source website (external link)"
            accessibilityHint="Opens a website outside this app. It needs an internet connection."
            onPress={() => {
              void Linking.openURL(evidence.url as string).catch(() => undefined);
            }}
          />
        ) : null}
      </View>
    </View>
  );
}
