import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { LessonImage } from '@/learning/lesson-image';
import type { LearningLevel } from '@/learning/levels';
import { ScriptureLinks } from '@/learning/scripture-links';
import { useTheme } from '@/theme';

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
    <View style={{ gap: spacing.xs, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface }}>
      <AppText variant="label" color="warning">
        {what} not available
      </AppText>
      <AppText variant="bodySmall" color="textSecondary" accessibilityLiveRegion="polite">
        This part of the lesson could not be shown. The rest of the lesson is not affected.
      </AppText>
    </View>
  );
}

function Part({ label, children }: { label: string; children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label" color="textSecondary" accessibilityRole="header">
        {label}
      </AppText>
      {children}
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  const { spacing, colors, radius } = useTheme();
  return (
    <View style={{ gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderGold, backgroundColor: colors.surface }}>{children}</View>
  );
}

export function WordStudyBlock({ content }: { content: Record<string, unknown> }) {
  const english = asText(content.englishWord);
  const original = asText(content.originalWord);
  const transliteration = asText(content.transliteration);
  const strong = asText(content.strongNumber);
  const definition = asText(content.definition);
  if (!english || !original || !definition) return <Unavailable what="Word study" />;
  const references = Array.isArray(content.references) ? content.references : [];

  return (
    <Card>
      <View style={{ gap: 4 }}>
        <AppText variant="label" color="primaryHighlight">
          Word study
        </AppText>
        <AppText variant="heading" accessibilityRole="header">
          {english}
        </AppText>
        <AppText variant="title" style={{ writingDirection: 'auto' }}>
          {original}
        </AppText>
        {transliteration ? <AppText variant="body">{transliteration}</AppText> : null}
        {strong ? (
          <AppText variant="caption" color="textMuted">
            Strong number: {strong}
          </AppText>
        ) : null}
      </View>
      <Part label="Definition">
        <AppText variant="body">{definition}</AppText>
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
    </Card>
  );
}

export function SymbolStudyBlock({ lessonId, level, content }: { lessonId: string; level: LearningLevel; content: Record<string, unknown> }) {
  const symbol = asText(content.symbol);
  const meaning = asText(content.meaning);
  const explanation = asText(content.explanation);
  if (!symbol || !meaning || !explanation) return <Unavailable what="Symbol study" />;
  const image = isRecord(content.image) && asText(content.image.mediaId) ? { mediaId: asText(content.image.mediaId), altText: asText(content.image.altText) } : null;
  const references = Array.isArray(content.references) ? content.references : [];

  return (
    <Card>
      <View style={{ gap: 4 }}>
        <AppText variant="label" color="primaryHighlight">
          Symbol study
        </AppText>
        <AppText variant="heading" accessibilityRole="header">
          {symbol}
        </AppText>
      </View>
      {image ? <LessonImage lessonId={lessonId} level={level} content={image} /> : null}
      {content.primaryPassage !== undefined ? (
        <Part label="Primary passage">
          <ScriptureLinks entries={single(content.primaryPassage)} />
        </Part>
      ) : null}
      <Part label="Meaning">
        <AppText variant="body">{meaning}</AppText>
      </Part>
      {content.definitionPassage !== undefined ? (
        <Part label="Passage that defines it">
          <ScriptureLinks entries={single(content.definitionPassage)} />
        </Part>
      ) : null}
      <Part label="Explanation">
        <AppText variant="body">{explanation}</AppText>
      </Part>
      {references.length > 0 ? (
        <Part label="Related references">
          <ScriptureLinks entries={references} />
        </Part>
      ) : null}
    </Card>
  );
}
