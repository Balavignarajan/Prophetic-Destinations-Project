import React from 'react';

/** The few line icons of the Media Library page. Decorative: hidden from screen readers (every control that holds one also has a text label). Colour follows the text colour. */
const PATHS = {
  upload: ['M12 16V4', 'M7.5 8.5 12 4l4.5 4.5', 'M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16'],
  search: ['M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z', 'M15.5 15.5 20 20'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  grid: ['M4 4h6.5v6.5H4z', 'M13.5 4H20v6.5h-6.5z', 'M4 13.5h6.5V20H4z', 'M13.5 13.5H20V20h-6.5z'],
  list: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  image: ['M4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11A1.5 1.5 0 0 1 4.5 5Z', 'M3.5 16.5 9 11l4 4 2.5-2.5 5 5', 'M16 9.5h.01'],
  video: ['M4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11A1.5 1.5 0 0 1 4.5 5Z', 'M10 9.2v5.6l4.8-2.8z'],
  animation: ['M12 3.5v3', 'M12 17.5v3', 'M3.5 12h3', 'M17.5 12h3', 'M6 6l2 2', 'M16 16l2 2', 'M18 6l-2 2', 'M8 16l-2 2', 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z'],
  cube: ['M12 2.5 20.5 7v10L12 21.5 3.5 17V7L12 2.5Z', 'M3.5 7 12 11.5 20.5 7', 'M12 11.5v10'],
  file: ['M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z', 'M14 3v4h4'],
  copy: ['M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1Z', 'M16 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3'],
  download: ['M12 4v11', 'M7.5 11 12 15.5l4.5-4.5', 'M4 17v1.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V17'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  alert: ['M12 3.5 2.8 19.5h18.4L12 3.5Z', 'M12 10v4.5', 'M12 17.4h.01'],
  retry: ['M4 12a8 8 0 1 0 2.6-5.9', 'M4 4v4.5h4.5'],
  chevron: ['M9 6l6 6-6 6'],
  help: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M9.6 9.6a2.5 2.5 0 0 1 4.8.9c0 1.6-2.4 2-2.4 3.6', 'M12 17.1h.01'],
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" className={`shrink-0 ${className}`}>
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** The icon that stands for a kind of file when there is no picture of it. */
export const iconForType = (contentType: string): IconName =>
  contentType.startsWith('image/') ? 'image' : contentType === 'video/mp4' ? 'video' : contentType === 'application/json' ? 'animation' : contentType === 'model/gltf-binary' ? 'cube' : 'file';
