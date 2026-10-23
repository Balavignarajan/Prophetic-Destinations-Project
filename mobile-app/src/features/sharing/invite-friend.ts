import { Platform, Share } from 'react-native';

import { SHARE_MESSAGE, SHARE_URL, buildShareText } from '@/config/share';

/**
 * Invite a Friend (SHR-001): how the invitation leaves the app. Nothing is read from the device (no contacts) and nothing is recorded: no referral code, no
 * tracking, no analytics. The link and the wording come from config/share.ts, the one place they are set.
 *
 *  - shared:      the system share sheet (or the browser's own share dialog) took it.
 *  - copied:      the browser has no share dialog, so the link was put on the clipboard instead.
 *  - cancelled:   the learner closed the share sheet. Not an error and not worth a message.
 *  - manual:      nothing could share or copy it; the caller shows `link` so it can be copied by hand.
 *  - unavailable: there is no valid public link to invite with (config/share.ts); nothing is shared.
 *  - failed:      the device refused to share.
 */
export type InviteOutcome = { kind: 'shared' | 'copied' | 'cancelled' | 'unavailable' | 'failed' } | { kind: 'manual'; link: string };

// Only the few browser members used here are described, so this builds without the browser's type library.
type WebNavigator = {
  share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
  canShare?: (data: { title?: string; text?: string; url?: string }) => boolean;
  clipboard?: { writeText?: (text: string) => Promise<void> };
};
type WebDocument = {
  body?: { appendChild: (node: unknown) => unknown; removeChild: (node: unknown) => unknown };
  createElement?: (tag: 'textarea') => { value: string; style: Record<string, string>; setAttribute: (name: string, value: string) => void; select: () => void };
  execCommand?: (command: 'copy') => boolean;
};
const web = (): { navigator?: WebNavigator; document?: WebDocument } => globalThis as unknown as { navigator?: WebNavigator; document?: WebDocument };

const errorName = (error: unknown): string => (typeof error === 'object' && error !== null && 'name' in error ? String((error as { name: unknown }).name) : '');

/** Puts `text` on the clipboard: the modern API where the browser allows it, otherwise the old copy command. Resolves to whether it worked. */
async function copyToClipboard(text: string): Promise<boolean> {
  const { navigator, document } = web();
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // not allowed here (no secure page, or permission refused): try the older way below
  }
  try {
    if (!document?.createElement || !document.body || !document.execCommand) return false;
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(field);
    return copied;
  } catch {
    return false;
  }
}

async function inviteOnWeb(link: string): Promise<InviteOutcome> {
  const { navigator } = web();
  const data = { title: 'Prophetic Destinations', text: buildShareText(SHARE_MESSAGE, null), url: link };
  if (navigator?.share && (navigator.canShare?.(data) ?? true)) {
    try {
      await navigator.share(data);
      return { kind: 'shared' };
    } catch (error) {
      if (errorName(error) === 'AbortError') return { kind: 'cancelled' };
      // the browser has a share dialog but would not open it now: the link can still be copied
    }
  }
  return (await copyToClipboard(link)) ? { kind: 'copied' } : { kind: 'manual', link };
}

async function inviteOnDevice(link: string): Promise<InviteOutcome> {
  try {
    const result = await Share.share({ message: buildShareText(SHARE_MESSAGE, link) });
    return { kind: result.action === Share.dismissedAction ? 'cancelled' : 'shared' };
  } catch {
    return { kind: 'failed' };
  }
}

/** Opens the share options for the invitation. Never throws. */
export async function inviteFriend(): Promise<InviteOutcome> {
  if (SHARE_URL === null) return { kind: 'unavailable' };
  return Platform.OS === 'web' ? inviteOnWeb(SHARE_URL) : inviteOnDevice(SHARE_URL);
}

/** What to tell the learner about an outcome, or null when nothing needs saying (it was shared, or they changed their mind). */
export function inviteNote(outcome: InviteOutcome): string | null {
  switch (outcome.kind) {
    case 'copied':
      return 'Link copied. You can paste it into a message to a friend.';
    case 'manual':
      return `Sharing is not available in this browser. Copy this link to share it: ${outcome.link}`;
    case 'unavailable':
      return 'Invite a Friend is not available yet: the app has no public link to share.';
    case 'failed':
      return 'Sharing is not available on this device.';
    default:
      return null;
  }
}
