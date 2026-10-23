/** The pure part of "Invite a Friend" (no imports, unit-tested with plain Node). See share.ts for where the values come from. */
export const DEFAULT_SHARE_MESSAGE = 'I am studying Bible prophecy with Prophetic Destinations. Join me.';

/** The text handed to the share sheet: the message, then the link on its own line when one is configured. */
export function buildShareText(message: string, url: string | null): string {
  const text = message.trim();
  return url ? `${text}\n${url}` : text;
}

/** Name endings that never lead to a page anyone else can open (private networks, local machines, documentation and test names). */
const NON_PUBLIC_ENDINGS = new Set(['localhost', 'local', 'localdomain', 'internal', 'intranet', 'lan', 'home', 'corp', 'private', 'test', 'example', 'invalid', 'arpa', 'onion']);
/** Domains reserved for examples: a link to one is a placeholder, not the app. */
const PLACEHOLDER_DOMAINS = ['example.com', 'example.net', 'example.org'];
/** A real domain name: dotted labels, a lettered ending (or an internationalised one in its xn-- form). A number such as 192.168.0.5 or a name without a dot is not one. */
const DOMAIN_NAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/**
 * The link people are invited with, or null when there is nothing safe to share. A configured value counts only when it is an https address on a public domain
 * name: no spaces, no user name or password in it, no address of a machine or private network (localhost, 192.168.x.x, *.local, *.internal ...), and not one of
 * the reserved example domains. Anything else is treated as "no link has been approved yet" rather than guessed at or shared. Internationalised names must be
 * given in their ASCII (xn--) form.
 */
export function publicShareUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value || value.length > 2048 || /\s/.test(value)) return null;
  const match = /^https:\/\/([^/?#]+)(?:[/?#].*)?$/i.exec(value);
  if (!match) return null;
  const authority = match[1];
  if (authority.includes('@')) return null;
  const host = authority.replace(/:\d{1,5}$/, '').replace(/\.$/, '').toLowerCase();
  if (!DOMAIN_NAME.test(host)) return null;
  if (NON_PUBLIC_ENDINGS.has(host.slice(host.lastIndexOf('.') + 1))) return null;
  if (PLACEHOLDER_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))) return null;
  return value;
}
