import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useResource } from '@/api/use-resource';
import { AppText } from '@/components/ui';
import { loadRelated } from '@/features/offline/offline-api';
import { CoverImage, lessonCoverUrl } from '@/learning/cover-image';
import type { RelatedLessonItem } from '@/api/types';
import type { LearningLevel } from '@/learning/levels';
import { useTheme } from '@/theme';

/**
 * "Related lessons": the lessons the author chose to follow this one, limited by the server to those that can be opened at this level right
 * now (a draft, unpublished or deleted target is not listed at all). Nothing is shown while loading, if the list cannot be loaded, or if it is
 * empty, so there is never an empty heading. Opening a related lesson PUSHES it on top of this one, so Back returns here with the reading
 * position and progress intact; if the target has meanwhile become unavailable, the lesson screen says so and offers Back.
 *
 * The list is kept with the other saved copies and is cleared, expired and removed with them, but it does not mean the target lessons are saved:
 * a lesson that is not saved on this device needs a connection, and the note under the list says so. The list is bound to the exact publication
 * (`contentHash`) of the lesson on screen: a list fetched for another version is never shown. Nothing is downloaded for the related lessons, and nothing here recommends anything.
 *
 * Each link shows the author's custom label when there is one (plain text, frozen with the source publication; the server returns it only for a
 * link that is permitted at this level AND whose target is open-able), otherwise the target's published title. Links the author hid at this level
 * are already left out by the server. A saved list from before labels existed has no `label` and simply shows titles, as before. When a label
 * is shown, the target's real title stays visible beneath it so the learner can tell where the link leads.
 */
const labelOf = (item: { label?: string | null }) => (typeof item.label === 'string' && item.label.trim() ? item.label.trim() : null);

export function RelatedLessons({ lessonId, level, contentHash }: { lessonId: string; level: LearningLevel; contentHash: string }) {
  const [related] = useResource(`lesson-related:${lessonId}:${level}`, (signal) => loadRelated(lessonId, level, signal));
  if (related.status !== 'success') return null;
  // The list belongs to ONE publication of this lesson. If the lesson on screen is another one (for example an older saved version while a
  // newer one is still being saved), the list is not shown at all rather than attach links from a different version.
  if (related.data.value.contentHash !== contentHash) return null;
  return <RelatedLessonCards lessons={related.data.value.lessons} level={level} heading="Related lessons" />;
}

/**
 * The cards of a list of deliverable lessons, shared by the lesson's "Related lessons" and by Continue Exploring blocks (two separate lists that
 * only share this presentation). Nothing is shown for an empty list, so there is never an empty heading.
 */
export function RelatedLessonCards({ lessons, level, heading, listNote }: { lessons: RelatedLessonItem[]; level: LearningLevel; heading: string; listNote?: string }) {
  const router = useRouter();
  const { spacing, colors, radius, layout } = useTheme();
  if (lessons.length === 0) return null;

  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="heading" accessibilityRole="header">
        {heading}
      </AppText>      <View style={{ gap: spacing.sm }}>
        {lessons.map((item) => (
          <Pressable
            key={item.lessonId}
            accessibilityRole="button"
            accessibilityLabel={`Related lesson: ${labelOf(item) ?? item.title}.${labelOf(item) ? ` Lesson: ${item.title}.` : ''}${item.subtitle ? ` ${item.subtitle}.` : ''}`}
            onPress={() => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: item.lessonId, level } })}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              minHeight: layout.touchTarget + spacing.md,
              padding: spacing.md,
              borderRadius: radius.md,
              borderWidth: layout.hairline,
              borderColor: colors.borderSubtle,
              backgroundColor: pressed ? colors.surfaceElevated : colors.surface,
            })}>
            {item.coverMediaId ? <CoverImage mediaId={item.coverMediaId} uri={lessonCoverUrl(item.lessonId, item.coverMediaId, level)} width={56} height={40} /> : null}
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="body">{labelOf(item) ?? item.title}</AppText>
              {labelOf(item) ? (
                <AppText variant="caption" color="textMuted">
                  Lesson: {item.title}
                </AppText>
              ) : null}
              {item.subtitle ? (
                <AppText variant="bodySmall" color="textSecondary">
                  {item.subtitle}
                </AppText>
              ) : null}
            </View>
          </Pressable>
        ))}
      </View>
      {listNote ? (
        <AppText variant="caption" color="textMuted">
          {listNote}
        </AppText>
      ) : null}
      <AppText variant="caption" color="textMuted">
        A related lesson is available offline only if it is saved on this device. Otherwise it needs an internet connection.
      </AppText>
    </View>
  );
}
