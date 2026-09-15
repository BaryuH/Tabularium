/**
 * Resolve whether a card click should activate an existing tab or open a new
 * one. Pure function; no chrome dependency.
 */
import type { TabInfo } from './adapter';

export interface ActivateResult { action: 'activate'; tabId: number }
export interface OpenResult { action: 'open'; url: string }
export type ResolveResult = ActivateResult | OpenResult;

/** Strip hash and trailing slash so near-identical URLs match. */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname.replace(/\/$/, '') + u.search;
  } catch {
    return url;
  }
}

/**
 * Find an open tab matching `url`; return `activate` if found, `open` if not.
 * Match ignores trailing slashes and URL hash fragments.
 */
export function resolveTarget(url: string, openTabs: readonly TabInfo[]): ResolveResult {
  const target = normalizeUrl(url);
  for (const tab of openTabs) {
    if (normalizeUrl(tab.url) === target) return { action: 'activate', tabId: tab.id };
  }
  return { action: 'open', url };
}
