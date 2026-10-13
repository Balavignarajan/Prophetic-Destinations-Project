import { Linking, Text, View, type TextStyle } from 'react-native';

import { useTheme } from '@/theme';

/**
 * Renders the backend's RICH_TEXT content (backend/src/modules/lessons/domain/blocks/rich-text.ts):
 *   { body: { type: 'doc', content: [paragraph | bulletList | orderedList ...] } }
 * list items hold paragraphs and nested lists; text carries the marks bold, italic and link.
 * Text is rendered strictly as text. The backend validates the document; this renderer is still defensive and shows
 * nothing for any node it does not know. Links open only with http(s) and mailto.
 */
type Mark = { type?: unknown; attrs?: { href?: unknown } };
type RichNode = { type?: unknown; text?: unknown; marks?: unknown; content?: unknown; attrs?: unknown };

const LINK_SCHEMES = /^(https?:|mailto:)/i;

const asNodes = (value: unknown): RichNode[] => (Array.isArray(value) ? (value as RichNode[]) : []);

export function RichTextContent({ content }: { content: Record<string, unknown> }) {
  const body = content.body as RichNode | undefined;
  const blocks = body && body.type === 'doc' ? asNodes(body.content) : [];
  return <Blocks nodes={blocks} depth={0} />;
}

function Blocks({ nodes, depth }: { nodes: RichNode[]; depth: number }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      {nodes.map((node, index) => {
        if (node.type === 'paragraph') return <Paragraph key={index} node={node} />;
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
    <View style={{ gap: spacing.sm, paddingLeft: depth > 0 ? spacing.md : 0 }}>
      {items.map((item, index) => (
        <View key={index} style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Text style={[typography.scripture, { color: colors.primaryHighlight, minWidth: 22 }]} accessibilityElementsHidden>
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

function Paragraph({ node }: { node: RichNode }) {
  const { typography, colors } = useTheme();
  return (
    <Text style={[typography.scripture, { color: colors.textPrimary }]}>
      {asNodes(node.content).map((child, index) => (
        <Inline key={index} node={child} />
      ))}
    </Text>
  );
}

function Inline({ node }: { node: RichNode }) {
  const { colors } = useTheme();
  if (node.type !== 'text' || typeof node.text !== 'string') return null;
  const marks = (Array.isArray(node.marks) ? node.marks : []) as Mark[];
  const style: TextStyle = {};
  let href: string | null = null;
  for (const mark of marks) {
    if (mark.type === 'bold') style.fontWeight = '700';
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
        onPress={() => void Linking.openURL(target).catch(() => undefined)}
        style={[style, { color: colors.primaryHighlight, textDecorationLine: 'underline' }]}>
        {node.text}
      </Text>
    );
  }
  return <Text style={style}>{node.text}</Text>;
}
