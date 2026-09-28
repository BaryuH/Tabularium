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

/** Apply or remove custom wallpaper and dynamic accent color. */
export function applyWallpaper(wallpaper?: string, accent?: string): void {
  const root = document.documentElement;
  if (wallpaper === 'none') {
    document.body.classList.add('has-no-wallpaper');
    root.style.removeProperty('--wallpaper-url');
    root.style.removeProperty('--accent');
    root.style.removeProperty('--brand-gradient');
  } else if (wallpaper) {
    document.body.classList.remove('has-no-wallpaper');
    root.style.setProperty('--wallpaper-url', `url("${wallpaper}")`);
    if (accent) {
      root.style.setProperty('--accent', accent);
      root.style.setProperty('--brand-gradient', `linear-gradient(135deg, #ffffff 30%, ${accent} 100%)`);
    }
  } else {
    // Default: use tabularium.jpg as default background
    document.body.classList.remove('has-no-wallpaper');
    root.style.removeProperty('--wallpaper-url');
    if (accent) {
      root.style.setProperty('--accent', accent);
      root.style.setProperty('--brand-gradient', `linear-gradient(135deg, #ffffff 30%, ${accent} 100%)`);
    } else {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--brand-gradient');
    }
  }
}
