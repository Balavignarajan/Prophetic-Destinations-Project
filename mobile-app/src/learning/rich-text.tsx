import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Text, View, type TextStyle } from 'react-native';

import { AppText, Reveal } from '@/components/ui';
import { getScriptureAvailability } from '@/features/scripture/scripture-lookup';
import { ScripturePassage, bibleLocationOf, isReferenceOnly } from '@/learning/scripture-passage';
import { useTheme } from '@/theme';

/**
 * Renders the backend's RICH_TEXT content (backend/src/modules/lessons/domain/blocks/rich-text.ts):
 *   { body: { type: 'doc', content: [paragraph | heading | bulletList | orderedList ...] } }
 * list items hold paragraphs and nested lists; text carries the marks bold, italic and link; a heading is { type: 'heading', attrs: { level: 1 | 2 | 3 }, content: [text] }.
 * Text is rendered strictly as text. The backend validates the document; this renderer is still defensive and shows
 * nothing for any node it does not know, and stops descending where the backend's own depth limit says a document cannot go. Links open only with http(s) and mailto.
 *
 * HEADINGS (BLK-001): drawn in the theme's own heading faces (level 1 `sectionHeading`, level 2 `heading`, level 3 the bold reading face), as screen-reader headings.
 * A heading is plain text; the backend gives it no marks. A level that is not 1 to 3, or a heading with no text, shows nothing.
 *
 * SCRIPTURE REFERENCES (BLK-001): a `scriptureRef` node inside a paragraph is a STRUCTURED reference, never found by looking at the words. In a published lesson its attrs are the
 * FROZEN passage { reference, display, source, verses } (backend scripture-embed.service.ts), so everything is read from the lesson itself: it needs no Bible service and no
 * Bible text in the app, and it works offline through the lesson cache. The reference is drawn in the sentence by its label ("Daniel 2:31-35"). When the passage carries its
 * verse text, the label opens that frozen passage directly under the paragraph and closes it again (the supporting-reference convention of ScriptureLinks; Scripture a
 * lesson depends on belongs in a Scripture passage block, which is never hidden). A reference without verse text opens the Bible at its structured reference when the Bible
 * is in the app (otherwise it is just its label). A reference that cannot be read shows nothing.
 */
type Mark = { type?: unknown; attrs?: { href?: unknown } };
type RichNode = { type?: unknown; text?: unknown; marks?: unknown; content?: unknown; attrs?: unknown };

/** Long-form prose: Inter at 17/28 (Scripture keeps EB Garamond in its own block). */
const READING: TextStyle = { fontSize: 17, lineHeight: 28 };

const LINK_SCHEMES = /^(https?:|mailto:)/i;

/** The backend's nesting limit (RICH_TEXT_LIMITS.maxDepth). A document the backend accepted never reaches it; a malformed one cannot recurse without end. */
const MAX_DEPTH = 8;

const asNodes = (value: unknown): RichNode[] => (Array.isArray(value) ? (value as RichNode[]) : []);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function RichTextContent({ content }: { content: Record<string, unknown> }) {
  const body = content.body as RichNode | undefined;
  const blocks = body && body.type === 'doc' ? asNodes(body.content) : [];
  return <Blocks nodes={blocks} depth={0} />;
}

function Blocks({ nodes, depth }: { nodes: RichNode[]; depth: number }) {
  const { spacing } = useTheme();
  if (depth > MAX_DEPTH) return null;
  // Top-level paragraphs and lists get more air than the content nested inside a list item.
  return (
    <View style={{ gap: depth === 0 ? spacing.lg : spacing.sm }}>
      {nodes.map((node, index) => {
        if (node.type === 'paragraph') return <Paragraph key={index} node={node} />;
        if (node.type === 'heading') return <Heading key={index} node={node} />;
        if (node.type === 'bulletList' || node.type === 'orderedList') {
          return <List key={index} node={node} ordered={node.type === 'orderedList'} depth={depth} />;
        }
        return null;
      })}
    </View>
  );
}

