/**
 * Every bundled picture the app shows, in ONE place.
 *
 * Artwork is bundled locally for offline availability. The welcome cover is generated artwork.
 */
export type AppImage = {
  source: number;
  /** For screen readers; says plainly when the picture is a placeholder. */
  alt: string;
  isPlaceholder: boolean;
};

export const appImages = {
  /**
   * Generated portrait illustration of a Babylonian-inspired city at golden hour; an atmospheric impression, not a depiction of a real place.
   */
  welcome: {
    source: require('@/assets/images/welcome/welcome-cover.jpg') as number,
    alt: 'Illustration of an ancient Babylonian-inspired city and gateway at golden hour',
    isPlaceholder: false,
  },
} as const satisfies Record<string, AppImage>;
