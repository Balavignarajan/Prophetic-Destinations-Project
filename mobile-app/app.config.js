// Native settings are static JSON (app.json), but their colours must come from the theme like everything else.
// This file adds them from src/theme/colors.ts, so the splash screen and the native background follow a theme
// change without editing app.json. tsx is registered so this plain-JS config can load the TypeScript theme file.
require('tsx/cjs');

const { colors } = require('./src/theme/colors.ts');

/** @param {{ config: import('expo/config').ExpoConfig }} context */
module.exports = ({ config }) => ({
  ...config,
  backgroundColor: colors.background,
  ios: { ...config.ios, backgroundColor: colors.background },
  android: {
    ...config.android,
    adaptiveIcon: {
      ...(config.android && config.android.adaptiveIcon),
      backgroundColor: colors.background,
    },
  },
  plugins: (config.plugins || []).map((plugin) =>
    Array.isArray(plugin) && plugin[0] === 'expo-splash-screen'
      ? [plugin[0], { ...plugin[1], backgroundColor: colors.background }]
      : plugin,
  ),
});
