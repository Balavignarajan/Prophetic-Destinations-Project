import LottieView, { type AnimationObject } from 'lottie-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/theme';

/** Why a Lottie animation could not be played: the server could not be reached, or what came back is not an animation this app will play. */
export type LottieFailure = 'unreachable' | 'unusable';

const REQUEST_TIMEOUT_MS = 15_000;
/** The backend refuses larger Lottie files at upload (LOTTIE_LIMITS.maxBytes); a larger answer is not one of them. */
const MAX_CHARS = 2 * 1024 * 1024;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * The animation as the learner route serves it, or null when it is not a Lottie document. The document is DATA drawn by the platform's Lottie renderer; no part
 * of it is ever run. (The backend only stores Lottie files without expressions or links to other files, and serves one only to a lesson that names it.)
 */
function readAnimation(text: string): AnimationObject | null {
  if (text.length === 0 || text.length > MAX_CHARS) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const doc = parsed as Record<string, unknown>;
  if (typeof doc.v !== 'string' || !finite(doc.fr) || !finite(doc.ip) || !finite(doc.op) || !finite(doc.w) || !finite(doc.h) || !Array.isArray(doc.layers)) return null;
  if (doc.w <= 0 || doc.h <= 0 || doc.fr <= 0) return null;
  return { assets: [], ...doc } as unknown as AnimationObject;
}

/**
 * The player of a MEDIA_ANIMATION block of type LOTTIE (lottie-react-native). Mounted only after the learner pressed Play (the block lazy-loads this file): the JSON
 * is fetched then, not before, and nothing is saved for offline use, so a Lottie animation needs a connection. It plays once and reports when it finished; it never
 * loops and never starts by itself.
 */
export default function LottiePlayback({
  uri,
  onFinished,
  onFailed,
  onRatio,
  loop,
  active,
}: {
  uri: string;
  onFinished: () => void;
  onFailed: (reason: LottieFailure) => void;
  onRatio: (ratio: number) => void;
  loop: boolean;
  active: boolean;
}) {
  const { colors } = useTheme();
  const [animation, setAnimation] = useState<AnimationObject | null>(null);
  const player = useRef<LottieView>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    (async () => {
      let text: string;
      try {
        const response = await fetch(uri, { credentials: 'omit', signal: controller.signal });
        if (!response.ok) {
          onFailed('unusable');
          return;
        }
        text = await response.text();
      } catch {
        onFailed('unreachable');
        return;
      } finally {
        clearTimeout(timer);
      }
      const found = readAnimation(text);
      if (!found) {
        onFailed('unusable');
        return;
      }
      onRatio(Math.min(2.4, Math.max(0.75, found.w / found.h)));
      setAnimation(found);
    })();
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [uri, onFailed, onRatio]);

  useEffect(() => {
    if (!animation) return;
    if (active) player.current?.play();
    else player.current?.pause();
  }, [animation, active]);

  if (!animation) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }
  return (
    <LottieView
      ref={player}
      source={animation}
      loop={loop}
      autoPlay={false}
      resizeMode="contain"
      style={{ width: '100%', height: '100%' }}
      onAnimationFinish={(cancelled) => {
        if (!cancelled) onFinished();
      }}
      onAnimationFailure={() => onFailed('unusable')}
    />
  );
}
