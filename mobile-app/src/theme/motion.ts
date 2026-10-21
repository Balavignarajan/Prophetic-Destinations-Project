import { Easing, Platform } from 'react-native';

/**
 * The app's motion language: short, calm and the same everywhere. Components take their durations, amplitudes and easing from here
 * instead of choosing their own, and animate only transform and opacity (cheap, and smooth on mid-range phones) wherever they can.
 * Every animation is skipped when the device asks to reduce motion (see `useReduceMotion`), and none of them delays an action.
 */

/** The native driver runs transform and opacity animations off the JavaScript thread. It does not exist on the web. */
export const NATIVE_DRIVER = Platform.OS !== 'web';

export const motion = {
  /** Milliseconds. */
  duration: {
    instant: 90,
    buttonPress: 120,
    buttonRelease: 180,
    cardPress: 160,
    selection: 200,
    reveal: 240,
    screen: 260,
    modal: 280,
    /** A check mark popping in. */
    mark: 320,
    /** The ring that expands behind a mark and fades. */
    halo: 440,
    /** A score settling into place. */
    result: 440,
    /** The whole lesson-complete moment. */
    celebrate: 640,
  },
  /** Scale while pressed (1 is normal size) and the starting scale of small "settle" effects. */
  scale: {
    button: 0.975,
    /** Quieter buttons (destructive actions) shrink a little less. */
    buttonQuiet: 0.985,
    card: 0.988,
    option: 0.99,
    segment: 0.97,
    tabIcon: 0.9,
    radioDot: 0.4,
  },
  /** Points of travel for entrances. */
  offset: {
    reveal: 6,
    /** The lift for reveals inside educational blocks (timeline events, prophecy panels). */
    subtle: 4,
    sheet: 24,
  },
  /** Neighbouring items start a little apart, but never more than `max` steps, so nothing waits long to appear. */
  stagger: {
    step: 60,
    max: 3,
  },
  easing: {
    standard: Easing.out(Easing.cubic),
    press: Easing.out(Easing.quad),
  },
} as const;

/** Start delay (milliseconds) for the nth item of a short group: 0, 60, 120, 180, 180, ... */
export const staggerDelay = (index: number) => Math.min(Math.max(index, 0), motion.stagger.max) * motion.stagger.step;
