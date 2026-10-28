import React from 'react';

/** The few line icons of the 3D editor, in one place. Decorative: hidden from screen readers (the button that holds one always carries its own name). Colour follows the text colour. */
const PATHS = {
  reset: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5'],
  target: ['M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z', 'M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4'],
  pin: ['M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z', 'M12 7.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Z'],
  plus: ['M12 5v14M5 12h14'],
  help: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M9.6 9.6a2.5 2.5 0 0 1 4.8.9c0 1.6-2.4 2-2.4 3.6', 'M12 17.1h.01'],
  up: ['M6 14.5l6-6 6 6'],
  down: ['M6 9.5l6 6 6-6'],
  trash: ['M4 7h16M10 11v6M14 11v6', 'M6 7l1 12.5h10L18 7M9 7V4h6v3'],
  close: ['M6 6l12 12M18 6L6 18'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  alert: ['M12 3.5 2.8 19.5h18.4L12 3.5Z', 'M12 10v4.5M12 17.4h.01'],
  chevronRight: ['M9 6l6 6-6 6'],
  cube: ['M12 2.5 20.5 7v10L12 21.5 3.5 17V7L12 2.5Z', 'M3.5 7 12 11.5 20.5 7', 'M12 11.5v10'],
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
