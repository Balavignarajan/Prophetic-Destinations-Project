import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { LessonImage } from '@/learning/lesson-image';
import { ScriptureLinks } from '@/learning/scripture-links';
import type { LearningLevel } from '@/learning/levels';
import { useTheme } from '@/theme';

/**
 * Renders a published TIMELINE block (backend/src/modules/lessons/domain/blocks/timeline.ts; PROPOSED schema):
 *   { heading?: string, events: [{ id, dateLabel, title, explanation, mediaId?, altText?, caption?, source? }] }
 * Events are shown in exactly the author's order, as a numbered vertical list; the number (and the spoken "Event n of m"), not the
 * line or a colour, carries the order. `dateLabel` is plain display text, never parsed or sorted. An event's image is shown beneath
 * its text with the same image component as lesson images (saved offline copy when there is one, otherwise the learner media route);
 * if the image fails, only the image falls back to its description: the event text is unaffected. An event's Scripture passages (frozen in
 * the snapshot) open from buttons under it, apart from the explanation; a malformed passage affects only itself.
 *
 * Nothing is skipped quietly. The publisher refuses malformed timelines, so if any event is malformed or incomplete anyway, the WHOLE
 * timeline is replaced by a short "not available" message (a partial list would look like a complete timeline). The rest of the
 * lesson is unaffected.
 */
type Event = { id: string; dateLabel: string; title: string; explanation: string; image: Record<string, unknown> | null; scripture: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** All events, or null when the content cannot be shown completely and correctly. */
function readEvents(content: Record<string, unknown>): Event[] | null {
  if (!Array.isArray(content.events) || content.events.length === 0) return null;
  const events: Event[] = [];
  const seen = new Set<string>();
  for (const raw of content.events) {
    if (!isRecord(raw)) return null;
    const id = asText(raw.id);
    const event = { id, dateLabel: asText(raw.dateLabel), title: asText(raw.title), explanation: asText(raw.explanation) };
    if (!id || seen.has(id) || !event.dateLabel || !event.title || !event.explanation) return null;
    seen.add(id);
    const mediaId = asText(raw.mediaId);
    events.push({
      ...event,
      image: mediaId ? { mediaId, altText: asText(raw.altText), caption: asText(raw.caption), source: asText(raw.source) } : null,
      // Frozen Scripture passages are validated one by one when opened, so a bad passage never hides a valid event.
      scripture: raw.scripture,
    });
  }
  return events;
}

export function TimelineContent({ lessonId, level, content }: { lessonId: string; level: LearningLevel; content: Record<string, unknown> }) {
  const { spacing, colors, radius } = useTheme();
  const events = readEvents(content);

  if (!events) {
    return (
      <View style={{ gap: spacing.xs, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface }}>
        <AppText variant="label" color="warning">
          Timeline not available
        </AppText>
        <AppText variant="bodySmall" color="textSecondary" accessibilityLiveRegion="polite">
          This lesson has a timeline that could not be shown completely, so it is hidden rather than shown with events missing. The rest of the lesson is not
          affected.
        </AppText>
      </View>
    );
  }
  const heading = asText(content.heading);

  return (
    <View style={{ gap: spacing.md }} accessible={false}>
      <AppText variant="heading" accessibilityRole="header">
        {heading || 'Timeline'}
      </AppText>
      <View style={{ gap: spacing.md }}>
        {events.map((event, index) => (
          <View key={event.id} style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ alignItems: 'center' }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.borderGold, alignItems: 'center', justifyContent: 'center' }}>
                <AppText variant="caption" color="primaryHighlight" style={{ fontWeight: '700' }}>
                  {index + 1}
                </AppText>
              </View>
              {index < events.length - 1 ? <View style={{ flex: 1, width: 2, marginTop: 2, backgroundColor: colors.borderSubtle, borderRadius: radius.sm }} /> : null}
            </View>
            <View style={{ flex: 1, gap: spacing.sm, paddingBottom: spacing.sm }}>
              <View
                accessible
                accessibilityLabel={`Event ${index + 1} of ${events.length}. ${event.dateLabel}. ${event.title}. ${event.explanation}`}
                style={{ gap: spacing.xs }}>
                <AppText variant="label" color="primaryHighlight">
                  {event.dateLabel}
                </AppText>
                <AppText variant="body" style={{ fontWeight: '700' }}>
                  {event.title}
                </AppText>
                <AppText variant="bodySmall" color="textSecondary">
                  {event.explanation}
                </AppText>
              </View>
              {event.image ? <LessonImage lessonId={lessonId} level={level} content={event.image} /> : null}
              <ScriptureLinks entries={event.scripture} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
