import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import {
  AppText,
  Card,
  ChevronIcon,
  Divider,
  EmptyState,
  LoadingState,
  ScreenContainer,
  ScreenHeader,
  ScreenSection,
  SecondaryButton,
} from '@/components/ui';
import { type Bookmark } from '@/features/bookmarks/model';
import { useBookmarks } from '@/features/bookmarks/bookmarks-provider';
import { useDaniel2Lesson } from '@/features/daniel-2/use-daniel2-lesson';
import { type OwnerStatus, mediaOwnerKey, useOfflineMedia } from '@/features/offline/offline-media';
import { useCacheEntries } from '@/features/offline/use-cache-entries';
import { formatSavedAt } from '@/features/offline/offline-banner';
import { LEVEL_LABELS } from '@/learning/levels';
import { useTheme } from '@/theme';

/** Only a lesson whose images are all on the device is called saved; an older complete copy is not called the latest. */
function savedLabel(status: OwnerStatus): string {
  switch (status) {
    case 'complete':
      return 'Saved for offline reading';
    case 'saving':
      return 'Text saved. Saving images…';
    case 'updating':
      return 'Older version saved for offline reading. Saving the newest version…';
    case 'update-failed':
      return 'Older version saved for offline reading. The newest version' + '’s images are not saved yet.';
    default:
      return 'Text saved. Some images aren' + '’t saved yet; open the lesson online to save them.';
  }
}

/** Everything the learner has saved: published lessons and scenes of the built-in Daniel 2 lesson, newest first. Kept on this device only. */
export function SavedScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const { items, ready, remove } = useBookmarks();
  const [daniel] = useDaniel2Lesson();
  const cached = useCacheEntries();
  const offlineMedia = useOfflineMedia();
  const sceneTitles = daniel.status === 'success' ? new Map(daniel.data.scenes.map((scene) => [scene.id as string, scene.title])) : null;

  const lessons = items.filter((item) => item.type === 'lesson');
  const scenes = items.filter((item) => item.type === 'daniel2-scene');

  const row = (item: Bookmark) => {
    const lessonSaved = item.type === 'lesson' && cached.some((entry) => entry.kind === 'lesson' && entry.id === item.lessonId && entry.level === item.level);
    const sceneGone = item.type === 'daniel2-scene' && sceneTitles !== null && !sceneTitles.has(item.sceneId);
    const unavailable = item.type === 'lesson' && item.unavailableSince !== undefined;
    const title = item.type === 'daniel2-scene' ? (sceneTitles?.get(item.sceneId) ?? item.title) : item.title;
    const kind = item.type === 'lesson' ? `Lesson · ${LEVEL_LABELS[item.level]} level` : 'Daniel 2 preview · scene';
    const status = unavailable
      ? `No longer available (checked ${formatSavedAt(item.unavailableSince!)})`
      : sceneGone
        ? 'This scene is no longer in the lesson'
        : lessonSaved
          ? savedLabel(offlineMedia.status(mediaOwnerKey('lesson', item.lessonId, item.level)))
          : null;

    const open = () => {
      if (item.type === 'lesson') router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: item.lessonId, level: item.level } });
      else router.push({ pathname: '/daniel-2-lesson', params: { scene: item.sceneId } });
    };

    return (
      <Card key={item.id}>
        <View style={{ gap: spacing.md }}>
          {/* Opening and removing are separate targets: the whole top part opens, and the quiet Remove button sits apart below it. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${kind}: ${title}${status ? `. ${status}` : ''}`}
            disabled={sceneGone}
            onPress={open}
            style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700' }}>
                {kind}
              </AppText>
              <AppText variant="heading">{title}</AppText>
              {status ? (
                <AppText variant="bodySmall" color={unavailable || sceneGone ? 'warning' : 'textMuted'}>
                  {status}
                </AppText>
              ) : null}
            </View>
            {sceneGone ? null : <ChevronIcon direction="right" color="primaryHighlight" />}
          </Pressable>
          <Divider />
          <SecondaryButton
            size="medium"
            tone="danger"
            label="Remove"
            accessibilityLabel={`Remove saved item: ${title}`}
            onPress={() => remove(item.id)}
            style={{ alignSelf: 'flex-end' }}
          />
        </View>
      </Card>
    );
  };

  return (
    <ScreenContainer scroll>
      <ScreenHeader title="Saved" />
      <View style={{ gap: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xxl }}>
        <AppText variant="body" color="textSecondary">
          Lessons you star are kept here, on this device, so you can find them again.
        </AppText>

        {!ready ? <LoadingState message="Loading saved items…" /> : null}

        {ready && items.length === 0 ? (
          <EmptyState
            variant="card"
            title="Nothing saved yet"
            message="Tap the star on a lesson or a Daniel 2 scene to keep it here. Saved items stay on this device."
            action={{ label: 'Browse courses', onPress: () => router.replace('/learn') }}
          />
        ) : null}

        {lessons.length > 0 ? <ScreenSection title="Lessons">{lessons.map(row)}</ScreenSection> : null}

        {scenes.length > 0 ? <ScreenSection title="Interactive preview">{scenes.map(row)}</ScreenSection> : null}
      </View>
    </ScreenContainer>
  );
}
