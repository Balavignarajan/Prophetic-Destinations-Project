import { Text, View } from 'react-native';

import { AccentRule, AppText, BlockFrame, BlockNotice, Reveal } from '@/components/ui';
import { LessonImage } from '@/learning/lesson-image';
import type { LearningLevel } from '@/learning/levels';
import { ScriptureLinks } from '@/learning/scripture-links';
import { useTheme } from '@/theme';
import { motion } from '@/theme/motion';

/**
 * Renders published WORD_STUDY and SYMBOL_STUDY blocks (backend/src/modules/lessons/domain/blocks/word-symbol.ts; PROPOSED schemas):
 *   WORD_STUDY:   { englishWord, originalWord, transliteration, strongNumber?, definition, verse, references? }
 *   SYMBOL_STUDY: { symbol, image?: { mediaId, altText }, primaryPassage, meaning, definitionPassage?, explanation, references? }
 * Scripture fields are the FROZEN passages of the snapshot (a single passage for verse / primary passage / defining passage, a list for references),
 * shown through ScriptureLinks from the lesson itself, offline. They sit under their own labels, apart from the AUTHOR's text, which is labelled
 * as such (definition, meaning, explanation). The original-language word is shown exactly as stored with automatic text direction, so Greek and
 * Hebrew read correctly. Nothing is added or looked up. A malformed passage shows the "not available" card for that passage only; if the block's
 * essential text is missing the block shows a short "not available" note and the rest of the lesson is unaffected. Long text and large fonts wrap.
 */
const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
/** A single frozen passage as the list ScriptureLinks expects (nothing when the field is absent). */
const single = (value: unknown): unknown[] => (value === undefined || value === null ? [] : [value]);

function Unavailable({ what }: { what: string }) {
  const { spacing, colors, radius } = useTheme();
  return (
    <BlockNotice title={`${what} not available`} message="This part of the lesson could not be shown. The rest of the lesson is not affected." />
  );
}

function Part({ label, children }: { label: string; children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="bodySmall" color="textMuted" accessibilityRole="header" style={{ fontWeight: '600' }}>
        {label}
      </AppText>
      {children}
    </View>
  );
}

export function WordStudyBlock({ content }: { content: Record<string, unknown> }) {
  const { colors, typography, fontFamilies } = useTheme();
  const english = asText(content.englishWord);
  const original = asText(content.originalWord);
  const transliteration = asText(content.transliteration);
  const strong = asText(content.strongNumber);
  const definition = asText(content.definition);
  if (!english || !original || !definition) return <Unavailable what="Word study" />;
  const references = Array.isArray(content.references) ? content.references : [];

  return (
    <Reveal offset={motion.offset.subtle}>
    <BlockFrame variant="interactive">
      <View style={{ gap: 4 }}>
        <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700' }}>
          Word study
        </AppText>
        <AppText variant="heading" accessibilityRole="header">
          {english}
        </AppText>
        <AccentRule />
        {/* The original word uses the device's own font (no custom face), so Greek and Hebrew letters always draw correctly. */}
        <Text style={{ color: colors.textBright, fontSize: 34, lineHeight: 46, writingDirection: 'auto' }}>{original}</Text>
        {transliteration ? (
          <Text style={[typography.scripture, { color: colors.textSecondary, fontFamily: fontFamilies.serifItalic }]}>{transliteration}</Text>
        ) : null}
        {strong ? (
          <AppText variant="bodySmall" color="textMuted">
            Strong number: {strong}
          </AppText>
        ) : null}
      </View>
      <Part label="Definition">
        <AppText variant="body" style={{ fontSize: 17, lineHeight: 27 }}>
          {definition}
        </AppText>
      </Part>
      {content.verse !== undefined ? (
        <Part label="Verse">
          <ScriptureLinks entries={single(content.verse)} />
        </Part>
      ) : null}
      {references.length > 0 ? (
        <Part label="References">
          <ScriptureLinks entries={references} />
        </Part>
      ) : null}
    </BlockFrame>
    </Reveal>
  );
}

export function SymbolStudyBlock({ lessonId, level, content }: { lessonId: string; level: LearningLevel; content: Record<string, unknown> }) {
  const { colors } = useTheme();
  const symbol = asText(content.symbol);
  const meaning = asText(content.meaning);
  const explanation = asText(content.explanation);
  if (!symbol || !meaning || !explanation) return <Unavailable what="Symbol study" />;
  const image = isRecord(content.image) && asText(content.image.mediaId) ? { mediaId: asText(content.image.mediaId), altText: asText(content.image.altText) } : null;
  const references = Array.isArray(content.references) ? content.references : [];

  return (
    <Reveal offset={motion.offset.subtle}>
    <BlockFrame variant="interactive">
      <View style={{ gap: 4 }}>
        <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700' }}>
          Symbol study
        </AppText>
        <AppText variant="sectionHeading" accessibilityRole="header">
          {symbol}
        </AppText>
        <AccentRule />
      </View>
      {image ? <LessonImage lessonId={lessonId} level={level} content={image} /> : null}
      {content.primaryPassage !== undefined ? (
        <Part label="Primary passage">
          <ScriptureLinks entries={single(content.primaryPassage)} />
        </Part>
      ) : null}
      {/* what the symbol means: the clearest line of the block, set apart with a gold rule */}
      <View style={{ gap: 4, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: colors.primary }}>
        <AppText variant="bodySmall" color="textMuted" accessibilityRole="header" style={{ fontWeight: '600' }}>
          Meaning
        </AppText>
        <AppText variant="body" style={{ fontSize: 18, lineHeight: 27, fontWeight: '600' }}>
          {meaning}
        </AppText>
      </View>
      {content.definitionPassage !== undefined ? (
        <Part label="Passage that defines it">
          <ScriptureLinks entries={single(content.definitionPassage)} />
        </Part>
      ) : null}
      <Part label="Explanation">
        <AppText variant="body" style={{ fontSize: 17, lineHeight: 27 }}>
          {explanation}
        </AppText>
      </Part>
      {references.length > 0 ? (
        <Part label="Related references">
          <ScriptureLinks entries={references} />
        </Part>
      ) : null}
    </BlockFrame>
    </Reveal>
  );
}
