/**
 * Theme application. Sets `data-theme` on `<html>` to drive CSS vars.
 * Only light and dark modes supported (no system mode).
 */
import type { ThemePref } from '../types';

export function applyTheme(pref: ThemePref): void {
  const theme = pref === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
}

/** Resolve the effective mode ('light' | 'dark'). */
export function resolveEffective(pref: ThemePref): 'light' | 'dark' {
  return pref === 'light' ? 'light' : 'dark';
}

/** Reveal the body after the theme is applied (anti-FOUC). */
export function revealBody(): void {
  document.body.style.opacity = '1';
}
