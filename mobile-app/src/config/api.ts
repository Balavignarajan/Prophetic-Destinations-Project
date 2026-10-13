/**
 * Where the Prophetic Destinations backend lives. Set `EXPO_PUBLIC_API_URL` (see `.env.example`); the default is the
 * local development server. Note that an Android emulator reaches the host machine as `10.0.2.2`, not `localhost`,
 * and a physical device needs the computer's LAN address.
 *
 * Nothing calls the API yet; the catalog, lessons and quizzes arrive in later phases, using the backend's real public
 * routes (`/courses`, `/lessons/:id`, `/quizzes/:id`).
 */
export const API_BASE_URL: string = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
