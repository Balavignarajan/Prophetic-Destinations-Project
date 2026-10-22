import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { AppText, BlockFrame, BlockNotice, SecondaryButton } from '@/components/ui';
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
 *
 * PRESENTATION: `embedded` draws the same passage without its own card, for use INSIDE another block (a hotspot panel, a word study, a summary):
 * the same reference, text and translation, set off by the gold rule alone, so a passage inside a block is not a box inside a box.
 * A passage that names its reference but carries NO verse text (`verses` absent or empty) is shown by `ScriptureReference`: just the reference, never an
 * empty quotation and never a claim that the Bible is installed. Anything else that is malformed keeps showing the "not available" message.
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

/** A passage that names its reference but has no verse text to show (`verses` absent or empty). Null for anything else, including a malformed passage. */
function readReferenceOnly(content: Record<string, unknown>) {
  const display = asText(content.display);
  const withoutText = content.verses === undefined || (Array.isArray(content.verses) && content.verses.length === 0);
  if (!display || !withoutText) return null;
  const source = isRecord(content.source) ? content.source : null;
  return {
    display,
    reference: referenceFromFrozen(content.reference),
    published: source
      ? { id: asText(source.id) || undefined, version: asText(source.version) || undefined, translation: asText(source.translation) || undefined, edition: asText(source.edition) || undefined, fingerprint: asText(source.fingerprint) || undefined }
      : undefined,
  };
}

/** True when `ScriptureReference` (rather than the passage card) is the right way to show this frozen passage. */
export const isReferenceOnly = (content: Record<string, unknown>) => readPassage(content) === null && readReferenceOnly(content) !== null;

export function ScripturePassage({ content, embedded = false }: { content: Record<string, unknown>; embedded?: boolean }) {
  const { spacing, colors, typography, fontFamilies } = useTheme();
  const router = useRouter();
  const passage = readPassage(content);
  const bible = getScriptureAvailability();

  if (!passage) {
    return (
      <BlockNotice title="Scripture passage not available" message="This passage could not be shown, so nothing is shown in its place. The rest of the lesson is not affected." />
    );
  }

  const multiple = passage.verses.length > 1;
  const body = (
    <>
      <AppText variant="label" color="primaryHighlight" accessibilityRole="header">
        {passage.display}
      </AppText>
      <Text
        style={[typography.scripture, { color: colors.textBright, fontSize: 20, lineHeight: 32 }]}
        accessibilityLabel={`${passage.display}. ${passage.verses.map((v) => `Verse ${v.verse}. ${v.text}`).join(' ')}`}>
        {passage.verses.map((v, index) => (
          <Text key={v.verse}>
            {multiple ? <Text style={{ color: colors.primaryHighlight, fontFamily: fontFamilies.sansSemiBold, fontSize: 13 }}>{v.verse} </Text> : null}
            {v.text}
            {index < passage.verses.length - 1 ? ' ' : ''}
          </Text>
        ))}
      </Text>
      <AppText variant="caption" color="textMuted">
        {passage.translation}
        {passage.edition ? `, ${passage.edition}` : ''}
      </AppText>
      {/* Only offered when the Bible text is in the app; when it is not, the passage simply stands on its own. */}
      {passage.reference && bible.available ? (
        <SecondaryButton
          size="small"
          label={`Open ${passage.display} in the Bible`}
          style={{ alignSelf: 'flex-start' }}
          onPress={() => passage.reference && router.push(bibleReadHref(passage.reference, passage.published))}
        />
      ) : null}
    </>
  );
  return (
    <View style={{ gap: spacing.lg }}>
      {/* Scripture: a calm surface with a single antique-gold rule on its leading edge (alone, when it sits inside another block). The text is exactly the published passage. */}
      {embedded ? (
        <View style={{ gap: spacing.md, paddingLeft: spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.primary }}>{body}</View>
      ) : (
        <BlockFrame
          variant="scripture"
          style={{ borderWidth: 0, borderLeftWidth: 3, borderLeftColor: colors.primary, gap: spacing.md, paddingVertical: spacing.lg, paddingHorizontal: spacing.xl }}>
          {body}
        </BlockFrame>
      )}
      {passage.commentary ? (
        <View style={{ gap: spacing.xs, paddingHorizontal: spacing.xs }}>
          <AppText variant="bodySmall" color="textMuted" style={{ fontWeight: '600' }}>
            Author commentary
          </AppText>
          <AppText variant="body" color="textSecondary" style={{ fontSize: 17, lineHeight: 28 }}>
            {passage.commentary}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

/**
 * A frozen passage that has a reference but no verse text: the reference alone, set off by the gold rule like a passage, with "Open in the Bible" only when
 * the Bible text is really in the app. Nothing is quoted, nothing is looked up and nothing is suggested about the text.
 */
export function ScriptureReference({ content }: { content: Record<string, unknown> }) {
  const { spacing, colors } = useTheme();
  const router = useRouter();
  const bible = getScriptureAvailability();
  const named = readReferenceOnly(content);
  if (!named) return null;
  const { display, reference, published } = named;
  return (
    <View style={{ gap: spacing.sm, paddingLeft: spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.borderGold }}>
      <AppText variant="label" color="primaryHighlight" accessibilityLabel={`Scripture reference: ${display}`}>
        {display}
      </AppText>
      {reference && bible.available ? (
        <SecondaryButton
          size="small"
          label={`Open ${display} in the Bible`}
          style={{ alignSelf: 'flex-start' }}
          onPress={() => router.push(bibleReadHref(reference, published))}
        />
      ) : null}
    </View>
  );
}
