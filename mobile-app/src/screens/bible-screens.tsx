import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, type ScrollView, Text, View } from 'react-native';

import { AppText, EmptyState, ErrorState, LinkRow, ScreenContainer, ScreenHeader, SecondaryButton } from '@/components/ui';
import { type DatasetIdentity, compareIdentity, verifyDatasetIdentity } from '@/features/scripture/dataset-identity';
import { BIBLE_ROUTES, adjacentChapter, checkReaderParams, describeLabelDifference, findBibleBook, listBibleBooks, parseReaderParams } from '@/features/scripture/bible-navigation';
import { bookName } from '@/features/scripture/books';
import { getScriptureAvailability } from '@/features/scripture/scripture-lookup';
import { readBibleLastRead, saveBibleLastRead } from '@/storage/preferences';
import { useTheme } from '@/theme';

/**
 * The Bible reader: books -> chapters -> reading (BIB-001..003, FLOW-04). It reads ONLY the Scripture data set bundled in the app
 * (features/scripture), so it needs no network and does not depend on any lesson having been opened. This repository bundles no data set yet
 * (licensing is unresolved), so today every screen here shows "The Bible text is not included yet": no book, chapter or verse is listed or
 * invented, and the navigation is ready for the approved data set the moment it is connected in scripture-data.ts.
 *
 * Reading shows the chapter's verses with their numbers and text exactly as supplied. Opened from a lesson ("Open in Bible"), the requested verse
 * range is marked (a left bar, a bold number, a text label and the screen-reader label, never colour alone) and scrolled into view. Moving between
 * chapters changes the route's parameters in place, so the stack stays [lesson, reader] and Back returns straight to the lesson that is still
 * mounted underneath (its reading position, quiz attempt and progress are untouched). The reader's translation and edition are always shown, and a
 * difference from the lesson's published data set is stated. Nothing here changes or re-stamps lesson content.
 * Not included (not required of this reader): search, bookmarks, notes, highlighting.
 */
function BibleUnavailable() {
  const availability = getScriptureAvailability();
  return (
    <EmptyState
      title="Bible text is not included yet"
      message={availability.available ? 'The Bible text could not be shown.' : `${availability.message} Lessons keep showing their own passages, and the Bible will open here once its text is included.`}
    />
  );
}

// ---------------------------------------------------------------------------------------------------------------------------- books

