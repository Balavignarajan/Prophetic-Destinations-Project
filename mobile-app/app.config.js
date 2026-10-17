// Native settings are static JSON (app.json), but their colours must come from the theme like everything else.
// This file adds them from src/theme/colors.ts. The native splash screen, the native root window and the Android adaptive
// icon are STATIC (fixed at build time), so they use the dark theme, the app's default and its cinematic identity. A user who
// chooses Light sees the dark splash for a moment; every screen after it follows the chosen theme.
// tsx is registered so this plain-JS config can load the TypeScript theme file.
require('tsx/cjs');

const { colorSchemes } = require('./src/theme/colors.ts');

const native = colorSchemes.dark;

// Store identifiers are NOT decided yet and are deliberately not hard-coded. Once the project owners choose them, supply them at
// build time (for example in the EAS build profile or the shell): PD_ANDROID_PACKAGE=com.example.app PD_IOS_BUNDLE_ID=com.example.app
// Until then the native projects have no identifier and a store build cannot be produced. Development in Expo Go is unaffected.
const androidPackage = process.env.PD_ANDROID_PACKAGE?.trim();
const iosBundleIdentifier = process.env.PD_IOS_BUNDLE_ID?.trim();

/** @param {{ config: import('expo/config').ExpoConfig }} context */
module.exports = ({ config }) => ({
  ...config,
  backgroundColor: native.background,
  ios: { ...config.ios, backgroundColor: native.background, ...(iosBundleIdentifier ? { bundleIdentifier: iosBundleIdentifier } : {}) },
  android: {
    ...config.android,
    ...(androidPackage ? { package: androidPackage } : {}),
    adaptiveIcon: {
      ...(config.android && config.android.adaptiveIcon),
      backgroundColor: native.background,
    },
  },
  plugins: (config.plugins || []).map((plugin) =>
    Array.isArray(plugin) && plugin[0] === 'expo-splash-screen'
      ? [plugin[0], { ...plugin[1], backgroundColor: native.background }]
      : plugin,
  ),
});
