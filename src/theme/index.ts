/**
 * Theme application. Sets `data-theme` on `<html>` to drive CSS vars.
 * Only light and dark modes supported (no system mode).
 */
export function applyTheme(): void {
  document.documentElement.setAttribute('data-theme', 'dark');
}

/** Resolve the effective mode (locked to 'dark'). */
export function resolveEffective(): 'dark' {
  return 'dark';
}

/** Reveal the body after the theme is applied (anti-FOUC). */
export function revealBody(): void {
  document.body.style.opacity = '1';
}

/** Apply or remove custom wallpaper. */
export function applyWallpaper(wallpaper?: string): void {
  const root = document.documentElement;
  if (wallpaper === 'none') {
    document.body.classList.add('has-no-wallpaper');
    root.style.removeProperty('--wallpaper-url');
  } else if (wallpaper) {
    document.body.classList.remove('has-no-wallpaper');
    root.style.setProperty('--wallpaper-url', `url("${wallpaper}")`);
  } else {
    // Default: use tabularium.jpg as default background
    document.body.classList.remove('has-no-wallpaper');
    root.style.removeProperty('--wallpaper-url');
  }
}
