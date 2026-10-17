# Release readiness

Status after the release-preparation pass. **The app is NOT store-ready.** Code, static checks and exports pass, and the key flows
were exercised on an Android emulator (not a physical device, not iOS), but identifiers, branding, licensing, content approval and iOS/physical-device validation are
all still outstanding (sections 1, 7 and 8).

Legend: **Done** = implemented and verified as stated. **Pending** = needs a decision, asset or access from the project owners.
**Not tested** = no test was run.

## 1. Release configuration

| Item | Current state | Status / what is needed |
| --- | --- | --- |
| Android package id | none set | **Pending.** Choose the final reverse-domain id. Supply it at build time as `PD_ANDROID_PACKAGE` (read by `app.config.js`); nothing is hard-coded. Without it a store build cannot be produced (Expo Go development is unaffected). |
| iOS bundle id | none set | **Pending.** Same, via `PD_IOS_BUNDLE_ID`. |
| `slug` | `mobile-app` (Expo template default) | **Pending.** Confirm or rename. It names the Expo project; changing it later affects EAS project linkage. |
| URL `scheme` | `mobileapp` (template default) | **Pending.** Confirm the deep-link scheme (links look like `mobileapp://...`). |
| App name | `Prophetic Destinations` | Done. |
| App icon | Expo starter art (`assets/images/icon.png`, Android adaptive icon files, `assets/expo.icon`) | **Pending.** Approved icon set required. |
| Splash artwork | Expo starter glyph (`assets/images/splash-icon.png`) on the dark theme colour | **Pending.** Approved artwork required. The native splash is static and always dark (see README). |
| `ios.icon` and `expo-doctor` | `ios.icon` points at `./assets/expo.icon` (the Expo template's Icon Composer bundle, a *directory*) | Resolved upstream, nothing to change: `expo-doctor` 1.21.4 briefly reported "cannot access file at ./assets/expo.icon"; 1.20.4 and the newer 1.21.5 both pass 21/21. The icon is still the Expo starter and must be replaced (above). |
| `LICENSE` | MIT, "650 Industries, Inc." (Expo template) | **Pending.** The owners must choose the project's licence; the app code is not Expo's. |
| Production API URL | not set; **no default in release builds** | **Pending.** Provide the deployed `https://` URL (section 4). |
| Build/signing (EAS or other), store listings, privacy policy | not configured | **Pending.** Owner decisions. |
| Unreferenced Expo starter assets | `react-logo*.png`, `expo-logo.png`, `expo-badge*.png`, `tutorial-web.png`, `logo-glow.png`, `tabIcons/` | Can be deleted once real artwork is in. Left in place (starter files, harmless). |
| Dependencies not imported by app code | `@expo/ui`, `expo-device`, `expo-glass-effect`, `expo-symbols` (others are expo-router/Expo requirements) | Left; remove only after checking they are not peers. |

## 2. Catalog: test and demo content (NOT fixed; documented limitation)

The learner catalog shows whatever the backend has published. The shared development database currently contains leftover
integration-test courses (titles like `int-0ee17579-s-publish`, 24 at the Beginner level) and the `[DEMO] Synthetic course for
backend demonstration` course created by `npm run seed:demo`, all with ordinary "published" status.

The public contract (`GET /courses`, `GET /courses/:id`) carries only `courseId`, `catalogVersion`, `title`, `description` and counts. **There is no
field that marks a course as test, demo or non-production**, so the app cannot tell test data apart safely. A filter on title
prefixes (`int-`, `[DEMO]`) was deliberately **not** added: it is a guess, could hide real content or miss other test content, and would
silently change what learners see.

**Decision needed (backend/data owners, not the app):**
1. A production build must point at a **production backend/database that contains only approved courses**. Do not point a release at the shared development database.
2. Before any release against shared data, unpublish or archive the test and demo courses (a data task for the backend team; this pass did not touch the database).
3. If the project wants the app to enforce this, the backend would need to expose an explicit marker (for example an audience or demo flag) so the app can filter on a real contract field.

## 3. Daniel 2 timeline label (NOT changed; decision needed)

The timeline scene's intro says: "Only the first identification is named in the passage; the rest are traditional or disputed, as
labelled." The last phase ("God's everlasting kingdom") is tagged **Stated in the passage**, and so is Babylon. Both statements are
defensible, but they read as inconsistent. No *approved* content establishes the intended meaning (all Daniel 2 wording is built-in and
pending approval), so the wording was not changed.

**Decision needed (content reviewer), pick one:**
- **A.** The sentence is about the *kingdoms of the image*: reword to "Of the four kingdoms, only the first, Babylon, is named in the passage; the others are traditional or disputed, as labelled." The final phase keeps "Stated in the passage" because Daniel 2:44–45 states that God's kingdom will be set up.
- **B.** Tags should mean "the passage names this kingdom": change the last phase's tag to a different label, for example "Stated in the passage (a promise, not a dated kingdom)", or remove the tag for it.
Also confirm the exact wording in `src/features/daniel-2/content/scenes.ts` (timeline `intro`) and `content/timeline.ts`.

## 4. API URL configuration (Done in code; values Pending)

`EXPO_PUBLIC_API_URL` is the only setting (`src/config/api.ts`, documented in `.env.example`). Expo inlines it at build time.

| Target | URL | Verified |
| --- | --- | --- |
| Android emulator (dev, nothing set) | `http://10.0.2.2:3001/api/v1` (default) | **Verified on the emulator**: the catalog loaded real courses through this address (section 6). |
| iOS simulator, web (dev, nothing set) | `http://localhost:3001/api/v1` (default) | Web verified earlier; iOS **not tested**. |
| Physical Android device | set `EXPO_PUBLIC_API_URL` to your computer's LAN address, e.g. `http://192.168.1.20:3001/api/v1` (same Wi-Fi, backend listening on `0.0.0.0`, firewall allows port 3001) | **Not tested** (no physical device). |
| Release / production | set `EXPO_PUBLIC_API_URL` to the deployed `https://` API at build time | **No default and no URL stored.** If missing or malformed, the app shows "App not configured" instead of calling `localhost` (new in this pass; see `src/config/api.ts`, `ConfigurationError`). Android release builds block plain `http://`, so production must be `https`. |

The web build additionally needs its origin in the backend's `CORS_ORIGINS`.

## 5. Android emulator: what was wrong and how to run it

Findings on this machine (Windows 11, AMD64):
- The existing AVD `Pixel_5` is **arm64** (`image.sysdir.1=system-images\android-33\google_apis\arm64-v8a\`). That image is not installed and an arm64 guest cannot run on an AMD64 host, so the emulator fails with "Broken AVD system path".
- `system-images\android-33\google_apis\x86_64` exists but is **empty** (an incomplete install).
- `system-images\android-36.1\google_apis_playstore\x86_64` (API 36.1, Google Play, revision 4) is **complete and installed**.
- WHPX acceleration is available (`emulator -accel-check`: "WHPX ... is installed and usable").
- No `cmdline-tools` (so no `sdkmanager`/`avdmanager`) and no Java on `PATH`.

Nothing in the SDK was changed. A **new** AVD `PD_Pixel5_API36_x86_64` was created (files only, under `%USERPROFILE%\.android\avd`) from the installed image; `Pixel_5` was left untouched.

Reproduce, option 1 (no downloads; what was done): create `%USERPROFILE%\.android\avd\PD_Pixel5_API36_x86_64.ini` and `...\PD_Pixel5_API36_x86_64.avd\config.ini` with `abi.type=x86_64`, `hw.cpu.arch=x86_64`, `tag.id=google_apis_playstore`,
`image.sysdir.1=system-images\android-36.1\google_apis_playstore\x86_64\`, `hw.ramSize=3072`, `hw.gpu.mode=swiftshader_indirect`, `target=android-36` (copy `Pixel_5.avd\config.ini` and change those lines; also remove `skin.path`, `hw.camera.*` and the arm64 `image.sysdir.1`).

Option 2 (Android Studio): Device Manager → Create Device → Pixel 5 → system image **x86_64, API 36 (Google Play)** → Finish.

Option 3 (command line, installs a component; needs `cmdline-tools` first via Android Studio → SDK Manager → SDK Tools → "Android SDK Command-line Tools (latest)"):
```
sdkmanager --install "system-images;android-36.1;google_apis_playstore;x86_64"
avdmanager create avd -n PD_Pixel5_API36_x86_64 -k "system-images;android-36.1;google_apis_playstore;x86_64" -d pixel_5
```

Launch (set the SDK root; the emulator refuses to start without it):
```
set ANDROID_SDK_ROOT=%LOCALAPPDATA%\Android\Sdk
set ANDROID_HOME=%ANDROID_SDK_ROOT%
%ANDROID_SDK_ROOT%\emulator\emulator.exe -avd PD_Pixel5_API36_x86_64 -no-audio -no-snapshot -gpu swiftshader_indirect -accel on
%ANDROID_SDK_ROOT%\platform-tools\adb.exe wait-for-device
```
(Add `-no-window` for headless use.) First cold boot took about 2 minutes. If "System UI isn't responding" appears on a slow machine, tap **Wait**.

## 6. Native test: reproducible steps and what was run

**Platform actually used: Android emulator `PD_Pixel5_API36_x86_64` (Pixel 5 profile, Android 16 / API 36.1, x86_64, Google Play image,
WHPX-accelerated) running the app in Expo Go 57.0.9, loading the JS bundle from Metro and the API from the local backend at
`http://10.0.2.2:3001/api/v1`. This is a development-client run, NOT a release build, NOT a physical device and NOT iOS.** Checks were driven with
`adb` (uiautomator accessibility dumps, `input tap`/`keyevent`, `screencap`); results come from the app's real accessibility tree.

Reproduce:
1. Start the emulator (section 5), the backend (`node dist/main` in `backend/`; it listens on 0.0.0.0:3001) and Metro (`npx expo start --port 8081`; do NOT use `CI=1` while editing code: that disables file watching and serves a stale bundle).
2. Install Expo Go: `npx expo start --android` downloads it from GitHub; if that times out, fetch `https://github.com/expo/expo-go-releases/releases/download/Expo-Go-57.0.9/Expo-Go-57.0.9.apk` (the URL is `sdkVersions["57.0.0"].androidClientUrl` from `https://api.expo.dev/v2/versions/latest`, ~209 MB, verify it opens as a zip) and `adb install -r -g` it.
3. Open the app: `adb shell am start -a android.intent.action.VIEW -d exp://10.0.2.2:8081 host.exp.exponent`. Deep links: `exp://10.0.2.2:8081/--/daniel-2-lesson?scene=quiz`.
4. Expo Go quirks that are not app defects: a first-run "developer menu" sheet (tap Continue, then Close); a floating **Tools button** drawn over the top-right corner (drag it to the left edge, otherwise it swallows taps on the header's right-most icon); "System UI isn't responding" on a slow machine (tap Wait).

What was run and the result (all on the emulator):

| Area | Result |
| --- | --- |
| Welcome renders; Saved / Settings / Enter are labelled buttons | Passed |
| Theme: Dark is the first-launch default; choosing Light marks it selected; **Light survives a force-stop and relaunch** (AsyncStorage on device) | Passed |
| System mode follows the OS night mode both ways (`cmd uimode night yes/no`) | Passed |
| **Catalog loads real courses through the emulator default `10.0.2.2:3001`**; Daniel 2 card labelled separate from the catalog; level selector exposes radios | Passed |
| Course → lesson reader; star toggles Save/Remove; mark complete / undo; course list shows "Completed"; "Continue where you left off"; Saved items lists the lesson with its type | Passed |
| Offline (airplane mode + Wi-Fi/data off): course opens as a saved copy with the banner; previously opened lesson readable and flagged; a never-opened lesson says "Not available offline" | Passed |
| Connectivity restored: the Try again button (exact match) loads the lesson itself, with no saved-copy banner | Passed (first attempt looked like a failure because my script tapped the message text instead of the button, then a false pass; re-run strictly: 3/3) |
| Daniel 2: start, **Android hardware back steps back one scene and leaves only from scene 1** (with progress kept), no duplicate Leave control on scene 1 | Passed |
| Statue tap names the material; interpretation hidden until revealed; kingdom scene labels (Bible reference / interpretation / historical context / historical application) and "verse text is not included" note | Passed |
| Quiz: Continue disabled until finished; no feedback before submit; feedback after each answer; 4 / 4; Continue enabled | Passed |
| **Large text** (system font scale 1.5 and 2.0): kingdom scene and welcome render, controls reachable, nothing past the right screen edge | Passed |
| Animations disabled (system animation scales 0): next scene appears, no crash | Passed (the reduced-motion *branch* itself is not observable from outside; see section 7) |
| Touch targets >= 44 dp on welcome, settings, catalog, lesson, intro, statue | Passed (after the fix below). One residual flag in the last run: the statue's head after scrolling, measured with its bounds clipped by the scroll viewport; unscrolled it is 62 x 62 dp |
| Status bar icons (Dark theme, Light theme, over the Welcome picture) | Passed after the fix below |
| Production-mode bundle with no `EXPO_PUBLIC_API_URL` shows "App not configured" and makes **zero** API requests | Passed (tested on the web production export in headless Chrome, not on a device) |

Native defects found by this testing and fixed (none of them was visible in the earlier web-only review):
1. **Status bar icons were white on the Light theme** (white clock on ivory) after opening any screen from Welcome: the Welcome screen stays mounted under the next screen and its always-light `StatusBar` kept winning. New `HeroStatusBar` applies light icons only while a hero screen is focused. Verified.
2. **The Daniel 2 intro showed stale progress** ("Start lesson", 0%) after coming back from the lesson, because it read storage once on mount. It now reloads on focus and shows "Resume lesson" and the scene label. Verified.
3. **The statue's feet were 26 dp tall**, below the 44 dp touch minimum. Every interactive part now has a 44 dp minimum. Verified.
4. **Android hardware back left the whole Daniel 2 lesson from any scene**, unlike the on-screen Back. Now consistent. Verified.

Not covered by these tests: the offline retry on the AppState "active" event (only the button path and airplane-mode transitions were exercised), a real TalkBack session, iOS, a physical device, a release/standalone Android build, and long-session behaviour.


## 7. Accessibility and native compatibility (inspection vs tests)

Legend: **T** = tested on the emulator, **I** = code inspection only, **N** = not tested anywhere.

| Area | Finding |
| --- | --- |
| Safe areas / notch | I+T: `ScreenContainer` applies top/bottom/left/right insets; Welcome and the Daniel intro position controls from `useSafeAreaInsets`. Emulator screenshots (edge-to-edge, API 36.1, gesture navigation) show headers clear of the status bar and footers clear of the gesture bar. iOS notch/Dynamic Island **N**; devices with a camera cutout **N**. |
| Status bar | T: dark icons on the Light theme, light icons on Dark and over the Welcome/intro picture. A real defect (white icons on ivory) was found and fixed this pass, see section 6. |
| Android hardware/gesture back | **Changed this pass:** in the Daniel 2 lesson, back now steps to the previous scene (as the on-screen Back does) and leaves only from scene 1 (previously it left the whole lesson from any scene). Elsewhere the default stack back applies. Tested on the emulator (section 6). `predictiveBackGestureEnabled` is `false`; the gesture-navigation back animation on a real Android 14+ device **N**. |
| Larger text | I: no `allowFontScaling` overrides, so fonts scale with the system setting; layouts use `minHeight`, wrapping text and `numberOfLines`+ellipsis, not fixed text heights; the hero titles use `adjustsFontSizeToFit`. Tested on the emulator at system font scale 1.5 and 2.0 (section 6): no clipping past the screen edge and controls stay reachable. Visual polish at 2.0 was only eyeballed. iOS Dynamic Type **N**. |
| Keyboard | I: the app has no text inputs, so keyboard avoidance is not applicable. |
| Reduced motion | **Changed this pass:** new `useReduceMotion` hook (device "reduce motion"/"remove animations") now disables the scene fade/rise and the picture cross-fades. Run with system animations disabled without a crash (section 6). The reduced-motion branch itself was **not observed** directly. |
| TalkBack / VoiceOver | I+T(partial): labels, roles, `aria-checked`, `aria-disabled`, `aria-expanded`, live regions and headers are in place, and the real Android accessibility tree (uiautomator) exposes them: buttons and radios with labels and `checked`, disabled controls with `enabled=false`, headers (section 6). **A real TalkBack/VoiceOver reading-order pass was NOT performed.** Known risk: iOS ignores `accessibilityLiveRegion`; some roles (`radiogroup`, `list`) map differently per platform. |
| Touch targets | T: clickable nodes measured on the emulator against 44 dp on the main screens (section 6); one defect found and fixed (statue feet). Expo Go's own floating Tools button overlaps the header's right-most icon in development only. |
| Contrast | Theme guard checks WCAG contrast for both themes (passes). Gold-on-image text readability depends on the placeholder picture; recheck with final art. |
| Offline transitions | T on the emulator (airplane mode on/off, Try again). Retry also listens to AppState/`online` because there is no network-status library; on native a screen that stays in the foreground relies on the Try again button, and a saved-copy course screen keeps its banner until the learner retries or reopens it (by design). Flaky real-world connections **N**. |
| iOS (everything) | **N**: no macOS/simulator available. |
| Physical Android device | **N**. |

## 8. Content approval and licensing (all Pending; not code defects)

- Daniel 2 wording, all 14 scenes (`src/features/daniel-2/content/scenes.ts`).
- Prophetic identifications and their labels (stated / traditional / interpretations differ), including the timeline decision in section 3.
- Historical dates and claims (periods, history cards, timeline ranges).
- Quiz questions, answers and explanations (`content/quiz.ts`).
- Artwork: one generated placeholder picture; the statue is a drawing made of views, not a 3D model. Replace via `src/config/images.ts` / `src/features/daniel-2/assets.ts`.
- Bible text: **none is bundled**; every reference shows "Verse text is not included in the app yet". A licensed translation and its attribution wording must be approved before filling `ScriptureRef.text`.
- The built-in Daniel 2 lesson stays separate from the backend catalog until an approved course and content contract exist.

## 9. Remaining release blockers (summary)

1. Store identifiers (Android package, iOS bundle id), slug and scheme confirmed.
2. Approved app icon and splash artwork; project licence.
3. Production API URL and a production backend/database with only approved courses (section 2).
4. Content approval and Bible-text licensing (section 8) and the timeline-label decision (section 3).
5. iOS validation, a physical Android device pass, a release (non-Expo-Go) Android build test, and a real TalkBack/VoiceOver pass.
6. Build/signing, store listings, privacy policy.
