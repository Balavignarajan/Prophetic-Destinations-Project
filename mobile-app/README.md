# Prophetic Destinations — mobile app

React Native + Expo (SDK 57) + TypeScript, with Expo Router. The learner app has **no accounts**: progress, bookmarks and quiz results will be stored on the device.

## Run it

```bash
npm install
npx expo start            # then press a (Android), i (iOS) or w (web); or scan the QR code with Expo Go
```

Checks: `npm run typecheck`, `npx expo lint`, `npm run check:theme`, `npx expo-doctor`.

The backend address comes from `EXPO_PUBLIC_API_URL` (see `.env.example`; Android emulator: `http://10.0.2.2:3001/api/v1`). Nothing calls the backend yet.

## Structure

```
src/app/            Expo Router routes (thin: each file renders one screen). _layout.tsx = fonts, status bar, navigation theme
src/screens/        Screen components (welcome-screen, daniel-2-intro-screen)
src/components/ui/  The design-system components (AppText, PrimaryButton, ScreenContainer, Card, ProgressIndicator, ...)
src/components/     Larger shared pieces (hero-backdrop)
src/theme/          colors, spacing, typography, radius, shadows; index.ts exports `useTheme()`
src/navigation/     Navigation container theme (built from src/theme)
src/config/         api.ts (backend base URL)
assets/images/placeholder/   Placeholder artwork — replace with licensed imagery
scripts/check-theme.ts       Contrast + stray-colour check
```

Flow: `/` (Welcome) → `/daniel-2` (Daniel 2 introduction).

## The theme (read this before touching a colour)

**Every colour in the app is defined in `src/theme/colors.ts` and nowhere else.**

- `palette` holds the raw values: the manager's **Antique Gold `#A3801F`**, **Deep Black `#07090F`** and **Charcoal `#131211`**, plus the supporting values.
- `colors` maps them to semantic tokens (`background`, `surface`, `primary`, `onPrimary`, `textPrimary`, `textMuted`, `border`, `error`, `overlay`, ...). Screens and components use **tokens only**, through `useTheme()`; never a hex, `rgb()` or named colour.
- `app.config.js` reads the same file for the splash screen, native root background and Android adaptive-icon background, so even native settings follow the theme.
- Change a value in `colors.ts` (for example the gold) and the whole app follows without touching any screen. Run **`npm run check:theme`** afterwards: it re-checks WCAG contrast for the text pairings the UI uses and fails if any colour literal appears outside `colors.ts`.
- Photographs and illustrations are assets and are not recoloured by the theme.

Gold is for the main action, progress, highlights and selected states. Text on gold is dark (`onPrimary`), which keeps it at 5.4:1; the pressed state of the primary button is a lighter gold, not a darker one, for the same reason.

Typography: Cinzel (display titles, loaded in `_layout.tsx`), the platform serif for Scripture and lesson prose, the platform sans for UI text. Touch targets are 48 points (never below 44). Screens use `ScreenContainer`, which handles safe areas and keeps content readable on tablets.

## What is placeholder

- `assets/images/placeholder/daniel-2-hall-placeholder.jpg` is a generated, stylised illustration, not a photograph and not a depiction of a real place.
- The Daniel 2 introduction text is original introductory copy, not Scripture. **No Bible text is bundled.**
- "Start lesson" shows a note that the lesson scenes come in the next phase.
- App icon and splash image are still the Expo defaults.

## Not built yet (on purpose)

Learning levels, the course/lesson catalog and lesson screens (they will use the backend's published snapshots; the only enabled content type is `RICH_TEXT`), Scripture navigation, quizzes (the backend's public quiz API exists), offline caching, device-local progress, audio.
