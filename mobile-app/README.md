# Prophetic Destinations — mobile app

React Native + Expo (SDK 57) + TypeScript, with Expo Router. The learner app has **no accounts**: progress, bookmarks and quiz results will be stored on the device.

## Run it

```bash
npm install
npx expo start            # then press a (Android), i (iOS) or w (web); or scan the QR code with Expo Go
```

Checks: `npm run typecheck`, `npx expo lint`, `npm run check:theme`, `npx expo-doctor`.

The backend address comes from `EXPO_PUBLIC_API_URL` (see `.env.example`; Android emulator: `http://10.0.2.2:3001/api/v1`). The catalog and lesson screens call the backend's public learner API, so start the backend first (for the web build it must also list the app's origin in `CORS_ORIGINS`).

## Structure

```
src/app/            Expo Router routes (thin: each file renders one screen). _layout.tsx = fonts, theme provider, status bar, navigation theme
src/screens/        welcome, learn (catalog), course, lesson (reader), settings, saved
src/components/ui/  Design-system components (AppText, PrimaryButton, SecondaryButton, IconButton, ScreenContainer, ScreenHeader, Card,
                    OptionRow, SectionHeader, ProgressIndicator, Divider, LoadingState, ErrorState, EmptyState, ...)
src/components/     hero-backdrop
src/learning/       CourseCard, LessonRow, LevelSelector, RichTextContent (RICH_TEXT renderer), level definitions, useLearningLevel
src/api/            Typed client for the backend's public routes: client (fetch, timeout, errors), learner-api, types, use-resource
src/storage/        preferences.ts: theme and level choice in AsyncStorage (non-sensitive only)
src/theme/          colors (both themes), theme-provider (useTheme, useThemePreference), spacing, typography, radius, shadows
src/navigation/     Navigation container theme (built from the active theme)
src/config/         api.ts (backend base URL)
scripts/check-theme.ts       Token parity + contrast of BOTH themes + stray-colour scan
```

