/// <reference types="node" />
/**
 * `npm run check:theme`
 *  1. Token parity: the dark and light themes define exactly the same token names.
 *  2. Contrast, for BOTH themes: the text/background pairings the UI relies on must meet WCAG AA (4.5:1 for text, 3:1 for
 *     large or bold text and key UI shapes).
 *  3. Stray colours: no colour literal (hex, rgb(a), hsl(a), or a named colour in a colour style) may appear in `src/`
 *     outside `src/theme/colors.ts`.
 * Exits non-zero on any problem, so it can guard a theme change.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { type ColorTokens, type ThemeName, colorSchemes, palette } from '../src/theme/colors';

// ---------- 1. contrast ----------
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
/** `#rrggbb` or `rgba(r, g, b, a)` composited over `backdrop` (opaque hex). */
function toRgb(color: string, backdrop?: string): [number, number, number] {
  if (color.startsWith('#')) {
    return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [number, number, number];
  }
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(color);
  if (!m) throw new Error(`Unsupported colour: ${color}`);
  const [r, g, b, a] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
  const base = backdrop ? toRgb(backdrop) : [0, 0, 0];
  return [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
}
function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function ratio(foreground: string, background: string): number {
  const [hi, lo] = [luminance(toRgb(foreground, background)), luminance(toRgb(background))].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

type Token = keyof ColorTokens;
type Pair = { foreground: Token; background: Token; min: number; note: string };

/** Pairings that must hold in every theme. */
const sharedPairs: Pair[] = [
  { foreground: 'textPrimary', background: 'background', min: 4.5, note: 'body text on the page' },
  { foreground: 'textPrimary', background: 'surface', min: 4.5, note: 'text on a card' },
  { foreground: 'textPrimary', background: 'surfaceElevated', min: 4.5, note: 'text on an elevated card' },
  { foreground: 'textSecondary', background: 'background', min: 4.5, note: 'secondary text on the page' },
  { foreground: 'textSecondary', background: 'surface', min: 4.5, note: 'secondary text on a card' },
  { foreground: 'textSecondary', background: 'surfaceElevated', min: 4.5, note: 'secondary text on an elevated card' },
  { foreground: 'textMuted', background: 'background', min: 4.5, note: 'captions on the page' },
  { foreground: 'textMuted', background: 'surface', min: 4.5, note: 'captions on a card' },
  { foreground: 'textMuted', background: 'surfaceElevated', min: 4.5, note: 'captions on an elevated card' },
  { foreground: 'primaryHighlight', background: 'background', min: 4.5, note: 'gold text on the page' },
  { foreground: 'primaryHighlight', background: 'surface', min: 4.5, note: 'gold text on a card' },
  { foreground: 'primaryHighlight', background: 'surfaceElevated', min: 4.5, note: 'gold text on an elevated card / pressed secondary button' },
  { foreground: 'onPrimary', background: 'primary', min: 4.5, note: 'primary button label' },
  { foreground: 'onPrimary', background: 'primaryPressed', min: 4.5, note: 'primary button label, pressed' },
  { foreground: 'success', background: 'surface', min: 4.5, note: 'success text' },
  { foreground: 'warning', background: 'surface', min: 4.5, note: 'warning text' },
  { foreground: 'error', background: 'surface', min: 4.5, note: 'error text' },
  { foreground: 'error', background: 'background', min: 4.5, note: 'error text on the page' },
  { foreground: 'borderFocused', background: 'background', min: 3, note: 'focus ring (non-text)' },
  { foreground: 'primary', background: 'background', min: 3, note: 'gold fill / icon on the page (non-text)' },
  { foreground: 'primaryHighlight', background: 'border', min: 3, note: 'progress fill on its track (non-text)' },
  { foreground: 'textOnImage', background: 'scrim', min: 4.5, note: 'text over a photograph (photo assumed black under the scrim)' },
];

let failures = 0;

// ---------- 1. token parity ----------
console.log('Token parity:');
const darkKeys = Object.keys(colorSchemes.dark).sort();
const lightKeys = Object.keys(colorSchemes.light).sort();
const missing = [...darkKeys.filter((k) => !lightKeys.includes(k)), ...lightKeys.filter((k) => !darkKeys.includes(k))];
if (missing.length) {
  failures += missing.length;
  console.log(`  FAIL tokens not in both themes: ${missing.join(', ')}`);
} else {
  console.log(`  ok   ${darkKeys.length} tokens, identical names in dark and light`);
}

// ---------- 2. contrast ----------
for (const name of Object.keys(colorSchemes) as ThemeName[]) {
  const colors = colorSchemes[name];
  console.log(`
Contrast (WCAG), ${name} theme:`);
  for (const pair of sharedPairs) {
    // `scrim` and `textOnImage` sit over a photograph, so they are measured against the photograph's darkest value (black).
    const fg = colors[pair.foreground];
    const bg = pair.background === 'scrim' ? palette.black : colors[pair.background];
    const value = ratio(fg, bg);
    const ok = value >= pair.min;
    if (!ok) failures += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${value.toFixed(2).padStart(5)}:1 (needs ${pair.min})  ${String(pair.foreground)} on ${String(pair.background)}  - ${pair.note}`);
  }
}

// ---------- 3. stray colour literals ----------
const sourceRoot = join(__dirname, '..', 'src');
const themeFile = join(sourceRoot, 'theme', 'colors.ts');
const NAMED = 'white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|gold|silver|brown|cyan|magenta|transparent';
const patterns: [RegExp, string][] = [
  [/#[0-9a-fA-F]{3,8}\b/, 'hex colour'],
  [/\brgba?\s*\(/, 'rgb()/rgba() colour'],
  [/\bhsla?\s*\(/, 'hsl()/hsla() colour'],
  [new RegExp(`(?:color|Color|tint|fill|stroke)\\s*[:=]\\s*\\{?\\s*['"](?:${NAMED})['"]`), 'named colour'],
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(ts|tsx|css)$/.test(name) ? [full] : [];
  });
}

console.log('\nStray colour literals outside src/theme/colors.ts:');
let stray = 0;
for (const file of files(sourceRoot)) {
  if (file === themeFile) continue;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      for (const [pattern, kind] of patterns) {
        if (pattern.test(line)) {
          stray += 1;
          console.log(`  ${relative(join(sourceRoot, '..'), file)}:${index + 1}  ${kind}: ${line.trim()}`);
        }
      }
    });
}
if (stray === 0) console.log('  none');
failures += stray;

console.log(failures === 0 ? '\nTheme check passed.' : `\nTheme check FAILED (${failures} problem(s)).`);
process.exit(failures === 0 ? 0 : 1);
