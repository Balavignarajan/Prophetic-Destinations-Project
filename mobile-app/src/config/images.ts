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
  /**
   * The Welcome screen's cover: a portrait (1080 x 1920) illustration of an ancient stone gateway hall lit by warm golden light, with a dark
   * lower half so the text and buttons stay readable. It is drawn by code, not photographed or painted, and is an atmospheric impression, not a
   * depiction of a real place (scripts/generate-welcome-cover.py regenerates it; `python scripts/generate-welcome-cover.py out.jpg`).
   * To use approved artwork instead, save it as assets/images/welcome/welcome-cover.jpg (about 1200 x 2133, under roughly 400 KB, bright
   * subject in the upper third) and nothing else needs editing.
   */
  welcome: {
    source: require('@/assets/images/welcome/welcome-cover.jpg') as number,
    alt: 'Illustration of an ancient stone gateway hall lit by warm golden light',
    isPlaceholder: false,
  },
} as const satisfies Record<string, AppImage>;
