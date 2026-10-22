import { View } from 'react-native';

import { AppText, BlockFrame, BlockNotice, Reveal } from '@/components/ui';
import { ScriptureLinks } from '@/learning/scripture-links';
import { useTheme } from '@/theme';
import { motion, staggerDelay } from '@/theme/motion';

/**
 * Renders published PROPHECY_EQUIVALENCE, PROPHECY_COMPARISON and PROPHECY_CALCULATION blocks
 * (backend/src/modules/lessons/domain/blocks/prophecy.ts; PROPOSED schemas, open decision D13):
 *   EQUIVALENCE: { concept, items: [{ id, expression, label?, scripture?: FROZEN passages }] }
 *   COMPARISON:  { title?, entities: [{ id, name, characteristics: [{ id, label, value }], scripture?, explanation? }] }
 *   CALCULATION: { title?, steps: [{ id, value, operator?, result }] }
 * Everything is the AUTHOR's plain text, shown as written and in the published order; nothing is inferred, aligned or computed. The calculation
 * block DISPLAYS the author's steps and results and says so: the app never evaluates or verifies them. Comparison is always stacked cards (never
 * a wide table): inside a card each label sits directly above its value, so they stay together at any width or font size, and differences are
 * never conveyed by colour. Scripture is the frozen passages of the snapshot (ScriptureLinks), apart from the author's text. A block without its
 * essential text, or ANY essential entry (an item without its expression, an entity without a name or a characteristic without both label and value, a step
 * without value or result, or an entry that is not an object), makes the WHOLE block show a short "incomplete" note instead of a shortened version presented
 * as complete; the rest of the lesson is unaffected. Only OPTIONAL Scripture is handled per passage: a malformed passage shows its own "not available" card
 * (ScriptureLinks) and a malformed `scripture` value shows a notice for that item, while the surrounding authored content stays. Text is shown exactly as
 * stored (never trimmed or reordered); the block never evaluates or corrects anything.
 */
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
/** Every entry of a list that must be a list of objects, or null if the list is missing, empty or has any entry that is not an object. */
const strictList = (value: unknown): Record<string, unknown>[] | null => (Array.isArray(value) && value.length > 0 && value.every(isRecord) ? (value as Record<string, unknown>[]) : null);

function Incomplete({ what }: { what: string }) {
  const { spacing, colors, radius } = useTheme();
  return (
    <BlockNotice title={`${what} is incomplete`} message="Part of this block could not be read, so none of it is shown rather than a shortened version. The rest of the lesson is not affected." />
  );
}

/**
 * Optional Scripture of one item: per-passage handling stays in ScriptureLinks; a value that is not a list is reported for this item only. These are
 * SUPPORTING references (the block's point is the author's expressions, entities and steps), so they stay expandable.
 */
function OptionalScripture({ entries }: { entries: unknown }) {
  const { spacing } = useTheme();
  if (entries === undefined || entries === null) return null;
  if (!Array.isArray(entries)) {
    return (
      <View style={{ paddingTop: spacing.xs }}>
        <AppText variant="bodySmall" color="warning" accessibilityLiveRegion="polite">
          The Scripture for this item could not be shown.
        </AppText>
      </View>
    );
  }
  return <ScriptureLinks entries={entries} />;
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="bodySmall" color="textMuted" style={{ fontWeight: '600' }}>
        {label}
      </AppText>
      {children}
    </View>
  );
}

/** One panel of a prophecy block: a raised surface, or (strong) the gold-edged interactive frame. */
function Panel({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <BlockFrame variant={strong ? 'interactive' : 'evidence'} style={{ gap: 12 }}>
      {children}
    </BlockFrame>
  );
}

export function EquivalenceBlock({ content }: { content: Record<string, unknown> }) {
  const { spacing, colors } = useTheme();
  const items = strictList(content.items);
  const valid = isText(content.concept) && items !== null && items.every((i) => isText(i.expression) && (i.label === undefined || typeof i.label === 'string'));
  if (!valid || !items) return <Incomplete what="Prophecy equivalence" />;
  const concept = content.concept as string;

  return (
    <View style={{ gap: spacing.lg }}>
      <Reveal offset={motion.offset.subtle} style={{ gap: spacing.xs }}>
        <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700' }}>
          Prophecy equivalence
        </AppText>
        <AppText variant="sectionHeading" accessibilityRole="header">
          {concept}
        </AppText>
      </Reveal>
      <View style={{ gap: spacing.md }}>
        {items.map((item, index) => (
          <View key={index} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' }}>
            {/* the "equals" mark joins each expression to the concept above; it is decorative, the screen-reader label says "equivalent to" */}
            <Reveal
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              offset={0}
              delay={staggerDelay(index + 1)}
              style={{ width: 28, alignItems: 'center', paddingTop: spacing.lg }}>
              <AppText variant="heading" color="primaryHighlight">
                =
              </AppText>
            </Reveal>
            <Reveal offset={motion.offset.subtle} delay={staggerDelay(index + 1) + motion.stagger.step} style={{ flex: 1 }}>
              <Panel>
                <AppText variant="body" style={{ fontSize: 17, lineHeight: 26, fontWeight: '600' }} accessibilityLabel={`Expression ${index + 1} of ${items.length}, equivalent to ${concept}: ${item.expression as string}`}>
                  {item.expression as string}
                </AppText>
                {isText(item.label) ? <AppText variant="bodySmall" color="textSecondary">{item.label}</AppText> : null}
                <OptionalScripture entries={item.scripture} />
              </Panel>
            </Reveal>
          </View>
        ))}
      </View>
    </View>
  );
}

