/**
 * Theme application. Sets `data-theme` on `<html>` to drive CSS vars.
 *
 * - absent / "system" → OS preference via `@media (prefers-color-scheme)`.
 * - "light" / "dark"  → explicit override.
 */
import type { ThemePref } from '../types';

export function applyTheme(pref: ThemePref): void {
  if (pref === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', pref);
  }
}

/** Resolve the effective mode for a given preference and OS dark flag. */
export function resolveEffective(
  pref: ThemePref,
  systemIsDark: boolean,
): 'light' | 'dark' {
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return systemIsDark ? 'dark' : 'light';
}

/** Reveal the body after the theme is applied (anti-FOUC). */
export function revealBody(): void {
  document.body.style.opacity = '1';
}