Flow: `/` Welcome → Home (the topics the administrators set up under Home Entries in the Admin CMS, filtered to the learner's level; nothing on Home is built into the app) → `/topic/:entryId?level=` (the published courses in that topic) → `/course/:id?level=`; or Home → `/learn` (catalog, level selector) → `/course/:id?level=` (modules and lessons) → `/lesson/:id?level=` (reader, Continue to next lesson). `/settings` is reachable from Welcome and the catalog. Every lesson, including Daniel 2, is a published lesson from the Admin CMS.

## Offline, bookmarks and progress (all device-local, all separate)

| Concern | Code | Storage key |
| --- | --- | --- |
| Theme preference | `src/storage/preferences.ts` | `pd.preferences.theme` (and `.level`) |
| Offline cache of published content | `src/features/offline/` | `pd.cache.v1:<kind>:<id>:<level>` + `pd.cache.v1.index` |
| Bookmarks (saved lessons) | `src/features/bookmarks/` | `pd.bookmarks.v1` |
| Published-lesson progress | `src/features/learning/` | `pd.learning.progress.v1` |

- **Cache policy.** The backend is the source of truth. A successful, valid response replaces the saved copy. If the server cannot be reached (or times out, 429, 5xx, or the answer is malformed) the saved copy is shown under a "Saved copy" banner with its save time and a retry; with no saved copy the screen says the content is not available offline. A 404 deletes the saved copy and shows "not available": a stale copy is never proof that something is still published. Cached: catalog per level, Home topic list per level, course list of each topic per level, course per level, lesson snapshot per lesson+level, lesson navigation. Retention: entries older than 30 days are deleted, at most 60 entries are kept (oldest removed first), invalid entries are deleted on read. ETag/conditional requests are not used (the shared API client does not send validators). "Clear offline lessons" is in Settings.
- **Reconnect.** There is no network-status library; saved copies retry when the app returns to the foreground, when the browser reports `online`, and with the Try again button.
- **Bookmarks.** One list; lesson ids are `lesson:<lessonId>:<level>`; titles are stored at save time. Saved items screen: `/saved` (star in the catalog header). A saved lesson that the backend reports unavailable is flagged and can be removed. A saved item of a kind this version does not know (such as a scene saved by the removed built-in Daniel 2 preview) is skipped when the list is read.
- **Progress.** The lesson reader records the last opened lesson ("Continue where you left off" on `/learn`) and has an explicit "Mark lesson as complete" action; opening never completes. Reset in Settings.

## Navigation map

`/` Welcome (Enter, Saved items, Settings) → `/learn` (resume card, level selector, course catalog, Saved items, Settings) → `/course/:id?level=` → `/lesson/:id?level=` (bookmark, mark complete, previous/next, back to course).
`/saved` lists saved lessons. `/settings`: appearance, clear offline lessons, reset reading progress (each touches only its own data). Unknown links show a themed "Page not found"; a screen that crashes shows a themed error with retry.

Levels: links always carry `?level=`; a link without it uses the learner's saved level. Errors: a 404, or a 400 from the backend's id validation, is shown as "not available"; network failures, timeouts, 429 and 5xx are transient (retry, and a saved copy if there is one); a saved copy or a "cannot reach the server" screen retries automatically when the app returns to the foreground or the browser comes back online.

Release readiness, native-test steps and open decisions: see `RELEASE-READINESS.md`. A release build has no default API URL (set `EXPO_PUBLIC_API_URL` when building).

Pictures: all bundled imagery is registered in `src/config/images.ts`; today that is the generated Welcome cover. Lesson pictures come from the CMS. A picture that fails to load falls back to a themed block.

## Backend routes used (public, no authentication)

| Screen | Request |
| --- | --- |
| Catalog | `GET /courses?level=BEGINNER\|INTERMEDIATE\|ADVANCED` |
| Home topics | `GET /home-entries?level=` (topics set up in the Admin CMS; a topic's own picture is `GET /home-entries/:entryId/media/:mediaId?level=`) |
| Topic courses | `GET /home-entries/:entryId/courses?level=` (the topic's published courses, each as in the catalog; 404 when none is available) |
| Course | `GET /courses/:courseId?level=` |
| Lesson | `GET /lessons/:lessonId?level=` and `GET /lessons/:lessonId/navigation?level=` |

Every unavailable case (draft, withdrawn, unknown id, nothing at that level) is a `404`, shown as "not available". Only `RICH_TEXT` blocks are rendered; any other block type is not shown and the reader says so. `SCRIPTURE_PASSAGE` and `SCRIPTURE_CONNECTION` are not enabled by the backend and are not implemented. No content is invented: what the learner sees is what was published.

## The theme (read this before touching a colour)

**Every colour in the app is defined in `src/theme/colors.ts` and nowhere else, for both themes.**

- `palette` holds the raw values: the manager's **Antique Gold `#A3801F`**, **Deep Black `#07090F`** and **Charcoal `#131211`**, plus supporting values for the light theme (ivory/parchment surfaces, near-black text, a deeper gold for gold text).
- `darkColors` and `lightColors` map them to the **same semantic tokens** (`background`, `surface`, `primary`, `primaryHighlight`, `onPrimary`, `textPrimary`, `textMuted`, `border`, `error`, `overlay`, ...); TypeScript refuses a theme missing a token. Screens and components use **tokens only**, through `useTheme()`; never a hex, `rgb()` or named colour.
- `primary` is the gold FILL (buttons, selected states); `primaryHighlight` is gold used as TEXT (lighter in dark, deeper in light so it stays readable).
- **Appearance** is System, Light or Dark (Settings). Dark is the first-time default. System follows the device live. The choice is saved with AsyncStorage (`pd.preferences.theme`) and loaded before the first themed frame (the splash is held until then), so there is no flash of the wrong theme.
- **Native splash limitation:** the native splash screen, root window colour and Android adaptive-icon background are fixed at build time (`app.config.js` reads the dark palette). A Light user sees the dark splash briefly; every screen after it follows the chosen theme.
- Change a value in `colors.ts` and the app follows. Run **`npm run check:theme`** afterwards: it checks identical token names, WCAG contrast of the pairings the UI uses in both themes, and that no colour literal appears outside `colors.ts`.
- Photographs and illustrations are assets and are not recoloured by the theme.

Text on the gold fill is dark (`onPrimary`, 5.4:1) in both themes; the pressed state is a lighter gold. Typography: Cinzel (display titles), the platform serif for Scripture and lesson prose, the platform sans for UI text. Touch targets are 48 points. Selected states are conveyed by shape and `aria-checked`, not colour alone.

## What is placeholder

- App icon and splash image are still the Expo defaults.

## Not built yet (on purpose)

Scripture navigation, quizzes (the backend's public quiz API exists), offline caching, device-local progress, audio,.
