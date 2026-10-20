import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Share, View } from 'react-native';

import { AppText, ScreenContainer, ScreenHeader, SectionHeader, LinkRow } from '@/components/ui';
import { SHARE_MESSAGE, SHARE_URL, buildShareText } from '@/config/share';
import { useBookmarks } from '@/features/bookmarks/bookmarks-provider';
import { LevelSelector } from '@/learning/level-selector';
import { LEVEL_LABELS } from '@/learning/levels';
import { useLearningLevel } from '@/learning/use-learning-level';
import { readAssessmentResult } from '@/storage/preferences';
import type { StoredAssessmentResult } from '@/features/assessment/assessment-types';
import { useTheme } from '@/theme';

/**
 * More: the secondary menu. Learning level (changing it never erases progress: completion and reading positions are stored per
 * lesson and level), Invite a Friend, saved items, About, Settings, Privacy and Terms.
 * The optional placement assessment is offered here too ("Take" or "Retake"). It only suggests a level: the level changes only when the learner chooses it.
 */
export function MoreScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const { level, setLevel } = useLearningLevel();
  const { items: saved } = useBookmarks();
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [lastAssessment, setLastAssessment] = useState<StoredAssessmentResult | null>(null);

  // Shown again each time More comes into view, so a result completed from another screen is reflected.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      readAssessmentResult().then((stored) => {
        if (!cancelled) setLastAssessment(stored);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

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
          <LinkRow
            title={lastAssessment ? 'Retake the assessment' : 'Take the assessment'}
            description={lastAssessment ? `Last suggestion: ${LEVEL_LABELS[lastAssessment.recommendedLevel]}. Retaking never changes your level unless you choose it.` : 'A short, optional questionnaire that suggests a starting level.'}
            onPress={() => router.push('/assessment')}
          />
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
          <LinkRow title="Bible" description="Read the Bible by book and chapter." onPress={() => router.push('/bible')} />
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