function List({ node, ordered, depth }: { node: RichNode; ordered: boolean; depth: number }) {
  const { spacing, typography, colors } = useTheme();
  const items = asNodes(node.content).filter((item) => item.type === 'listItem');
  return (
    <View style={{ gap: spacing.sm, paddingLeft: depth > 0 ? spacing.lg : spacing.xs }}>
      {items.map((item, index) => (
        <View key={index} style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Text style={[typography.body, READING, { color: colors.primaryHighlight, minWidth: ordered ? 28 : 16 }]} accessibilityElementsHidden>
            {ordered ? `${index + 1}.` : '•'}
          </Text>
          <View style={{ flex: 1 }}>
            <Blocks nodes={asNodes(item.content)} depth={depth + 1} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * { type: 'heading', attrs: { level }, content: [text] }. A heading is plain text (its marks are not applied), set in the theme's own heading faces so there is no
 * second heading design: level 1 uses `sectionHeading`, level 2 `heading`, level 3 the bold body face. It is a screen-reader heading. A level that is not 1, 2 or 3 shows
 * nothing (the backend does not accept one), and neither does a heading with no text.
 */
function Heading({ node }: { node: RichNode }) {
  const attrs: { level?: unknown } = isRecord(node.attrs) ? (node.attrs as { level?: unknown }) : {};
  const level = attrs.level;
  if (level !== 1 && level !== 2 && level !== 3) return null;
  const text = asNodes(node.content)
    .map((child) => (child.type === 'text' && typeof child.text === 'string' ? child.text : ''))
    .join('')
    .trim();
  if (!text) return null;
  if (level === 3) {
    return (
      <AppText variant="body" accessibilityRole="header" style={[READING, { fontWeight: '700' }]}>
        {text}
      </AppText>
    );
  }
  return (
    <AppText variant={level === 1 ? 'sectionHeading' : 'heading'} accessibilityRole="header">
      {text}
    </AppText>
  );
}

/** An inline Scripture reference as the lesson snapshot carries it: the frozen passage in `attrs`, with the label to draw. Null when there is no label to draw. */
type InlineReference = { node: RichNode; passage: Record<string, unknown>; label: string; hasText: boolean };

function readInlineReference(node: RichNode): InlineReference | null {
  if (node.type !== 'scriptureRef' || !isRecord(node.attrs)) return null;
  const label = typeof node.attrs.display === 'string' ? node.attrs.display.trim() : '';
  if (!label) return null;
  return { node, passage: node.attrs, label, hasText: !isReferenceOnly(node.attrs) };
}

function Paragraph({ node }: { node: RichNode }) {
  const { typography, colors, spacing } = useTheme();
  const [open, setOpen] = useState<number | null>(null);
  const children = asNodes(node.content);
  const references = children.map(readInlineReference).filter((reference): reference is InlineReference => reference !== null);

  const text = (
    <Text style={[typography.body, READING, { color: colors.textPrimary }]}>
      {children.map((child, index) => {
        const referenceIndex = references.findIndex((reference) => reference.node === child);
        if (referenceIndex >= 0) {
          return <Reference key={index} reference={references[referenceIndex]} open={open === referenceIndex} onToggle={() => setOpen(open === referenceIndex ? null : referenceIndex)} />;
        }
        return <Inline key={index} node={child} />;
      })}
    </Text>
  );

  const shown = open === null ? null : references[open];
  if (!shown) return text;
  return (
    <View style={{ gap: spacing.md }}>
      {text}
      <Reveal>
        <ScripturePassage content={shown.passage} embedded />
      </Reveal>
    </View>
  );
}

/**
 * The reference's label inside the sentence. With verse text it opens and closes the frozen passage under the paragraph (and that passage carries its own "Open in Bible"
 * button). Without verse text there is nothing to show, so the label itself opens the Bible at the reference when the Bible is in the app and the passage has a valid structured
 * reference; otherwise it is the label alone.
 */
function Reference({ reference, open, onToggle }: { reference: InlineReference; open: boolean; onToggle: () => void }) {
  const router = useRouter();
  const { colors, fontFamilies } = useTheme();
  const style: TextStyle = { color: colors.primaryHighlight, fontFamily: fontFamilies.sansMedium };
  if (!reference.hasText) {
    const location = getScriptureAvailability().available ? bibleLocationOf(reference.passage) : null;
    if (!location) return <Text style={style}>{reference.label}</Text>;
    return (
      <Text
        accessibilityRole="link"
        accessibilityLabel={`Open ${reference.label} in the Bible`}
        onPress={() => router.push(location.href)}
        style={[style, { textDecorationLine: 'underline' }]}>
        {reference.label}
      </Text>
    );
  }
  return (
    <Text
      accessibilityRole="link"
      accessibilityLabel={`Scripture: ${reference.label}`}
      accessibilityHint={open ? 'Hides this passage' : 'Shows this passage below'}
      onPress={onToggle}
      style={[style, { textDecorationLine: 'underline' }]}>
      {reference.label}
    </Text>
  );
}

function Inline({ node }: { node: RichNode }) {
  const { colors, fontFamilies } = useTheme();
  if (node.type !== 'text' || typeof node.text !== 'string') return null;
  const marks = (Array.isArray(node.marks) ? node.marks : []) as Mark[];
  const style: TextStyle = {};
  let href: string | null = null;
  for (const mark of marks) {
    if (mark.type === 'bold') {
      style.fontFamily = fontFamilies.sansBold; // a custom font has no weight axis: use the real bold face
      style.fontWeight = 'normal';
    }
    else if (mark.type === 'italic') style.fontStyle = 'italic';
    else if (mark.type === 'link' && typeof mark.attrs?.href === 'string' && LINK_SCHEMES.test(mark.attrs.href)) {
      href = mark.attrs.href;
    }
  }
  if (href) {
    const target = href;
    return (
      <Text
        accessibilityRole="link"
        accessibilityHint="Opens a link outside this lesson"
        onPress={() => void Linking.openURL(target).catch(() => undefined)}
        style={[style, { color: colors.primaryHighlight, textDecorationLine: 'underline', fontFamily: style.fontFamily ?? fontFamilies.sansMedium }]}>
        {node.text}
      </Text>
    );
  }
  return <Text style={style}>{node.text}</Text>;
}