export function ComparisonBlock({ content }: { content: Record<string, unknown> }) {
  const { spacing } = useTheme();
  const entities = strictList(content.entities);
  const rowsOf = (entity: Record<string, unknown>) => strictList(entity.characteristics);
  const valid =
    entities !== null &&
    (content.title === undefined || typeof content.title === 'string') &&
    entities.every((e) => {
      const rows = rowsOf(e);
      return isText(e.name) && (e.explanation === undefined || typeof e.explanation === 'string') && rows !== null && rows.every((r) => isText(r.label) && isText(r.value));
    });
  if (!valid || !entities) return <Incomplete what="Prophecy comparison" />;

  return (
    <View style={{ gap: spacing.lg }}>
      <AppText variant="sectionHeading" accessibilityRole="header">
        {isText(content.title) ? content.title : 'Prophecy comparison'}
      </AppText>
      {/* stacked, one panel per compared item, so nothing needs sideways scrolling on a phone */}
      {entities.map((entity, index) => (
        <Reveal key={index} offset={motion.offset.subtle} delay={staggerDelay(index)}>
        <Panel strong>
          <AppText variant="heading" color="primaryHighlight" accessibilityRole="header">
            {entity.name as string}
          </AppText>
          {(rowsOf(entity) ?? []).map((row, r) => (
            <Labelled key={r} label={row.label as string}>
              <AppText variant="body">{row.value as string}</AppText>
            </Labelled>
          ))}
          <OptionalScripture entries={entity.scripture} />
          {isText(entity.explanation) ? (
            <Labelled label="Explanation">
              <AppText variant="body" color="textSecondary">
                {entity.explanation}
              </AppText>
            </Labelled>
          ) : null}
        </Panel>
        </Reveal>
      ))}
    </View>
  );
}

export function CalculationBlock({ content }: { content: Record<string, unknown> }) {
  const { spacing, colors } = useTheme();
  const steps = strictList(content.steps);
  const valid =
    steps !== null &&
    (content.title === undefined || typeof content.title === 'string') &&
    steps.every((s) => isText(s.value) && isText(s.result) && (s.operator === undefined || typeof s.operator === 'string'));
  if (!valid || !steps) return <Incomplete what="Prophecy calculation" />;

  return (
    <View style={{ gap: spacing.lg }}>
      <AppText variant="sectionHeading" accessibilityRole="header">
        {isText(content.title) ? content.title : 'Prophecy calculation'}
      </AppText>
      {steps.map((step, index) => (
        <Reveal key={index} offset={motion.offset.subtle} delay={staggerDelay(index)}>
        <Panel>
          <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700' }}>
            Step {index + 1}
          </AppText>
          <Labelled label="Value">
            <AppText variant="body" style={{ fontSize: 17, lineHeight: 26 }}>
              {step.value as string}
            </AppText>
          </Labelled>
          {isText(step.operator) ? (
            <Labelled label="Operator or explanation">
              <AppText variant="body" color="textSecondary">
                {step.operator}
              </AppText>
            </Labelled>
          ) : null}
          {/* the author's result, set apart so it is easy to find; shown exactly as written */}
          <Reveal offset={0} delay={staggerDelay(index) + motion.stagger.step * 2} style={{ gap: 2, paddingLeft: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.primary }}>
            <AppText variant="bodySmall" color="textMuted" style={{ fontWeight: '600' }}>
              Result
            </AppText>
            <AppText variant="body" style={{ fontSize: 18, lineHeight: 27, fontWeight: '700' }}>
              {step.result as string}
            </AppText>
          </Reveal>
        </Panel>
        </Reveal>
      ))}
      <AppText variant="bodySmall" color="textMuted">
        Steps and results are shown as written by the author.
      </AppText>
    </View>
  );
}
