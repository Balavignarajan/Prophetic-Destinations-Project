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

The scene-by-scene Daniel 2 experience (See it → Read the Bible → Understand → Explore history → Continue), Scripture navigation, quizzes (the backend's public quiz API exists), offline caching, device-local progress, audio, a real Daniel 2 course (the catalog shows whatever is published).
