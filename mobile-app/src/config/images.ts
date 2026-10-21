/**
 * Every bundled picture the app shows, in ONE place (the Daniel 2 scene pictures are keyed separately in
 * src/features/daniel-2/assets.ts, and they too resolve to files registered here).
 *
 * Artwork is bundled locally for offline availability. The hall remains a placeholder; the welcome cover is generated artwork.
 */
export type AppImage = {
  source: number;
  /** For screen readers; says plainly when the picture is a placeholder. */
  alt: string;
  isPlaceholder: boolean;
};

export const appImages = {
  hall: {
    source: require('@/assets/images/placeholder/daniel-2-hall-placeholder.jpg') as number,
    alt: 'Placeholder illustration of a columned royal hall',
    isPlaceholder: true,
  },
  /**
   * Generated portrait illustration of a Babylonian-inspired city at golden hour; an atmospheric impression, not a depiction of a real place.
   */
  welcome: {
    source: require('@/assets/images/welcome/welcome-cover.jpg') as number,
    alt: 'Illustration of an ancient Babylonian-inspired city and gateway at golden hour',
    isPlaceholder: false,
  },
} as const satisfies Record<string, AppImage>;
