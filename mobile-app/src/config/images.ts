/**
 * Every bundled picture the app shows, in ONE place (the Daniel 2 scene pictures are keyed separately in
 * src/features/daniel-2/assets.ts, and they too resolve to files registered here).
 *
 * The only artwork today is a generated PLACEHOLDER: a stylised columned hall. It is not a photograph, not a depiction of a
 * real place and not a 3D model. To use approved artwork, add the file under assets/images/ and change the `source` line:
 * nothing else needs editing. Keep pictures to roughly 1200 px on the long side so the bundle stays small.
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
} as const satisfies Record<string, AppImage>;
