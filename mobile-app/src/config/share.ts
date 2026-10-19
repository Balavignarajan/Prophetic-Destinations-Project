import { parseHttpUrl } from '@/content/documents';

import { DEFAULT_SHARE_MESSAGE, buildShareText } from './share-text';

/**
 * "Invite a Friend": what the native share sheet is given. The specification asks for a configurable message and link
 * (FINAL_FEATURE_COMPLIANCE_AUDIT.md SHR-001, decision C-16); neither has been decided, and the app has no store link yet.
 *  - EXPO_PUBLIC_SHARE_URL      the link to share (the store page, once it exists). Not set: only the message is shared.
 *  - EXPO_PUBLIC_SHARE_MESSAGE  the invitation text. Not set: a neutral placeholder is used (pending approval).
 * No link is invented, and no contacts are read or stored: the operating system's share sheet does the sharing.
 * Expo inlines EXPO_PUBLIC_* values only when written as `process.env.EXPO_PUBLIC_NAME`, so they are read literally here.
 */
export const SHARE_URL: string | null = parseHttpUrl(process.env.EXPO_PUBLIC_SHARE_URL);
export const SHARE_MESSAGE: string = process.env.EXPO_PUBLIC_SHARE_MESSAGE?.trim() || DEFAULT_SHARE_MESSAGE;

export { buildShareText };
