'use client';

import React, { useRef } from 'react';

/**
 * The small segmented radio control of the preview windows (the learning level, the reading theme): one choice at a time, the arrow keys, Home and End move between the options, and only the chosen
 * one is in the Tab order.
 */
export function Choice<T extends string>({ label, value, options, names, onChange }: { label: string; value: T; options: readonly T[]; names: Record<T, string>; onChange: (value: T) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeys = (event: React.KeyboardEvent, index: number) => {
    const count = options.length;
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % count : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index + count - 1) % count : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(options[next]);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-lg border border-slate-300 bg-slate-100 p-0.5">
      {options.map((option, index) => (
        <button
          key={option}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="button"
          role="radio"
          aria-checked={value === option}
          tabIndex={value === option ? 0 : -1}
          onClick={() => onChange(option)}
          onKeyDown={(event) => onKeys(event, index)}
          className={`min-h-9 rounded-md px-3.5 py-1.5 text-sm font-medium focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${value === option ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-700 hover:text-slate-900'}`}
        >
          {names[option]}
        </button>
      ))}
    </div>
  );
}
