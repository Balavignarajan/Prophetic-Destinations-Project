import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, type ScrollView, Text, View } from 'react-native';

import { AppText, Card, EmptyState, ErrorState, LinkRow, ScreenContainer, ScreenHeader, ScreenSection, SecondaryButton } from '@/components/ui';
import { type DatasetIdentity, compareIdentity, verifyDatasetIdentity } from '@/features/scripture/dataset-identity';
import {
  BIBLE_ROUTES,
  type BibleBook,
  adjacentChapter,
  checkReaderParams,
  describeLabelDifference,
  findBibleBook,
  listBibleBooks,
  parseReaderParams,
} from '@/features/scripture/bible-navigation';
import { bookName } from '@/features/scripture/books';
import { BUNDLED_SCRIPTURE, BUNDLED_SCRIPTURE_NOTICE } from '@/features/scripture/scripture-data';
import { getScriptureAvailability } from '@/features/scripture/scripture-lookup';
import { readBibleLastRead, saveBibleLastRead } from '@/storage/preferences';
import { useTheme } from '@/theme';

/**
 * The Bible reader: books -> chapters -> reading (BIB-001..003, FLOW-04). It reads ONLY the Scripture data set bundled in the app
 * (features/scripture), so it needs no network and does not depend on any lesson having been opened. The bundled text is a community-maintained
 * transcription that is not yet verified or approved for release; the book list says so, and carries its attribution and licence notice. If a build ever
 * has no data set, every screen here shows "The Bible text is not included yet": no book, chapter or verse is listed or invented.
 *
 * Reading shows the chapter's verses with their numbers and text exactly as supplied. Opened from a lesson ("Open in Bible"), the requested verse
 * range is marked (a left bar, a bold number, a text label and the screen-reader label, never colour alone) and scrolled into view. Moving between
 * chapters changes the route's parameters in place, so the stack stays [lesson, reader] and Back returns straight to the lesson that is still
 * mounted underneath (its reading position, quiz attempt and progress are untouched). The reader's translation and edition are always shown, and a
 * difference from the lesson's published data set is stated. Nothing here changes or re-stamps lesson content.
 *
 * The book list groups the 66 books as the Old Testament (39) and the New Testament (27), in canonical order, and starts with "Search the Bible" (bible-search-screen.tsx)
 * and "Continue reading". The reader also opens verses chosen in that search (`from=search`: the verse is marked as "Selected", and "Back to search" returns to the results).
 * "Continue reading" remembers where the learner reads in the Bible: opening a passage from a lesson does not replace that place unless the reader goes on to another
 * chapter, while going to a reference or a search result on purpose does.
 * Not included (not required of this reader): bookmarks, notes, highlighting.
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

/**
 * What this text is and where it comes from, at the end of the book list: its translation and edition labels, that it is a community transcription not yet
 * verified against a printed edition, the attribution, and (on request) the full MIT licence notice that must accompany the data.
 */
