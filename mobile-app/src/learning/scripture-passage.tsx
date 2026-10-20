import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { AppText, SecondaryButton } from '@/components/ui';
import { bibleReadHref, referenceFromFrozen } from '@/features/scripture/bible-navigation';
import { getScriptureAvailability } from '@/features/scripture/scripture-lookup';
import { useTheme } from '@/theme';

/**
 * Renders a published SCRIPTURE_PASSAGE block (backend/src/modules/lessons/domain/blocks/scripture-passage.ts; PROPOSED schema). The
 * lesson snapshot FREEZES the passage when it is published:
 *   { reference, display, commentary?, source: { id, translation, edition, version }, verses: [{ verse, text }] }
 * so it is shown from the lesson itself, offline through the normal lesson cache, and never re-read from any other data set or edition.
 * The Scripture sits in its own bordered card (reference, verses in order, then which translation and edition it is); the author's
 * commentary comes after it, labelled, so the two are never confused. Text wraps for long passages and large fonts.
 * If the frozen passage is missing or malformed, only a short "not available" message is shown: no partial passage, and the rest of the
 * lesson is unaffected. This is NOT the full offline Bible (a separate requirement).
 *
 * OPEN IN BIBLE (BLK-004, BIB-003, FLOW-04): the card carries an "Open in Bible" action, shared by passage blocks and by every nested Scripture link
 * (they all render this card). It passes the STRUCTURED reference stored in the frozen passage ({ bookId, chapter, startVerse, endVerse }), never the
 * display label, plus the published data set identity so the reader can say when its text differs. It pushes the reader onto the stack above the
 * lesson, so Back returns to this same, still-mounted lesson (reading position, quiz attempt and progress untouched). It never changes the frozen
 * passage. If the app has no Bible text bundled, the action is disabled and says why, and the frozen passage stays fully readable; with a malformed
 * reference there is no action at all.
 */
type Verse = { verse: number; text: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

function readPassage(content: Record<string, unknown>) {
  const display = asText(content.display);
  const source = isRecord(content.source) ? content.source : null;
  if (!display || !source || !Array.isArray(content.verses) || content.verses.length === 0) return null;
  const verses: Verse[] = [];
  for (const raw of content.verses) {
    if (!isRecord(raw) || typeof raw.verse !== 'number' || !Number.isInteger(raw.verse) || !asText(raw.text)) return null;
    verses.push({ verse: raw.verse, text: asText(raw.text) });
  }
  const translation = asText(source.translation);
  if (!translation) return null;
  return {
    display,
    verses,
    translation,
    edition: asText(source.edition),
    commentary: asText(content.commentary),
    reference: referenceFromFrozen(content.reference),
    published: {
      id: asText(source.id) || undefined,
      version: asText(source.version) || undefined,
      translation,
      edition: asText(source.edition) || undefined,
      fingerprint: asText(source.fingerprint) || undefined,
    },
  };
}

export function ScripturePassage({ content }: { content: Record<string, unknown> }) {
  const { spacing, colors, radius, typography } = useTheme();
  const router = useRouter();
  const passage = readPassage(content);
  const bible = getScriptureAvailability();

  if (!passage) {
    return (
      <View style={{ gap: spacing.xs, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface }}>
        <AppText variant="label" color="warning">
          Scripture passage not available
        </AppText>
        <AppText variant="bodySmall" color="textSecondary" accessibilityLiveRegion="polite">
          This passage could not be shown, so nothing is shown in its place. The rest of the lesson is not affected.
        </AppText>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.sm, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderGold, backgroundColor: colors.surface }}>
        <AppText variant="label" color="primaryHighlight" accessibilityRole="header">
          {passage.display}
        </AppText>
        <Text style={[typography.scripture, { color: colors.textPrimary }]} accessibilityLabel={`${passage.display}. ${passage.verses.map((v) => `Verse ${v.verse}. ${v.text}`).join(' ')}`}>
          {passage.verses.map((v) => `${passage.verses.length > 1 ? `${v.verse} ` : ''}${v.text}`).join(' ')}
        </Text>
        <AppText variant="caption" color="textMuted">
          {passage.translation}
          {passage.edition ? `, ${passage.edition}` : ''}
        </AppText>
        {passage.reference ? (
          <View style={{ gap: spacing.xs }}>
            <SecondaryButton
              label={`Open ${passage.display} in the Bible`}
              disabled={!bible.available}
              onPress={() => passage.reference && router.push(bibleReadHref(passage.reference, passage.published))}
            />
            {!bible.available ? (
              <AppText variant="caption" color="textMuted" accessibilityLiveRegion="polite">
                The Bible is not included in this version of the app yet. This passage stays here as published.
              </AppText>
            ) : null}
          </View>
        ) : null}
      </View>
      {passage.commentary ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="caption" color="textMuted" style={{ textTransform: 'uppercase' }}>
            Author commentary
          </AppText>
          <AppText variant="body" color="textSecondary">
            {passage.commentary}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
