import AsyncStorage from '@react-native-async-storage/async-storage';

import { type LearningLevel, isLearningLevel } from '@/learning/levels';

/**
 * Device-local, NON-SENSITIVE preferences (the appearance choice, the learning level). Never put credentials, tokens or
 * personal data here: AsyncStorage is unencrypted. A storage failure is never fatal: reads fall back to `null`, writes are
 * best-effort, and the app keeps working with the in-memory value for the session.
 */
const KEYS = {
  theme: 'pd.preferences.theme',
  level: 'pd.preferences.level',
} as const;

async function read(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // best-effort: the choice still applies for this session
  }
}

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** What a first-time user gets: the cinematic dark theme. */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'dark';

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/** The saved appearance preference, or null if none was saved or the stored value is not valid. */
export async function readThemePreference(): Promise<ThemePreference | null> {
  const stored = await read(KEYS.theme);
  return isThemePreference(stored) ? stored : null;
}

export function saveThemePreference(preference: ThemePreference): Promise<void> {
  return write(KEYS.theme, preference);
}

export async function readLearningLevel(): Promise<LearningLevel | null> {
  const stored = await read(KEYS.level);
  return isLearningLevel(stored) ? stored : null;
}

export function saveLearningLevel(level: LearningLevel): Promise<void> {
  return write(KEYS.level, level);
}