function AboutThisText() {
  const { spacing } = useTheme();
  const [showLicence, setShowLicence] = useState(false);
  if (!BUNDLED_SCRIPTURE) return null;
  const { translation, edition, version } = BUNDLED_SCRIPTURE.metadata;
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <AppText variant="bodySmall" style={{ fontWeight: '700' }}>
          About this text
        </AppText>
        <AppText variant="bodySmall" color="textSecondary">
          {translation}, {edition} (version {version})
        </AppText>
        <AppText variant="bodySmall" color="textSecondary">
          {BUNDLED_SCRIPTURE_NOTICE.review}
        </AppText>
        <AppText variant="bodySmall" color="textSecondary">
          {BUNDLED_SCRIPTURE_NOTICE.attribution}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showLicence ? 'Hide the licence notice' : 'Show the licence notice'}
          accessibilityState={{ expanded: showLicence }}
          onPress={() => setShowLicence((open) => !open)}
          style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '600' }}>
            {showLicence ? 'Hide licence notice' : 'Show licence notice'}
          </AppText>
        </Pressable>
        {showLicence ? (
          <AppText variant="caption" color="textMuted" selectable>
            {BUNDLED_SCRIPTURE_NOTICE.licenseText}
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}

/** One testament's books, in canonical order, under its own heading (the 66 books are grouped as 39 + 27). */
function TestamentSection({ title, books }: { title: string; books: BibleBook[] }) {
  const router = useRouter();
  const { spacing } = useTheme();
  if (books.length === 0) return null;
  return (
    <ScreenSection title={title} description={books.length === 1 ? '1 book' : `${books.length} books`}>
      <View style={{ gap: spacing.sm }}>
        {books.map((book) => (
          <LinkRow
            key={book.id}
            title={book.name}
            description={book.chapters === 1 ? '1 chapter' : `${book.chapters} chapters`}
            onPress={() => router.push({ pathname: BIBLE_ROUTES.chapters, params: { bookId: book.id } })}
          />
        ))}
      </View>
    </ScreenSection>
  );
}

export function BibleBooksScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const books = listBibleBooks();
  const [last, setLast] = useState<{ bookId: string; chapter: number } | null>(null);

  // The saved place is read again each time this list comes back into view, so "Continue reading" follows what was read meanwhile.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void readBibleLastRead().then((value) => {
        if (!cancelled && value) setLast(value);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const lastBook = last ? findBibleBook(last.bookId) : null;
  const canContinue = last !== null && lastBook !== null && last.chapter >= 1 && last.chapter <= lastBook.chapters;

  return (
    <ScreenContainer scroll>
      <ScreenHeader title="Bible" />
      {books.length === 0 ? (
        <BibleUnavailable />
      ) : (
        <View style={{ gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
          <View style={{ gap: spacing.sm }}>
            <LinkRow title="Search the Bible" description="Find a verse by its reference or by a word." onPress={() => router.push(BIBLE_ROUTES.search)} />
            {canContinue && last ? (
              <LinkRow
                title={`Continue reading: ${bookName(last.bookId)} ${last.chapter}`}
                onPress={() => router.push({ pathname: BIBLE_ROUTES.read, params: { bookId: last.bookId, chapter: String(last.chapter) } })}
              />
            ) : null}
          </View>
          <TestamentSection title="Old Testament" books={books.filter((book) => book.testament === 'OT')} />
          <TestamentSection title="New Testament" books={books.filter((book) => book.testament === 'NT')} />
          <AboutThisText />
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
  // Verse positions are relative to the list; the list and its column sit lower in the scroll content, so both offsets are added. They are only trusted once BOTH have been
  // measured (a child's layout can be reported before its parents'), and a position is worked out again whenever any of them moves.
  const columnY = useRef(0);
  const listY = useRef(0);
  const measured = useRef({ column: false, list: false });
  // Where the view was last scrolled to for the marked verse, and whether the reader has taken over the scrolling since.
  const lastTarget = useRef<number | null>(null);
  const readerScrolled = useRef(false);
  // The reader moved on within the Bible (previous/next chapter), so this is now their own reading and not just a look at a passage a lesson pointed to.
  const [browsed, setBrowsed] = useState(false);

  const parsed = parseReaderParams(raw as Record<string, string | string[] | undefined>);
  const check = parsed ? checkReaderParams(parsed) : null;
  const identity = useInstalledIdentity(Boolean(parsed?.fromLesson && check?.ok));
  const key = parsed ? `${parsed.bookId}:${parsed.chapter}:${parsed.range?.startVerse ?? ''}` : '';

  // Moving to another chapter in this same screen (previous/next) starts at the top and forgets the previous chapter's measured verse positions and any scrolling done
  // in it. The first render needs none of that (a screen opened for a verse starts clean), and must not wipe what its first layout has already reported.
  const settledKey = useRef(key);
  useEffect(() => {
    if (settledKey.current === key) return;
    settledKey.current = key;
    verseY.current = {};
    lastTarget.current = null;
    readerScrolled.current = false;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [key]);

  // "Continue reading" remembers where the learner reads in the Bible. Looking at a passage a LESSON pointed to does not replace that place (until the reader moves on from it);
  // going to a reference or a search result on purpose does.
  const readerOk = check?.ok ? check : null;
  const rememberPlace = readerOk !== null && (!parsed?.fromLesson || browsed);
  const placeBook = parsed?.bookId;
  const placeChapter = parsed?.chapter;
  useEffect(() => {
    if (rememberPlace && placeBook !== undefined && placeChapter !== undefined) void saveBibleLastRead({ bookId: placeBook, chapter: placeChapter });
  }, [rememberPlace, placeBook, placeChapter]);

  const targetStart = readerOk?.range?.startVerse ?? null;
  const scrollToTarget = useCallback(() => {
    if (targetStart === null || readerScrolled.current || !measured.current.column || !measured.current.list) return;
    const y = verseY.current[targetStart];
    if (y === undefined) return;
    const top = Math.max(0, columnY.current + listY.current + y - 16);
    if (lastTarget.current !== null && Math.abs(lastTarget.current - top) < 2) return;
    lastTarget.current = top;
    // A verse near the end of a long chapter asks for more than the content can scroll; the scroll view stops at its end.
    scrollRef.current?.scrollTo({ y: top, animated: false });
  }, [targetStart]);

  const onVerseLayout = (verse: number) => (event: LayoutChangeEvent) => {
    verseY.current[verse] = event.nativeEvent.layout.y;
    if (verse === targetStart) scrollToTarget();
  };

  const goTo = (to: { bookId: string; chapter: number } | null) => {
    if (!to) return;
    setBrowsed(true);
    router.setParams({ bookId: to.bookId, chapter: String(to.chapter), startVerse: undefined, endVerse: undefined });
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
    <ScreenContainer
      scroll
      scrollRef={scrollRef}
      scrollEvents={{
        // once the reader drags the page themselves, the reader stops moving the view to the marked verse
        onScrollEndDrag: () => {
          readerScrolled.current = true;
        },
      }}>
      <ScreenHeader title={title} />
      <View
        onLayout={(e) => {
          columnY.current = e.nativeEvent.layout.y;
          measured.current.column = true;
          scrollToTarget();
        }}
        style={{ gap: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xxl }}>
        <AppText variant="bodySmall" color="textMuted">
          {chapter.translation}, {chapter.edition} (version {chapter.version})
        </AppText>
        {parsed.fromLesson ? <SecondaryButton label="Back to lesson" onPress={() => router.back()} /> : null}
        {parsed.fromSearch ? <SecondaryButton label="Back to search" onPress={() => router.back()} /> : null}
        {labelDifference ? (
          <View accessibilityRole="alert" style={{ padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderGold, backgroundColor: colors.surface }}>
            <AppText variant="bodySmall">{labelDifference}</AppText>
          </View>
        ) : null}
        {parsed.fromLesson && identity === null ? (
          <AppText variant="bodySmall" color="textMuted" accessibilityLiveRegion="polite">
            Checking that this is the same text the lesson passage was published with…
          </AppText>
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
            measured.current.list = true;
            scrollToTarget();
          }}
          style={{ gap: spacing.sm }}>
          {chapter.verses.map((v) => {
            const marked = range !== null && v.verse >= range.startVerse && v.verse <= range.endVerse;
            const markedLabel = parsed.fromLesson ? 'Passage from the lesson: ' : 'Selected: ';
            return (
              // keyed by chapter too, so a verse view is never reused for another chapter (its position is reported afresh)
              <View key={`${key}:${v.verse}`} onLayout={onVerseLayout(v.verse)} style={{ gap: 2 }}>
                {marked && v.verse === range?.startVerse ? (
                  <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700' }}>
                    {markedLabel}
                    {range.endVerse > range.startVerse ? `verses ${range.startVerse} to ${range.endVerse}` : `verse ${range.startVerse}`}
                  </AppText>
                ) : null}
                <View
                  accessible
                  accessibilityLabel={`${marked ? (parsed.fromLesson ? 'From the lesson passage. ' : 'Selected verse. ') : ''}Verse ${v.verse}. ${v.text}`}
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