export function BibleBooksScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const books = listBibleBooks();
  const [last, setLast] = useState<{ bookId: string; chapter: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readBibleLastRead().then((value) => {
      if (!cancelled && value) setLast(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const lastBook = last ? findBibleBook(last.bookId) : null;
  const canContinue = last !== null && lastBook !== null && last.chapter >= 1 && last.chapter <= lastBook.chapters;

  return (
    <ScreenContainer scroll>
      <ScreenHeader title="Bible" />
      {books.length === 0 ? (
        <BibleUnavailable />
      ) : (
        <View style={{ gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
          {canContinue && last ? (
            <LinkRow
              title={`Continue reading: ${bookName(last.bookId)} ${last.chapter}`}
              onPress={() => router.push({ pathname: BIBLE_ROUTES.read, params: { bookId: last.bookId, chapter: String(last.chapter) } })}
            />
          ) : null}
          {books.map((book) => (
            <LinkRow
              key={book.id}
              title={book.name}
              description={book.chapters === 1 ? '1 chapter' : `${book.chapters} chapters`}
              onPress={() => router.push({ pathname: BIBLE_ROUTES.chapters, params: { bookId: book.id } })}
            />
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

// ------------------------------------------------------------------------------------------------------------------------ chapters

export function BibleChaptersScreen() {
  const router = useRouter();
  const { spacing, colors, radius, layout } = useTheme();
  const params = useLocalSearchParams<{ bookId?: string }>();
  const bookId = typeof params.bookId === 'string' ? params.bookId : '';
  const book = findBibleBook(bookId);

  if (listBibleBooks().length === 0) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Bible" />
        <BibleUnavailable />
      </ScreenContainer>
    );
  }
  if (!book) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Bible" />
        <ErrorState title="Book not found" message="That book is not in the Bible text." onRetry={() => router.replace(BIBLE_ROUTES.books)} />
      </ScreenContainer>
    );
  }
  return (
    <ScreenContainer scroll>
      <ScreenHeader title={book.name} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
        {Array.from({ length: book.chapters }, (_, index) => index + 1).map((chapter) => (
          <Pressable
            key={chapter}
            accessibilityRole="button"
            accessibilityLabel={`${book.name} chapter ${chapter}`}
            onPress={() => router.push({ pathname: BIBLE_ROUTES.read, params: { bookId: book.id, chapter: String(chapter) } })}
            style={({ pressed }) => ({
              minWidth: layout.touchTarget + spacing.sm,
              minHeight: layout.touchTarget + spacing.sm,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: spacing.sm,
              borderRadius: radius.md,
              borderWidth: layout.hairline,
              borderColor: colors.borderSubtle,
              backgroundColor: pressed ? colors.surfaceElevated : colors.surface,
            })}>
            <AppText variant="body">{chapter}</AppText>
          </Pressable>
        ))}
      </View>
    </ScreenContainer>
  );
}

// ------------------------------------------------------------------------------------------------------------------------- reading

/** The verified identity of the bundled text (null while it is being checked). Computed once, only when a lesson passage is opened. */
function useInstalledIdentity(enabled: boolean): DatasetIdentity | null {
  const [identity, setIdentity] = useState<DatasetIdentity | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void verifyDatasetIdentity().then((value) => {
      if (!cancelled) setIdentity(value);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return identity;
}

export function BibleReaderScreen() {
  const router = useRouter();
  const raw = useLocalSearchParams();
  const { spacing, colors, radius, typography } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const verseY = useRef<Record<number, number>>({});
  // Verse positions are relative to the list; the list and its column sit lower in the scroll content, so both offsets are added.
  const columnY = useRef(0);
  const listY = useRef(0);
  const scrolledFor = useRef<string | null>(null);

  const parsed = parseReaderParams(raw as Record<string, string | string[] | undefined>);
  const check = parsed ? checkReaderParams(parsed) : null;
  const identity = useInstalledIdentity(Boolean(parsed?.fromLesson && check?.ok));
  const key = parsed ? `${parsed.bookId}:${parsed.chapter}:${parsed.range?.startVerse ?? ''}` : '';

  // A new chapter starts at the top (and forgets the previous chapter's measured verse positions).
  useEffect(() => {
    verseY.current = {};
    scrolledFor.current = null;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [key]);

  const readerOk = check?.ok ? check : null;
  useEffect(() => {
    if (parsed && readerOk) void saveBibleLastRead({ bookId: parsed.bookId, chapter: parsed.chapter });
  }, [parsed, readerOk]);

  const targetStart = readerOk?.range?.startVerse ?? null;
  const scrollToTarget = useCallback(() => {
    if (targetStart === null || scrolledFor.current === key) return;
    const y = verseY.current[targetStart];
    if (y === undefined) return;
    scrolledFor.current = key;
    scrollRef.current?.scrollTo({ y: Math.max(0, columnY.current + listY.current + y - 16), animated: false });
  }, [targetStart, key]);

  const onVerseLayout = (verse: number) => (event: LayoutChangeEvent) => {
    verseY.current[verse] = event.nativeEvent.layout.y;
    if (verse === targetStart) scrollToTarget();
  };

  const goTo = (to: { bookId: string; chapter: number } | null) => {
    if (to) router.setParams({ bookId: to.bookId, chapter: String(to.chapter), startVerse: undefined, endVerse: undefined });
  };

  if (!parsed) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Bible" />
        <ErrorState title="This Bible location could not be opened" message="The link was not a valid book and chapter." onRetry={() => router.replace(BIBLE_ROUTES.books)} />
      </ScreenContainer>
    );
  }
  if (!check || !check.ok) {
    return (
      <ScreenContainer>
        <ScreenHeader title={`${bookName(parsed.bookId)} ${parsed.chapter}`} />
        {check?.reason === 'NO_DATASET' ? (
          <View style={{ gap: spacing.md }}>
            <BibleUnavailable />
            {parsed.fromLesson ? <SecondaryButton label="Back to lesson" onPress={() => router.back()} /> : null}
          </View>
        ) : (
          <ErrorState title="This chapter could not be found" message={check?.message ?? 'It is not in the Bible text.'} onRetry={() => router.replace(BIBLE_ROUTES.books)} />
        )}
      </ScreenContainer>
    );
  }

  const { chapter, range, rangeNote } = check;
  const previous = adjacentChapter({ bookId: parsed.bookId, chapter: parsed.chapter }, -1);
  const next = adjacentChapter({ bookId: parsed.bookId, chapter: parsed.chapter }, 1);
  const labelDifference = describeLabelDifference(parsed.source, chapter);
  // Text identity, decided by the content fingerprint only: same / different / could not be confirmed (never guessed from labels).
  const comparison = parsed.fromLesson && identity ? compareIdentity(parsed.source.fingerprint, identity) : null;
  const unknownReason = !parsed.source.fingerprint
    ? 'This passage was published before text fingerprints were recorded.'
    : identity?.status === 'unconfirmed'
      ? identity.reason
      : 'The installed text has no checksum to compare.';
  const title = `${bookName(parsed.bookId)} ${parsed.chapter}`;

  return (
    <ScreenContainer scroll scrollRef={scrollRef}>
      <ScreenHeader title={title} />
      <View
        onLayout={(e) => {
          columnY.current = e.nativeEvent.layout.y;
          scrollToTarget();
        }}
        style={{ gap: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xxl }}>
        <AppText variant="bodySmall" color="textMuted">
          {chapter.translation}, {chapter.edition} (version {chapter.version})
        </AppText>
        {parsed.fromLesson ? <SecondaryButton label="Back to lesson" onPress={() => router.back()} /> : null}
        {labelDifference ? (
          <View accessibilityRole="alert" style={{ padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderGold, backgroundColor: colors.surface }}>
            <AppText variant="bodySmall">{labelDifference}</AppText>
          </View>
        ) : null}
        {comparison === 'same' ? (
          <AppText variant="bodySmall" color="textMuted" accessibilityLiveRegion="polite">
            Text identity confirmed: this is the same text the lesson passage was published with.
          </AppText>
        ) : null}
        {comparison === 'different' ? (
          <View accessibilityRole="alert" style={{ padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderGold, backgroundColor: colors.surface }}>
            <AppText variant="bodySmall">
              Different text: the Bible text in this reader is not the same text the lesson passage was published with, so the wording may differ. The lesson keeps its own published passage.
            </AppText>
          </View>
        ) : null}
        {comparison === 'unknown' ? (
          <AppText variant="bodySmall" color="textMuted" accessibilityLiveRegion="polite">
            Text identity could not be confirmed. {unknownReason} The lesson keeps its own published passage.
          </AppText>
        ) : null}
        {rangeNote ? (
          <AppText variant="bodySmall" color="textSecondary" accessibilityLiveRegion="polite">
            {rangeNote}
          </AppText>
        ) : null}

        <View
          onLayout={(e) => {
            listY.current = e.nativeEvent.layout.y;
            scrollToTarget();
          }}
          style={{ gap: spacing.sm }}>
          {chapter.verses.map((v) => {
            const marked = range !== null && v.verse >= range.startVerse && v.verse <= range.endVerse;
            return (
              <View key={v.verse} onLayout={onVerseLayout(v.verse)} style={{ gap: 2 }}>
                {marked && v.verse === range?.startVerse ? (
                  <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700' }}>
                    Passage from the lesson: verse {range.startVerse}
                    {range.endVerse > range.startVerse ? ` to ${range.endVerse}` : ''}
                  </AppText>
                ) : null}
                <View
                  accessible
                  accessibilityLabel={`${marked ? 'From the lesson passage. ' : ''}Verse ${v.verse}. ${v.text}`}
                  style={{ flexDirection: 'row', gap: spacing.sm, borderLeftWidth: marked ? 4 : 0, borderLeftColor: colors.primaryHighlight, paddingLeft: marked ? spacing.sm : 0 }}>
                  <Text style={[typography.caption, { minWidth: 28, color: colors.primaryHighlight, fontWeight: marked ? '800' : '600' }]} importantForAccessibility="no" accessibilityElementsHidden>
                    {v.verse}
                  </Text>
                  <Text style={[typography.scripture, { flex: 1, color: colors.textPrimary }]}>{v.text}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          <SecondaryButton label="Previous chapter" disabled={!previous} onPress={() => goTo(previous)} style={{ flexGrow: 1 }} />
          <SecondaryButton label="Next chapter" disabled={!next} onPress={() => goTo(next)} style={{ flexGrow: 1 }} />
        </View>
        <SecondaryButton label="Chapters of this book" onPress={() => router.push({ pathname: BIBLE_ROUTES.chapters, params: { bookId: parsed.bookId } })} />
      </View>
    </ScreenContainer>
  );
}
