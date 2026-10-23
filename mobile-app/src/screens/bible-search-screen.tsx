import { useRouter } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { AppText, Card, EmptyState, LinkGroup, LinkRow, LoadingState, ScreenContainer, ScreenHeader, SecondaryButton } from '@/components/ui';
import { BIBLE_ROUTES, bibleOpenHref } from '@/features/scripture/bible-navigation';
import { checkBibleReference, parseBibleReference } from '@/features/scripture/bible-reference';
import { type BibleHit, type PreparedQuery, type SearchCursor, describeHit, prepareQuery, searchBible, warmSearchIndex } from '@/features/scripture/bible-search';
import { bookName } from '@/features/scripture/books';
import { getScriptureAvailability } from '@/features/scripture/scripture-lookup';
import { useTheme } from '@/theme';

/**
 * Bible search (BIB-006): find a verse by its REFERENCE ("John 3:16", "Daniel 2", "Rev 22:21") or by WORDS ("kingdom", "Son of man"). Everything runs on the device against the
 * bundled text (features/scripture/bible-search.ts and bible-reference.ts): no network, backend, database or service, so it works offline.
 *
 * One box serves both. Text that reads as a reference is checked against the Bible text itself and, if it exists, offered as one row that opens the existing reader at that
 * chapter or verse; if it does not (Daniel 13, John 3:99) or is ambiguous (Jud), the reason is said and nothing is opened. A book's name alone also offers its chapter
 * list. Anything else is searched as words, whole words and phrases, ignoring capitals, in Bible order, a page at a time ("Show more" carries on without starting
 * over). Each result shows its reference and a short piece of the verse with the matched words marked; a tap opens the reader at that verse (the same route as every other
 * link, marked as a search result). The reader is pushed on top of this screen, so Back returns here with the query and the results as they were.
 *
 * Typing is debounced, a search that is no longer wanted stops and its late answer is ignored, and the list is virtualised, so large result sets stay light.
 */
const DEBOUNCE_MS = 250;
const PAGE_SIZE = 40;
const MAX_QUERY_LENGTH = 100;

const quoted = (text: string) => `“${text}”`;

type Results = { key: string; hits: BibleHit[]; next: SearchCursor | null; loadingMore: boolean };

