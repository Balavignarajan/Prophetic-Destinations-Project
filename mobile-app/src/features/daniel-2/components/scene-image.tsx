import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { type SceneImageKey, daniel2Images } from '../assets';

/** A scene's picture, faded into the page. The picture itself comes from assets.ts (currently a placeholder). */
export function SceneImage({ imageKey, height = 200 }: { imageKey: SceneImageKey; height?: number }) {
  const { gradients, radius } = useTheme();
  const image = daniel2Images[imageKey];
  return (
    <View style={{ height, borderRadius: radius.lg, overflow: 'hidden' }}>
      <Image
        source={image.source}
        contentFit="cover"
        contentPosition={image.focus}
        transition={300}
        accessible
        accessibilityLabel={image.alt}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient colors={gradients.heroScrim} style={styles.fade} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
});
