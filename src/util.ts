/** Shared, framework-free helpers. */

/** Index a list of entities by their string `id`. */
export function indexById<T extends { id: string }>(items: readonly T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of items) out[item.id] = item;
  return out;
}

/** Escape a string for safe insertion into HTML text/attribute contexts. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Extract hostname from a URL, stripping `www.` prefix. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Regex matching a bracketed date prefix like [16/09], [16/09/2026], or [2026-09-16]. */
export const HAS_DATE_PREFIX = /^\[\d{1,4}[/-]\d{1,2}([/-]\d{1,4})?\]\s*/;

/** Format a timestamp into a compact `[DD/MM]` date tag. */
export function formatDateTag(timestamp = Date.now()): string {
  const d = new Date(timestamp);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `[${day}/${month}]`;
}
