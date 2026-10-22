import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Small helpers for JSON values in AsyncStorage. `readJson` swallows every failure (storage error, unparsable JSON, data that does
 * not pass `parse`) into "nothing stored", so a damaged value can never crash the app; callers start from a clean state. That is right
 * for caches and preferences, but NOT for data that must never be overwritten by mistake (the learner's progress): those callers use
 * `readJsonResult`, which says WHY nothing was read.
 * Local storage is unencrypted: never put credentials or personal data in anything written through here.
 */
export type JsonRead<T> =
  /** Nothing is stored under the key. */
  | { status: 'missing' }
  | { status: 'ok'; value: T }
  /** The storage itself could not be read, so what is stored (if anything) is unknown. It has not been touched. */
  | { status: 'unreadable' }
  /** Something is stored but it is not valid JSON, or it does not pass `parse`. It has not been touched. */
  | { status: 'invalid' };

/** Reads a JSON value and tells "nothing stored" apart from "could not read" and "stored but not valid". Never throws, never writes. */
export async function readJsonResult<T>(key: string, parse: (raw: unknown) => T | null): Promise<JsonRead<T>> {
  let text: string | null;
  try {
    text = await AsyncStorage.getItem(key);
  } catch {
    return { status: 'unreadable' };
  }
  if (text === null) return { status: 'missing' };
  try {
    const value = parse(JSON.parse(text));
    return value === null ? { status: 'invalid' } : { status: 'ok', value };
  } catch {
    return { status: 'invalid' };
  }
}

export async function readJson<T>(key: string, parse: (raw: unknown) => T | null): Promise<T | null> {
  const result = await readJsonResult(key, parse);
  return result.status === 'ok' ? result.value : null;
}

/** Best-effort write: a failure leaves the in-memory state in charge for the session. */
export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // keep going
  }
}

/** Like writeJson, but says whether the value was stored (used where the learner must be told that something could not be saved). */
export async function tryWriteJson(key: string, value: unknown): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export async function removeKey(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // keep going
  }
}

/** Like removeKey, but says whether the value is gone (used where the learner is told that something was erased). */
export async function tryRemoveKey(key: string): Promise<boolean> {
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
