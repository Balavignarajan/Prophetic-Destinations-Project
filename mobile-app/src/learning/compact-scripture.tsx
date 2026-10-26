import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui';
import { getScriptureAvailability } from '@/features/scripture/scripture-lookup';
import { ScripturePassage, bibleLocationOf, isReferenceOnly } from '@/learning/scripture-passage';
import { useTheme } from '@/theme';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A quiet outlined action of a Scripture card: a 44-point touch target, a label that says what it does, an expanded/disabled state for screen readers. */
function CardAction({ label, accessibilityLabel, expanded, onPress }: { label: string; accessibilityLabel: string; expanded?: boolean; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderGold,
        backgroundColor: pressed ? colors.surfaceElevated : colors.transparent,
      })}>
      <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '600' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * One Scripture reference of a hotspot as a compact card: the reference, and two actions, "Read Passage" (the frozen published passage opens inside the card, and can be closed again)
 * and "Open in Bible" (the app's existing Bible reader at that reference). The passage text is the lesson's own frozen copy, drawn by the existing passage component, so it works offline and is
 * never re-read from anywhere else; nothing is invented here. A reference without verse text offers only "Open in Bible" (the existing reference-only presentation), and "Open in Bible" is
 * offered only when the Bible text is really in the app. An entry that is malformed says so inside "Read Passage" like it does everywhere else, and never shows a broken action.
 */
function CompactScriptureCard({ entry }: { entry: unknown }) {
  const { colors, radius, spacing } = useTheme();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const record = isRecord(entry) ? entry : {};
  // A reference that carries no verse text has nothing to "read": its card offers only the Bible.
  const referenceOnly = isReferenceOnly(record);
  const location = bibleLocationOf(record);
  const named = typeof record.display === 'string' && record.display.trim() ? record.display.trim() : '';
  const label = location?.display ?? (named || 'Scripture passage');
  const bible = getScriptureAvailability();
  return (
    <View
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: colors.surface,
      }}>
      <AppText variant="caption" color="textMuted" style={{ fontWeight: '700', letterSpacing: 1 }}>
        SCRIPTURE REFERENCE
      </AppText>
      <AppText variant="body" color="primaryHighlight" style={{ fontWeight: '600' }} accessibilityLabel={`Scripture reference: ${label}`}>
        {label}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {referenceOnly ? null : (
          <CardAction
            label={open ? 'Hide Passage' : 'Read Passage'}
            accessibilityLabel={`${open ? 'Hide' : 'Read'} the passage ${label}`}
            expanded={open}
            onPress={() => setOpen((current) => !current)}
          />
        )}
        {/* The expanded passage carries its own "Open in the Bible" action, so the card's is shown only while it is closed. */}
        {!open && location && bible.available ? (
          <CardAction label="Open in Bible" accessibilityLabel={`Open ${label} in the Bible`} onPress={() => router.push(location.href)} />
        ) : null}
      </View>
      {open ? <ScripturePassage content={record} embedded /> : null}
    </View>
  );
}

/**
 * The Scripture of a hotspot, compactly: one card per reference in the order the author gave them, each collapsed until the learner asks to read it. Nothing is shown when there are no
 * references (an older hotspot, or none added), so no empty heading or broken action ever appears.
 */
export function CompactScripture({ entries }: { entries: unknown }) {
  const { spacing } = useTheme();
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      {entries.map((entry, index) => (
        <CompactScriptureCard key={index} entry={entry} />
      ))}
    </View>
  );
}
