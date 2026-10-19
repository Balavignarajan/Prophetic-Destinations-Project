/** The pure part of "Invite a Friend" (no imports, unit-tested with plain Node). See share.ts for where the values come from. */
export const DEFAULT_SHARE_MESSAGE = 'I am studying Bible prophecy with Prophetic Destinations. Join me.';

/** The text handed to the share sheet: the message, then the link on its own line when one is configured. */
export function buildShareText(message: string, url: string | null): string {
  const text = message.trim();
  return url ? `${text}\n${url}` : text;
}
