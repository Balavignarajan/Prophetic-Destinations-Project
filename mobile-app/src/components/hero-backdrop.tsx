import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { useTheme } from '@/theme';

export type HeroBackdropProps = {
  source: ImageSource | number;
  /** How far down the screen the picture reaches before it fades into the background (0 to 1). Default 0.75. */
  reach?: number;
  /** Extra darkening over the whole picture (0 to 1), for screens where text sits on the image. */
  dim?: number;
  /** Describes the picture for screen readers; omit for purely decorative imagery. */
  accessibilityLabel?: string;
};

/**
 * A full-bleed picture that fades into the app background: a gradient darkens the top (so the status bar stays
 * legible) and the bottom (so text and buttons sit on solid dark). Colours come from the theme's gradients.
 */
export function HeroBackdrop({ source, reach = 0.75, dim = 0, accessibilityLabel }: HeroBackdropProps) {
  const { colors, gradients } = useTheme();
  const [failed, setFailed] = useState(false);
  const reduceMotion = useReduceMotion();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.picture, { height: `${Math.round(reach * 100)}%` }]}>
        {failed ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceElevated }]} /> : null}
        <Image
          source={source}
          contentFit="cover"
          contentPosition="center"
          transition={reduceMotion ? 0 : 400}
          onError={() => setFailed(true)}
          accessible={Boolean(accessibilityLabel)}
          accessibilityLabel={accessibilityLabel}
          style={StyleSheet.absoluteFill}
        />
        {dim > 0 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: dim }]} /> : null}
        <LinearGradient colors={gradients.heroScrimTop} style={styles.top} />
        <LinearGradient colors={gradients.heroScrim} style={styles.bottom} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  picture: { width: '100%', overflow: 'hidden' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, height: '28%' },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '65%' },
});
