import { View } from 'react-native';

import type { HomeEntryItem } from '@/api/types';
import { AppText, Card, ChevronIcon } from '@/components/ui';
import { CoverImage, courseCoverUrl, homeEntryImageUrl } from '@/learning/cover-image';
import { LEVEL_LABELS, type LearningLevel } from '@/learning/levels';
import { useTheme } from '@/theme';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** What a topic holds, in words: "3 courses · 12 lessons". */
export const topicCountsLine = (entry: Pick<HomeEntryItem, 'courseCount' | 'lessonCount'>) => `${plural(entry.courseCount, 'course')} · ${plural(entry.lessonCount, 'lesson')}`;

/** The picture a topic shows: its own when the administrators chose one, otherwise the cover of its first course that has one, otherwise none (then the card is plain). */
export function homeCardImage(entry: HomeEntryItem, level: LearningLevel): { mediaId: string; uri: string | null } | null {
  if (entry.imageMediaId) return { mediaId: entry.imageMediaId, uri: homeEntryImageUrl(entry.entryId, entry.imageMediaId, level) };
  if (entry.coverMediaId && entry.coverCourseId) return { mediaId: entry.coverMediaId, uri: courseCoverUrl(entry.coverCourseId, entry.coverMediaId, level) };
  return null;
}

/**
 * The topics on Home, exactly as the administrators set them up in the CMS: whatever titles, however many, in their order. `entries` is the list the server returned for this level,
 * so every topic has at least one published course to list (a disabled entry, or one whose courses are all drafts, unpublished or without lessons at this level, is never in it). The
 * cards wrap onto as many rows as they need and grow with their text, so nothing is clipped however many there are. A card is the whole button: it opens the topic's course list
 * (`onOpen`), and a course there opens the usual course screen. Keys are the entries' own ids.
 */
export function HomeEntryCards({ entries, level, onOpen }: { entries: readonly HomeEntryItem[]; level: LearningLevel; onOpen: (entry: HomeEntryItem) => void }) {
  const { radius, spacing } = useTheme();
  const levelName = LEVEL_LABELS[level];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
      {entries.map((entry) => {
        const image = homeCardImage(entry, level);
        const counts = topicCountsLine(entry);
        return (
          <Card
            key={entry.entryId}
            variant="elevated"
            onPress={() => onOpen(entry)}
            accessibilityLabel={`${entry.title}. ${entry.description ? `${entry.description}. ` : ''}${counts} at the ${levelName} level. Show the courses.`}
            style={{ flexGrow: 1, flexBasis: 150, padding: 0 }}>
            {/* The picture runs edge to edge; the clipping is in an inner layer so the card's own shadow is not cut off. */}
            <View style={{ borderRadius: radius.lg, overflow: 'hidden' }}>
              {image ? <CoverImage mediaId={image.mediaId} uri={image.uri} width="100%" aspectRatio={16 / 9} flush /> : null}
              <View style={{ padding: spacing.lg, gap: spacing.sm }}>
                <AppText variant="heading" numberOfLines={3}>
                  {entry.title}
                </AppText>
                {entry.description ? (
                  <AppText variant="bodySmall" color="textSecondary" numberOfLines={3}>
                    {entry.description}
                  </AppText>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
                  <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '600', flexShrink: 1 }}>
                    {counts}
                  </AppText>
                  <ChevronIcon direction="right" color="primaryHighlight" />
                </View>
              </View>
            </View>
          </Card>
        );
      })}
    </View>
  );
}
