import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Small helpers for JSON values in AsyncStorage. Every failure (storage error, unparsable JSON, data that does not pass
 * `parse`) is swallowed into "nothing stored", so a damaged value can never crash the app; callers start from a clean state.
 * Local storage is unencrypted: never put credentials or personal data in anything written through here.
 */
export async function readJson<T>(key: string, parse: (raw: unknown) => T | null): Promise<T | null> {
  try {
    const text = await AsyncStorage.getItem(key);
    if (text === null) return null;
    return parse(JSON.parse(text));
  } catch {
    return null;
  }
}

/** Best-effort write: a failure leaves the in-memory state in charge for the session. */
export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // keep going
  }
}

export async function removeKey(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // keep going
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
