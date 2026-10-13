/**
 * Where the Prophetic Destinations backend lives. Set `EXPO_PUBLIC_API_URL` (see `.env.example`); the default is the
 * local development server. Note that an Android emulator reaches the host machine as `10.0.2.2`, not `localhost`,
 * and a physical device needs the computer's LAN address.
 *
 * Used by src/api/client.ts for the backend's public learner routes (`/courses`, `/courses/:id`, `/lessons/:id`,
 * `/lessons/:id/navigation`). Expo inlines `EXPO_PUBLIC_*` values at build time, so restart the dev server after changing it.
 */
export const API_BASE_URL: string = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
