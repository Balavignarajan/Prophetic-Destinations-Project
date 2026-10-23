import { DEFAULT_SHARE_MESSAGE, buildShareText, publicShareUrl } from './share-text';

/**
 * "Invite a Friend" (SHR-001): the ONE place the public link and the message come from.
 *
 * EXPO_PUBLIC_SHARE_URL is the address people are invited to: the app's store page or public website, an https address on a public domain. It is a client and
 * deployment decision and none is guessed here. When it is not set, or is not a valid public address (see `publicShareUrl`), `SHARE_URL` is null and the app says
 * that inviting is not available yet instead of sharing a message with no destination or a placeholder.
 *
 * EXPO_PUBLIC_SHARE_MESSAGE is optional approved wording. Without it the neutral default is used. Nothing else is added: no invite code, no referral or tracking
 * parameter, no contacts.
 */
export const SHARE_URL: string | null = publicShareUrl(process.env.EXPO_PUBLIC_SHARE_URL);

/** True when there is a valid public link to invite with. */
export const SHARE_AVAILABLE: boolean = SHARE_URL !== null;

export const SHARE_MESSAGE: string = process.env.EXPO_PUBLIC_SHARE_MESSAGE?.trim() || DEFAULT_SHARE_MESSAGE;

export { buildShareText };
