import { AppText, BlockFrame, BlockNotice } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * Renders a published CALLOUT block (backend/src/modules/lessons/domain/blocks/section-callout.ts; PROPOSED schema):
 *   { calloutType: 'REMEMBER' | 'KEY_IDEA' | 'PROPHECY_PRINCIPLE', title?, body }
 * Short author-written emphasis. What kind of note it is stays in WORDS (a text label such as "Remember"), never only in colour, and the
 * left bar is a neutral accent. It is not Scripture and not a source quotation, so it uses the ordinary text face, not the Scripture card or
 * the quotation style. Only the three types named in the requirement exist (the closed list is open decision D7); an unknown type, or a
 * missing body, makes the callout "not available" rather than guessing what it should look like. The rest of the lesson is unaffected.
 */
const LABELS: Record<string, string> = { REMEMBER: 'Remember', KEY_IDEA: 'Key idea', PROPHECY_PRINCIPLE: 'Prophecy principle' };
const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function CalloutBlock({ content }: { content: Record<string, unknown> }) {
  const { colors } = useTheme();
  const type = asText(content.calloutType);
  const label = LABELS[type];
  const body = asText(content.body);
  const title = asText(content.title);

  if (!label || !body) {
    return (
      <BlockNotice title="Callout not available" message="This note could not be shown. The rest of the lesson is not affected." />
    );
  }

  // Each kind differs in its label AND its shape, never by colour alone:
  //  - Remember: the plain gold-edged note.
  //  - Key idea: a raised surface with a Cinzel title.
  //  - Prophecy principle: a raised surface with a gold hairline across the top.
  const keyIdea = type === 'KEY_IDEA';
  const principle = type === 'PROPHECY_PRINCIPLE';
  const frameStyle = keyIdea
    ? { backgroundColor: colors.surfaceElevated }
    : principle
      ? { backgroundColor: colors.surfaceElevated, borderTopWidth: 1, borderTopColor: colors.borderGold }
      : undefined;

  return (
    <BlockFrame variant="callout" style={frameStyle} accessible accessibilityLabel={`${label}. ${title ? `${title}. ` : ''}${body}`}>
      <AppText variant="label" color="primaryHighlight">
        {label}
      </AppText>
      {title ? (
        <AppText variant={keyIdea ? 'heading' : 'body'} style={keyIdea ? undefined : { fontWeight: '700' }}>
          {title}
        </AppText>
      ) : null}
      <AppText variant="body" style={{ fontSize: 17, lineHeight: 27 }}>
        {body}
      </AppText>
    </BlockFrame>
  );
}
