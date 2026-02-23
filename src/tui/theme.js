import { parseHex } from '../config/config.js';

/**
 * Convert a hex color string to terminal-kit color object.
 * terminal-kit supports 24-bit colors via ^#rrggbb markup or .colorRgb(r,g,b).
 * We return { r, g, b } for use with term.colorRgb().
 */
export function hexToRgb(hex) {
  const parsed = parseHex(hex);
  return parsed || { r: 255, g: 255, b: 255 };
}

/**
 * Get the terminal-kit color escape for a hex color (foreground).
 * terminal-kit uses ^#rrggbb for inline colors.
 */
export function hexFg(hex) {
  return `^#${hex.replace('#', '')}`;
}

/**
 * Get the terminal-kit background color escape for a hex color.
 * terminal-kit uses ^:#rrggbb for inline bg colors.
 */
export function hexBg(hex) {
  return `^:#${hex.replace('#', '')}`;
}
