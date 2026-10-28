import React from 'react';

/** The few line icons of the quiz screens. Decorative: hidden from screen readers (every control that holds one also has a text label or an aria-label). Colour follows the text colour. */
const PATHS = {
  plus: ['M12 5v14', 'M5 12h14'],
  search: ['M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z', 'M15.5 15.5 20 20'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 12.5h10L18 7', 'M9 7V4h6v3'],
  copy: ['M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1Z', 'M16 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3'],
  up: ['M6 14.5l6-6 6 6'],
  down: ['M6 9.5l6 6 6-6'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  alert: ['M12 3.5 2.8 19.5h18.4L12 3.5Z', 'M12 10v4.5', 'M12 17.4h.01'],
  quiz: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M9.6 9.6a2.5 2.5 0 0 1 4.8.9c0 1.6-2.4 2-2.4 3.6', 'M12 17.1h.01'],
  phone: ['M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3Z', 'M10.5 18h3'],
  edit: ['M4 20h4L19 9l-4-4L4 16v4Z', 'M13.5 6.5l4 4'],
  list: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  chevron: ['M9 6l6 6-6 6'],
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 11v5', 'M12 7.8h.01'],
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

/** Six dots: the handle that starts a drag. */
export function GripIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`shrink-0 ${className}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false">
      <circle cx="7" cy="5" r="1.4" />
      <circle cx="13" cy="5" r="1.4" />
      <circle cx="7" cy="10" r="1.4" />
      <circle cx="13" cy="10" r="1.4" />
      <circle cx="7" cy="15" r="1.4" />
      <circle cx="13" cy="15" r="1.4" />
    </svg>
  );
}
