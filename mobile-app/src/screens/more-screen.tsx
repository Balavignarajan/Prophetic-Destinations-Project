import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Share, View } from 'react-native';

import { AppText, Card, LinkGroup, LinkRow, PageHeading, ScreenContainer, ScreenSection } from '@/components/ui';
import { SHARE_MESSAGE, SHARE_URL, buildShareText } from '@/config/share';
import { useBookmarks } from '@/features/bookmarks/bookmarks-provider';
import { getScriptureAvailability } from '@/features/scripture/scripture-lookup';
import { LevelSelector } from '@/learning/level-selector';
import { LEVEL_LABELS } from '@/learning/levels';
import { useLearningLevel } from '@/learning/use-learning-level';
import { readAssessmentResult } from '@/storage/preferences';
import type { StoredAssessmentResult } from '@/features/assessment/assessment-types';
import { useTheme } from '@/theme';

/**
 * More: the secondary menu, in four groups. Learning level (changing it never erases progress: completion and reading positions are stored per
 * lesson and level), the optional placement assessment, saved items, the Bible, Settings, Invite a Friend, About, Privacy and Terms.
 * The assessment is offered here too ("Take" or "Retake"). It only suggests a level: the level changes only when the learner chooses it.
 */
export function MoreScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const { level, setLevel } = useLearningLevel();
  const { items: saved } = useBookmarks();
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [lastAssessment, setLastAssessment] = useState<StoredAssessmentResult | null>(null);
  const bibleAvailable = getScriptureAvailability().available;

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
      <View style={{ gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
        <PageHeading title="More" description="Your learning level, saved items and app information." />

        <ScreenSection title="Your learning">
          <Card>
            <View style={{ gap: spacing.md }}>
              <View style={{ gap: spacing.xs }}>
                <AppText variant="body" style={{ fontWeight: '600' }}>
                  Learning level
                </AppText>
                <AppText variant="bodySmall" color="textSecondary">
                  Changes which lessons and content you see. Your progress is kept.
                </AppText>
              </View>
              <LevelSelector value={level} onChange={setLevel} />
            </View>
          </Card>
          <LinkGroup>
            <LinkRow
              title={lastAssessment ? 'Retake the assessment' : 'Take the assessment'}
              description={lastAssessment ? `Last suggestion: ${LEVEL_LABELS[lastAssessment.recommendedLevel]}. Retaking never changes your level unless you choose it.` : 'A short, optional questionnaire that suggests a starting level.'}
              onPress={() => router.push('/assessment')}
            />
            <LinkRow title="Saved items" description={saved.length === 1 ? '1 saved item' : `${saved.length} saved items`} onPress={() => router.push('/saved')} />
          </LinkGroup>
        </ScreenSection>

        <ScreenSection title="Reading">
          <LinkGroup>
            <LinkRow
              title="Bible"
              description={bibleAvailable ? 'Read the Bible by book and chapter.' : 'The Bible text is not included in this version of the app yet.'}
              onPress={() => router.push('/bible')}
            />
          </LinkGroup>
        </ScreenSection>

        <ScreenSection title="App">
          <LinkGroup>
            <LinkRow title="Settings" description="Appearance and saved data." onPress={() => router.push('/settings')} />
            <LinkRow
              title="Invite a Friend"
              description="Share Prophetic Destinations using your device's share options."
              onPress={() => void invite()}
            />
          </LinkGroup>
          {shareNote ? (
            <AppText variant="bodySmall" color="textMuted" accessibilityLiveRegion="polite">
              {shareNote}
            </AppText>
          ) : null}
        </ScreenSection>

        <ScreenSection title="About">
          <LinkGroup>
            <LinkRow title="About" onPress={() => router.push('/about')} />
            <LinkRow title="Privacy Policy" onPress={() => router.push('/privacy')} />
            <LinkRow title="Terms" onPress={() => router.push('/terms')} />
          </LinkGroup>
        </ScreenSection>
      </View>
    </ScreenContainer>
  );
}
