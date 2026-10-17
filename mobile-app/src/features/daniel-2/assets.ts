/**
 * Every picture the Daniel 2 lesson uses, in ONE place.
 *
 * ALL of these currently point at the same generated PLACEHOLDER illustration (a stylised columned hall). It is not a
 * photograph, not a depiction of a real place and not a 3D model. When approved artwork exists, drop the files into
 * assets/images/daniel-2/ and change only the `source` lines below; no scene needs editing. `focus` picks which part of
 * the picture stays visible when it is cropped.
 */
import { appImages } from '@/config/images';

export type SceneImageKey = 'babylonHall' | 'dreamChamber' | 'mountain';

export type SceneImage = {
  source: number;
  /** Describes the picture to screen readers. Says plainly that it is a placeholder. */
  alt: string;
  focus: 'top' | 'center' | 'bottom';
  isPlaceholder: boolean;
};

const placeholder = appImages.hall.source;

export const daniel2Images: Record<SceneImageKey, SceneImage> = {
  babylonHall: {
    source: placeholder,
    alt: 'Placeholder illustration of a columned royal hall, standing in for ancient Babylon',
    focus: 'center',
    isPlaceholder: true,
  },
  dreamChamber: {
    source: placeholder,
    alt: 'Placeholder illustration of a dim royal hall, standing in for the king’s chamber',
    focus: 'top',
    isPlaceholder: true,
  },
  mountain: {
    source: placeholder,
    alt: 'Placeholder illustration, standing in for the mountain of the stone',
    focus: 'bottom',
    isPlaceholder: true,
  },
};
