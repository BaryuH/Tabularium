import type { Card } from './types';

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

/** Trigger a browser file download from a string payload. */
export function triggerDownload(
  content: string,
  filename: string,
  mimeType = 'text/plain;charset=utf-8;',
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Format a single card (note or task) as clean Markdown with metadata header. */
export function formatCardAsMarkdown(card: Card): { filename: string; content: string } {
  const cleanTitle = (card.title || '(untitled)').replace(HAS_DATE_PREFIX, '').trim();
  const dateStr = new Date(card.savedAt || Date.now()).toISOString().split('T')[0];
  const isTask = card.kind === 'task';
  const isDone = Boolean(card.completedAt);

  let md = `# ${card.title || 'Untitled'}\n\n`;
  md += `> **Type:** ${isTask ? 'Task' : 'Note'}  \n`;
  md += `> **Date:** ${dateStr}  \n`;
  if (isTask) {
    md += `> **Status:** ${isDone ? 'Completed' : 'In Progress'}  \n`;
  }
  if (card.url) {
    md += `> **Source:** [${card.url}](${card.url})  \n`;
  }
  md += `\n---\n\n`;
  md += (card.note || '').trim() || '_No content_';
  md += '\n';

  const slug = cleanTitle
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50) || 'note';
  const filename = `${dateStr}-${slug}.md`;

  return { filename, content: md };
}
