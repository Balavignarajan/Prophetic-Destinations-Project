import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { useTheme } from '@/theme';

import { type SceneImageKey, daniel2Images } from '../assets';

/** A scene's picture, faded into the page. The picture itself comes from assets.ts (currently a placeholder). */
export function SceneImage({ imageKey, height = 200 }: { imageKey: SceneImageKey; height?: number }) {
  const { colors, gradients, radius } = useTheme();
  const [failed, setFailed] = useState(false);
  const reduceMotion = useReduceMotion();
  const image = daniel2Images[imageKey];
  return (
    <View style={{ height, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceElevated }}>
      <Image
        source={image.source}
        contentFit="cover"
        contentPosition={image.focus}
        transition={reduceMotion ? 0 : 300}
        onError={() => setFailed(true)}
        accessible
        accessibilityLabel={image.alt}
        style={[StyleSheet.absoluteFill, failed ? { opacity: 0 } : null]}
      />
      <LinearGradient colors={gradients.heroScrim} style={styles.fade} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
});
