import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

// One subscription for the whole app, so any number of buttons and cards can ask "should I animate?" without each registering its own listener.
let current = false;
const listeners = new Set<() => void>();

function update(value: boolean) {
  if (value === current) return;
  current = value;
  listeners.forEach((listener) => listener());
}

// Read once when the app starts (before most screens exist) and then kept up to date for the life of the app.
AccessibilityInfo.isReduceMotionEnabled().then(update).catch(() => undefined);
AccessibilityInfo.addEventListener('reduceMotionChanged', update);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => current;
const getServerSnapshot = () => false;

/** True when the device asks to reduce motion (iOS "Reduce Motion", Android "Remove animations", the browser's "prefers-reduced-motion"). Updates live. */
export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