export function BibleSearchScreen() {
  const router = useRouter();
  const { spacing, colors, radius, layout, typography } = useTheme();
  const available = getScriptureAvailability().available;
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const moreToken = useRef(0);
  const latestKey = useRef('');

  // The query is applied a moment after typing stops (or at once on "search").
  useEffect(() => {
    const timer = setTimeout(() => setApplied(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // The indexes of the books are built in the background while the reader types, so the first search is not the one that pays for them.
  useEffect(() => {
    let stale = false;
    void warmSearchIndex(() => stale);
    return () => {
      stale = true;
    };
  }, []);

  const attempt = parseBibleReference(applied);
  const reference = attempt.kind === 'reference' ? checkBibleReference(attempt) : null;
  // A reference that exists, or one that cannot be opened, is not also searched as words; a book name alone is both.
  const keyword: PreparedQuery | null = attempt.kind === 'reference' || attempt.kind === 'invalid' ? null : prepareQuery(applied);
  const keywordKey = keyword?.needle ?? '';

  const runSearch = useEffectEvent((isStale: () => boolean) => {
    if (!keyword) return;
    const key = keyword.needle;
    void searchBible(keyword, null, PAGE_SIZE, isStale).then((page) => {
      if (page && !isStale()) setResults({ key, hits: page.hits, next: page.next, loadingMore: false });
    });
  });
  useEffect(() => {
    latestKey.current = keywordKey;
    if (keywordKey === '') return;
    let stale = false;
    runSearch(() => stale);
    return () => {
      stale = true;
    };
  }, [keywordKey]);

  // Results are only shown for the query they were found for; while the next ones are being found nothing from an older query is left on screen.
  const current = keyword !== null && results !== null && results.key === keyword.needle ? results : null;
  const searching = keyword !== null && current === null;

  const loadMore = () => {
    if (!keyword || !current || !current.next || current.loadingMore) return;
    const key = keyword.needle;
    const token = (moreToken.current += 1);
    setResults({ ...current, loadingMore: true });
    void searchBible(keyword, current.next, PAGE_SIZE, () => moreToken.current !== token || latestKey.current !== key).then((page) => {
      if (!page) return;
      setResults((previous) => (previous && previous.key === key ? { key, hits: [...previous.hits, ...page.hits], next: page.next, loadingMore: false } : previous));
    });
  };

  const submit = () => {
    setApplied(query);
    const typed = parseBibleReference(query);
    if (typed.kind !== 'reference') return;
    const check = checkBibleReference(typed);
    if (check.ok) router.push(bibleOpenHref(check));
  };

  return (
    <ScreenContainer>
      <ScreenHeader title="Search the Bible" />
      <View style={{ gap: spacing.md, paddingTop: spacing.sm, flex: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: radius.lg,
            borderWidth: layout.hairline,
            borderColor: colors.borderSubtle,
            backgroundColor: colors.surface,
            paddingLeft: spacing.md,
          }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={submit}
            placeholder="A reference or words, such as John 3:16"
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.primary}
            accessibilityLabel="Search the Bible by reference or by words"
            accessibilityHint="For example John 3:16, Daniel 2, or the word kingdom"
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoFocus
            maxLength={MAX_QUERY_LENGTH}
            editable={available}
            style={[typography.body, { flex: 1, color: colors.textPrimary, minHeight: layout.touchTarget, paddingVertical: spacing.sm }]}
          />
          {query.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear the search"
              onPress={() => {
                setQuery('');
                setApplied('');
              }}
              style={{ minHeight: layout.touchTarget, minWidth: layout.touchTarget, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm }}>
              <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '600' }}>
                Clear
              </AppText>
            </Pressable>
          ) : null}
        </View>

        {!available ? (
          <EmptyState title="Bible text is not included yet" message="The Bible can be searched once its text is included in the app." />
        ) : applied.trim() === '' ? (
          <AppText variant="bodySmall" color="textSecondary">
            Type a reference, like John 3:16 or Psalm 23, or words to find, like {quoted('kingdom')} or {quoted('Son of man')}. Words are matched as whole words, ignoring capitals.
          </AppText>
        ) : (
          <>
            {attempt.kind === 'invalid' ? (
              <AppText variant="body" color="warning" accessibilityLiveRegion="polite">
                {attempt.message}
              </AppText>
            ) : null}
            {reference && !reference.ok ? (
              <AppText variant="body" color="warning" accessibilityLiveRegion="polite">
                {reference.message}
              </AppText>
            ) : null}
            {reference && reference.ok ? (
              <LinkGroup>
                <LinkRow
                  title={`Open ${reference.label}`}
                  description={reference.startVerse === null ? 'Go to this chapter in the Bible.' : 'Go straight to this verse in the Bible.'}
                  onPress={() => router.push(bibleOpenHref(reference))}
                />
              </LinkGroup>
            ) : null}
            {attempt.kind === 'book' ? (
              <LinkGroup>
                <LinkRow
                  title={`Open ${attempt.name}`}
                  description="Choose a chapter."
                  onPress={() => router.push({ pathname: BIBLE_ROUTES.chapters, params: { bookId: attempt.bookId } })}
                />
              </LinkGroup>
            ) : null}

            {searching ? <LoadingState message="Searching…" /> : null}
            {keyword && current && current.hits.length === 0 && attempt.kind !== 'book' ? (
              <EmptyState title="No verses found" message={`Nothing matched ${quoted(keyword.label)}. Try another word or phrase, or check the spelling.`} />
            ) : null}
            {keyword && current && current.hits.length > 0 ? (
              <FlatList
                style={{ flex: 1 }}
                data={current.hits}
                keyExtractor={(hit) => `${hit.bookId}.${hit.chapter}.${hit.verse}`}
                renderItem={({ item }) => (
                  <ResultRow
                    hit={item}
                    query={keyword}
                    onOpen={() => router.push(bibleOpenHref({ bookId: item.bookId, chapter: item.chapter, startVerse: item.verse, endVerse: item.verse }))}
                  />
                )}
                ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
                ListFooterComponent={
                  <View style={{ gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
                    <AppText variant="bodySmall" color="textMuted" accessibilityLiveRegion="polite">
                      {current.next
                        ? `Showing the first ${current.hits.length} verses.`
                        : `${current.hits.length} ${current.hits.length === 1 ? 'verse' : 'verses'} found.`}
                    </AppText>
                    {current.next ? <SecondaryButton label={current.loadingMore ? 'Searching…' : 'Show more results'} disabled={current.loadingMore} onPress={loadMore} /> : null}
                  </View>
                }
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={9}
              />
            ) : null}
          </>
        )}
      </View>
    </ScreenContainer>
  );
}

/** One result: the reference, then a short piece of the verse with the matched words in the accent colour (and bolder, so colour is not the only cue). */
function ResultRow({ hit, query, onOpen }: { hit: BibleHit; query: PreparedQuery; onOpen: () => void }) {
  const { spacing, colors, fontFamilies } = useTheme();
  const parts = describeHit(hit.text, query);
  const reference = `${bookName(hit.bookId)} ${hit.chapter}:${hit.verse}`;
  return (
    <Card onPress={onOpen} accessibilityLabel={`${reference}. ${parts.map((part) => part.text).join('')} Opens the Bible at this verse.`}>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700' }}>
          {reference}
        </AppText>
        <AppText variant="body">
          {parts.map((part, index) =>
            part.match ? (
              <Text key={index} style={{ color: colors.primaryHighlight, fontFamily: fontFamilies.sansSemiBold }}>
                {part.text}
              </Text>
            ) : (
              <Text key={index}>{part.text}</Text>
            ),
          )}
        </AppText>
      </View>
    </Card>
  );
}
