/**
 * Pure helpers for telling a developer WHICH server the app is trying to reach (no React, no imports: unit-tested with plain Node).
 *
 * Why: a physical phone reaches the backend by the computer's LAN address, which changes with the network (home Wi-Fi, phone
 * hotspot, office). When the configured address is stale every request fails, the app falls back to its saved copy, and the lists
 * look "out of date" with nothing pointing at the real cause. In development builds the "saved copy" banner and the
 * "not available offline" message now name the address being used. Release builds never show it.
 */

/** "host:port" of a base URL, or null if it is not a usable URL. */
export function apiHostLabel(baseUrl: string | null | undefined): string | null {
  if (!baseUrl) return null;
  try {
    return new URL(baseUrl).host || null;
  } catch {
    return null;
  }
}

/** The extra sentence for a "cannot reach the server" message, or null (release builds, or no address configured). */
export function unreachableHint(baseUrl: string | null | undefined, isDevelopment: boolean): string | null {
  const host = apiHostLabel(baseUrl);
  if (!isDevelopment || host === null) return null;
  return `The app is trying to reach ${host}. If that is not your computer's current address, change EXPO_PUBLIC_API_URL and restart Expo with a cleared cache (npx expo start -c).`;
}
