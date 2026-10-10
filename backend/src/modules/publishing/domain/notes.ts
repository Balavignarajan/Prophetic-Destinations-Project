import { BusinessRuleError } from '../../../shared-kernel/index.js';

export const NOTE_MAX_LENGTH = 2000;

/**
 * A workflow note is plain text: line endings are normalised and the ends are
 * trimmed. A blank note means "no note"; where a note is required (requesting
 * changes) that is an error. Over-long input is rejected, never truncated.
 */
export function normalizeNote(
  note: string | null | undefined,
  required: boolean,
): string | null {
  const text = (note ?? '').replace(/\r\n?/g, '\n').trim();

  if (text.length === 0) {
    if (required) {
      throw new BusinessRuleError(
        'A note is required: say what needs to change',
        {
          field: 'note',
        },
      );
    }
    return null;
  }
  if (text.includes('\u0000')) {
    throw new BusinessRuleError('note contains an invalid character', {
      field: 'note',
    });
  }
  if (text.length > NOTE_MAX_LENGTH) {
    throw new BusinessRuleError(
      `note must be at most ${NOTE_MAX_LENGTH} characters`,
      {
        field: 'note',
        max: NOTE_MAX_LENGTH,
      },
    );
  }
  return text;
}
