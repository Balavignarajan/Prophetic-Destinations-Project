import AsyncStorage from '@react-native-async-storage/async-storage';

import type { StoredAssessmentResult } from '@/features/assessment/assessment-types';
import { type LearningLevel, isLearningLevel } from '@/learning/levels';

/**
 * Device-local, NON-SENSITIVE preferences (the appearance choice, the learning level). Never put credentials, tokens or
 * personal data here: AsyncStorage is unencrypted. A storage failure is never fatal: reads fall back to `null`, writes are
 * best-effort, and the app keeps working with the in-memory value for the session.
 */
const KEYS = {
  theme: 'pd.preferences.theme',
  level: 'pd.preferences.level',
  welcomeSeen: 'pd.preferences.welcomeSeen',
  bibleLastRead: 'pd.bible.lastRead',
  assessmentResult: 'pd.assessment.lastResult',
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

/**
 * Whether the first-launch welcome screen has been passed. A learner who already chose a level before this flag existed counts
 * as having passed it, so existing users are not sent back to the welcome screen.
 */
export async function readWelcomeSeen(): Promise<boolean> {
  if ((await read(KEYS.welcomeSeen)) === '1') return true;
  return (await readLearningLevel()) !== null;
}

export function saveWelcomeSeen(): Promise<void> {
  return write(KEYS.welcomeSeen, '1');
}

/** Where the learner last read in the Bible reader (book and chapter only), so "Continue reading" can offer it. Device-local and non-sensitive. */
export async function readBibleLastRead(): Promise<{ bookId: string; chapter: number } | null> {
  const stored = await read(KEYS.bibleLastRead);
  if (!stored) return null;
  try {
    const value = JSON.parse(stored) as { bookId?: unknown; chapter?: unknown };
    return typeof value.bookId === 'string' && typeof value.chapter === 'number' && Number.isInteger(value.chapter) && value.chapter >= 1 ? { bookId: value.bookId, chapter: value.chapter } : null;
  } catch {
    return null;
  }
}

/**
 * The last completed assessment (which one, which version, what the backend recommended, when). Device-local and non-sensitive: the answers are never stored,
 * and this record never changes the learning level (that is only ever set by the learner's own choice).
 */
export async function readAssessmentResult(): Promise<StoredAssessmentResult | null> {
  const stored = await read(KEYS.assessmentResult);
  if (!stored) return null;
  try {
    const value = JSON.parse(stored) as Partial<StoredAssessmentResult>;
    return typeof value.assessmentId === 'string' && typeof value.version === 'number' && isLearningLevel(value.recommendedLevel) && typeof value.completedAt === 'string'
      ? { assessmentId: value.assessmentId, version: value.version, recommendedLevel: value.recommendedLevel, completedAt: value.completedAt }
      : null;
  } catch {
    return null;
  }
}

export function saveAssessmentResult(result: StoredAssessmentResult): Promise<void> {
  return write(KEYS.assessmentResult, JSON.stringify(result));
}

export function saveBibleLastRead(position: { bookId: string; chapter: number }): Promise<void> {
  return write(KEYS.bibleLastRead, JSON.stringify(position));
}
