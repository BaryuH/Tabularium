/**
 * Minimal geometric glyphs rendered as inline SVG strings. These are honest
 * primitives (lines/circles), not a vendored icon set. One family, uniform
 * 1.5 stroke, 16x16 grid, `currentColor` so they inherit text color.
 */
function glyph(inner: string): string {
  return `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

export const iconPlus = glyph('<path d="M8 3.5v9M3.5 8h9" />');
export const iconX = glyph('<path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />');
export const iconTrash = glyph(
  '<path d="M3.5 4.5h9M6.5 4.5V3.2h3v1.3M5 4.5l.5 8h5l.5-8" />',
);
