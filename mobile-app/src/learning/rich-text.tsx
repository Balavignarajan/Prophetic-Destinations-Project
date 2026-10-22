import { Linking, Text, View, type TextStyle } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * Renders the backend's RICH_TEXT content (backend/src/modules/lessons/domain/blocks/rich-text.ts):
 *   { body: { type: 'doc', content: [paragraph | bulletList | orderedList ...] } }
 * list items hold paragraphs and nested lists; text carries the marks bold, italic and link.
 * Text is rendered strictly as text. The backend validates the document; this renderer is still defensive and shows
 * nothing for any node it does not know, and stops descending where the backend's own depth limit says a document cannot go. Links open only with http(s) and mailto.
 *
 * NOT in the contract today, and therefore not rendered for any published lesson: headings and inline Scripture references. The backend states that
 * there are deliberately no heading nodes (headings return only through an explicit content-contract decision; major transitions use SECTION_INTRO),
 * and it accepts nothing but `body` at the top level, so there is no reference field either. A heading renderer is prepared below for the node shape
 * the rest of this document already mirrors (ProseMirror / TipTap); it only starts to do anything if the backend contract adds that node. Inline
 * references are NOT prepared: guessing which words are Scripture references would be inventing a contract.
 */
type Mark = { type?: unknown; attrs?: { href?: unknown } };
type RichNode = { type?: unknown; text?: unknown; marks?: unknown; content?: unknown; attrs?: unknown };

/** Long-form prose: Inter at 17/28 (Scripture keeps EB Garamond in its own block). */
const READING: TextStyle = { fontSize: 17, lineHeight: 28 };

const LINK_SCHEMES = /^(https?:|mailto:)/i;

/** The backend's nesting limit (RICH_TEXT_LIMITS.maxDepth). A document the backend accepted never reaches it; a malformed one cannot recurse without end. */
const MAX_DEPTH = 8;

const asNodes = (value: unknown): RichNode[] => (Array.isArray(value) ? (value as RichNode[]) : []);

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
 * PREPARED, NOT YET IN THE CONTRACT (see the note at the top): { type: 'heading', attrs: { level }, content: [text] }. A heading is plain text (its marks are
 * not applied), set in the theme's own heading faces so there is no second heading design: levels 1 and 2 use `heading`; deeper levels use the bold body face.
 * It is a screen-reader heading. A level that is not a whole number from 1 to 6 is treated as the deepest; a heading with no text shows nothing.
 */
function Heading({ node }: { node: RichNode }) {
  const attrs: { level?: unknown } = typeof node.attrs === 'object' && node.attrs !== null ? (node.attrs as { level?: unknown }) : {};
  const level = typeof attrs.level === 'number' && Number.isInteger(attrs.level) && attrs.level >= 1 && attrs.level <= 6 ? attrs.level : 6;
  const text = asNodes(node.content)
    .map((child) => (child.type === 'text' && typeof child.text === 'string' ? child.text : ''))
    .join('')
    .trim();
  if (!text) return null;
  if (level <= 2) {
    return (
      <AppText variant="heading" accessibilityRole="header">
        {text}
      </AppText>
    );
  }
  return (
    <AppText variant="body" accessibilityRole="header" style={[READING, { fontWeight: '700' }]}>
      {text}
    </AppText>
  );
}

function Paragraph({ node }: { node: RichNode }) {
  const { typography, colors } = useTheme();
  return (
    <Text style={[typography.body, READING, { color: colors.textPrimary }]}>
      {asNodes(node.content).map((child, index) => (
        <Inline key={index} node={child} />
      ))}
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
