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
export const iconTask = glyph('<circle cx="8" cy="8" r="5" />');
export const iconTaskDone = glyph('<circle cx="8" cy="8" r="5" fill="currentColor" fill-opacity="0.25" /><path d="M5.5 8l2 2 3.5-3.5" />');
export const iconNote = glyph('<path d="M4 3.5h8M4 6.5h8M4 9.5h6M4 12.5h4" />');
export const iconGear = glyph(
  '<circle cx="8" cy="8" r="2.5" /><path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.75 3.75l1.06 1.06M11.19 11.19l1.06 1.06M3.75 12.25l1.06-1.06M11.19 4.81l1.06-1.06" />',
);
export const iconDownload = glyph('<path d="M8 3v8M4.5 7.5L8 11l3.5-3.5M3 13h10" />');
export const iconUpload = glyph('<path d="M8 11V3M4.5 6.5L8 3l3.5 3.5M3 13h10" />');
export const iconPencil = glyph('<path d="M11.5 2.5l2 2L4.5 13.5H2.5v-2L11.5 2.5z" />');
export const iconSidebar = glyph('<rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M6 3v10" />');
export const iconChevronLeft = glyph('<path d="M10 4L6 8l4 4" />');
export const iconSun = glyph(
  '<circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8h1.5M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />',
);
export const iconMoon = glyph(
  '<path d="M13.2 9.4A5.5 5.5 0 016.6 2.8 5.5 5.5 0 1013.2 9.4z" />',
);
