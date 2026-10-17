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
src/screens/        welcome, learn (catalog), course, lesson (reader), settings, daniel-2-intro
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

Flow: `/` Welcome → `/learn` (catalog, level selector) → `/course/:id?level=` (modules and lessons) → `/lesson/:id?level=` (reader, Continue to next lesson). `/settings` is reachable from Welcome and the catalog. `/daniel-2` is the cinematic introduction screen; it is reachable by deep link but is not listed as a course.

## The Daniel 2 lesson (`src/features/daniel-2/`)

A 14-scene interactive lesson: introduction, the dream, the great image (tap its parts), head of gold, chest of silver, belly of bronze, legs of iron, feet of iron and clay, the stone, the meaning of the stone, a timeline, Bible and history evidence, a quiz, and a summary. Entry: the "Built-in interactive lesson" card at the top of `/learn`, or `/daniel-2` (introduction with Start / Resume / Start over), then `/daniel-2-lesson`.

**The content is CONFIGURED, built-in educational content, pending approval. It is not a backend course** and is shown separately from the catalog. No course ID is invented and no network response is faked.

```
types.ts            presentation model (Daniel2Lesson, Scene union, ScriptureRef, ...)
content/            the configured content: scenes, statue sections, timeline, quiz  <- edit approved wording HERE
assets.ts           every picture, in one place (all placeholders today)
source.ts           Daniel2LessonSource: the seam between content retrieval and rendering
progress.ts         device-local progress (AsyncStorage key pd.daniel2.progress.v1)
use-lesson-progress.ts, use-daniel2-lesson.ts
components/         scene views + scene-renderer.tsx, statue figure, scripture card, evidence card, timeline, quiz, summary
```

- **Bible vs interpretation vs history.** Every block is labelled: BIBLE TEXT / SCRIPTURE REFERENCE, BIBLICAL INTERPRETATION, HISTORICAL CONTEXT, HISTORICAL APPLICATION (each also has its own border style). Each identification is tagged *Stated in the passage*, *Traditional identification* or *Interpretations differ*.
- **No Bible wording is bundled.** `ScriptureRef.text` is `null` until a licensed translation is approved; the UI shows the reference and says the verse text is not included. Supplying `text` requires an `attribution`.
- **Moving to the backend later:** write a second `Daniel2LessonSource` that maps a published course (via `src/api/learner-api.ts`) into `Daniel2Lesson`, and change `activeLessonSource` in `source.ts`. Scenes need no changes. The backend does not yet carry the scene structure, statue, timeline or quiz, so that needs a content decision first.
- **Progress.** A scene counts as completed only when the learner presses Continue (or finishes the quiz); opening a scene does not complete it. Saved on every completed or opened scene, quiz result and bookmark; restored on launch (Resume lesson); Start over clears it. Separate from the theme preference.
- **Quiz.** Four local single-choice questions, one at a time: choose, submit, feedback, next, score, retake. Not a backend quiz; nothing is submitted.
- **Artwork.** The picture is a generated placeholder, and the statue is a stylised drawing made of views (not a 3D model). Its material fills are tokens in `src/theme/colors.ts`.

## Offline, bookmarks and progress (all device-local, all separate)

| Concern | Code | Storage key |
| --- | --- | --- |
| Theme preference | `src/storage/preferences.ts` | `pd.preferences.theme` (and `.level`) |
| Offline cache of published content | `src/features/offline/` | `pd.cache.v1:<kind>:<id>:<level>` + `pd.cache.v1.index` |
| Bookmarks (lessons + Daniel 2 scenes) | `src/features/bookmarks/` | `pd.bookmarks.v1` |
| Published-lesson progress | `src/features/learning/` | `pd.learning.progress.v1` |
| Daniel 2 scene progress and quiz | `src/features/daniel-2/progress.ts` | `pd.daniel2.progress.v1` |

- **Cache policy.** The backend is the source of truth. A successful, valid response replaces the saved copy. If the server cannot be reached (or times out, 429, 5xx, or the answer is malformed) the saved copy is shown under a "Saved copy" banner with its save time and a retry; with no saved copy the screen says the content is not available offline. A 404 deletes the saved copy and shows "not available": a stale copy is never proof that something is still published. Cached: catalog per level, course per level, lesson snapshot per lesson+level, lesson navigation. Retention: entries older than 30 days are deleted, at most 60 entries are kept (oldest removed first), invalid entries are deleted on read. ETag/conditional requests are not used (the shared API client does not send validators). "Clear offline lessons" is in Settings.
- **Reconnect.** There is no network-status library; saved copies retry when the app returns to the foreground, when the browser reports `online`, and with the Try again button.
- **Bookmarks.** One list; lesson ids are `lesson:<lessonId>:<level>`, scene ids `daniel2:<sceneId>`; titles are stored at save time. Saved items screen: `/saved` (star in the catalog header). A saved lesson that the backend reports unavailable is flagged and can be removed. Legacy Daniel 2 bookmarks (the `bookmarks` field of the Daniel 2 progress record) are copied into the list once on first load; the legacy field is left untouched.
- **Progress.** The lesson reader records the last opened lesson ("Continue where you left off" on `/learn`) and has an explicit "Mark lesson as complete" action; opening never completes. Reset in Settings.

## Navigation map

`/` Welcome (Enter, Saved items, Settings) → `/learn` (resume card, built-in Daniel 2 card, level selector, course catalog, Saved items, Settings) → `/course/:id?level=` → `/lesson/:id?level=` (bookmark, mark complete, previous/next, back to course).
`/daniel-2` (Start / Resume / Start over) → `/daniel-2-lesson` (14 scenes; Back = previous scene (leaves from scene 1), ✕ on later scenes = leave with progress saved; `?scene=<id>` opens a saved scene). `/saved` lists saved lessons and Daniel 2 scenes. `/settings`: appearance, clear offline lessons, reset reading progress (each touches only its own data). Unknown links show a themed "Page not found"; a screen that crashes shows a themed error with retry.

Levels: links always carry `?level=`; a link without it uses the learner's saved level. Errors: a 404, or a 400 from the backend's id validation, is shown as "not available"; network failures, timeouts, 429 and 5xx are transient (retry, and a saved copy if there is one); a saved copy or a "cannot reach the server" screen retries automatically when the app returns to the foreground or the browser comes back online.

Release readiness, native-test steps and open decisions: see `RELEASE-READINESS.md`. A release build has no default API URL (set `EXPO_PUBLIC_API_URL` when building).

Pictures: all bundled imagery is registered in `src/config/images.ts` (Daniel 2 scene pictures in `src/features/daniel-2/assets.ts`); today that is one generated placeholder. A picture that fails to load falls back to a themed block.

## Backend routes used (public, no authentication)

| Screen | Request |
| --- | --- |
| Catalog | `GET /courses?level=BEGINNER\|INTERMEDIATE\|ADVANCED` |
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

- `assets/images/placeholder/daniel-2-hall-placeholder.jpg` is a generated, stylised illustration, not a photograph and not a depiction of a real place.
- The Daniel 2 introduction text is original introductory copy, not Scripture. **No Bible text is bundled.**
- "Start lesson" on the Daniel 2 introduction shows a note that the lesson scenes come in the next phase.
- App icon and splash image are still the Expo defaults.

## Not built yet (on purpose)

Approved Daniel 2 wording and artwork, a backend-published Daniel 2 course, Scripture navigation, quizzes (the backend's public quiz API exists), offline caching, device-local progress, audio,.
