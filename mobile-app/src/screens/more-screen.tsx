import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { AppText, ScreenContainer, ScreenHeader, SectionHeader, LinkRow } from '@/components/ui';
import { SHARE_MESSAGE, SHARE_URL, buildShareText } from '@/config/share';
import { useBookmarks } from '@/features/bookmarks/bookmarks-provider';
import { LevelSelector } from '@/learning/level-selector';
import { useLearningLevel } from '@/learning/use-learning-level';
import { useTheme } from '@/theme';

/**
 * More: the secondary menu. Learning level (changing it never erases progress: completion and reading positions are stored per
 * lesson and level), Invite a Friend, saved items, About, Settings, Privacy and Terms.
 * Not here yet: Retake Assessment, because the assessment has no content or scoring defined (decision C-05).
 */
export function MoreScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const { level, setLevel } = useLearningLevel();
  const { items: saved } = useBookmarks();
  const [shareNote, setShareNote] = useState<string | null>(null);

  // The operating system's share sheet does the sharing: the app never sees or stores contacts.
  const invite = async () => {
    setShareNote(null);
    try {
      await Share.share({ message: buildShareText(SHARE_MESSAGE, SHARE_URL) });
    } catch {
      setShareNote('Sharing is not available on this device.');
    }
  };

  return (
    <ScreenContainer scroll>
      <ScreenHeader title="More" onBack={null} />
      <View style={{ gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
        <View style={{ gap: spacing.md }}>
          <SectionHeader title="Learning level" subtitle="Changes which lessons and content you see. Your progress is kept." />
          <LevelSelector value={level} onChange={setLevel} />
        </View>

        <View style={{ gap: spacing.md }}>
          <LinkRow
            title="Invite a Friend"
            description="Share Prophetic Destinations using your device's share options."
            onPress={() => void invite()}
          />
          {shareNote ? (
            <AppText variant="caption" color="textMuted" accessibilityLiveRegion="polite">
              {shareNote}
            </AppText>
          ) : null}
          <LinkRow title="Saved items" description={saved.length === 1 ? '1 saved item' : `${saved.length} saved items`} onPress={() => router.push('/saved')} />
          <LinkRow title="About" onPress={() => router.push('/about')} />
          <LinkRow title="Settings" description="Appearance and saved data." onPress={() => router.push('/settings')} />
          <LinkRow title="Privacy Policy" onPress={() => router.push('/privacy')} />
          <LinkRow title="Terms" onPress={() => router.push('/terms')} />
        </View>
      </View>
    </ScreenContainer>
  );
}
