import { Platform } from 'react-native';

/**
 * Where the Prophetic Destinations backend lives, from `EXPO_PUBLIC_API_URL` (see `.env.example`). Expo inlines `EXPO_PUBLIC_*`
 * values at build time, so set it when building (or restart the dev server after changing it).
 *
 * - Development builds (`__DEV__`) with nothing set use the local backend: `localhost` on iOS and the web, `10.0.2.2` on the
 *   Android emulator (its name for the host machine).
 * - A physical device cannot reach `localhost`: set the variable to your computer's LAN address or a deployed API.
 * - RELEASE builds have NO default. If the variable is missing or is not a valid http(s) URL, `API_BASE_URL` is null and every
 *   request fails with a clear "not configured" message instead of quietly calling `localhost`. No production URL is built in.
 * - Android release builds block plain `http://` traffic by default; a production URL should be `https://`.
 *
 * Used by src/api/client.ts for the backend's public learner routes only: `/courses`, `/courses/:id`, `/lessons/:id`,
 * `/lessons/:id/navigation`.
 */
function parseBaseUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return value.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
const developmentDefault = `http://${Platform.OS === 'android' ? '10.0.2.2' : 'localhost'}:3001/api/v1`;

/** The backend base URL, or null when this build has none configured (or the configured value is malformed). */
export const API_BASE_URL: string | null = configured ? parseBaseUrl(configured) : __DEV__ ? developmentDefault : null;

/** True when the URL is plain http. Fine for local development; a store build should use https. */
export const API_URL_IS_INSECURE: boolean = API_BASE_URL?.startsWith('http://') ?? false;
