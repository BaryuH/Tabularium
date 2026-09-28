import type { WallpaperQualityMode } from '../types';

/**
 * Ultra-lightweight local wallpaper processing & dynamic color extraction.
 *
 * Supports two quality modes:
 * 1. 'lightweight': Downsamples to max 1600x900 at 0.80 JPEG quality (~80-150KB),
 *    preventing storage and memory bloat on New Tab cold starts.
 * 2. 'original': Trade-off mode preserving high fidelity up to 4K (3840x2160)
 *    with uncompromised sharpness for high-DPI displays.
 */

export interface ProcessedWallpaper {
  dataUrl: string;
  accentColor: string;
  sizeKb: number;
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface HslColor {
  h: number; // 0 - 360
  s: number; // 0 - 1
  l: number; // 0 - 1
}

export function rgbToHsl(r: number, g: number, b: number): HslColor {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const diff = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (diff !== 0) {
    s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / diff + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / diff + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / diff + 4;
        break;
    }
    h /= 6;
  }

  return { h: Math.round(h * 360), s, l };
}

export function hslToRgb(h: number, s: number, l: number): RgbColor {
  const hNorm = (h % 360) / 360;
  if (s === 0) {
    const val = Math.round(l * 255);
    return { r: val, g: val, b: val };
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    let tNorm = t;
    if (tNorm < 0) tNorm += 1;
    if (tNorm > 1) tNorm -= 1;
    if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
    if (tNorm < 1 / 2) return q;
    if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hNorm) * 255),
    b: Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Pure function: extracts dominant vibrant accent color from an RGBA pixel array.
 * Target lightness is calibrated to ~68% for dark themes and ~45% for light themes.
 */
export function extractDominantColorFromRgba(
  data: Uint8ClampedArray,
  fallback = '#928ee8',
): string {
  const buckets: { count: number; totalH: number; totalS: number }[] = Array.from(
    { length: 12 },
    () => ({ count: 0, totalH: 0, totalS: 0 }),
  );

  let vibrantCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 128) continue; // Skip transparent

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const hsl = rgbToHsl(r, g, b);

    // Skip colors that are too dark, washed out, or pure white
    if (hsl.l < 0.15 || hsl.l > 0.88 || hsl.s < 0.18) {
      continue;
    }

    const bucketIndex = Math.min(11, Math.floor(hsl.h / 30));
    buckets[bucketIndex].count++;
    buckets[bucketIndex].totalH += hsl.h;
    buckets[bucketIndex].totalS += hsl.s;
    vibrantCount++;
  }

  if (vibrantCount === 0) {
    return fallback;
  }

  // Find bucket with highest pixel count
  let bestBucket = buckets[0];
  for (let i = 1; i < buckets.length; i++) {
    if (buckets[i].count > bestBucket.count) {
      bestBucket = buckets[i];
    }
  }

  const avgH = Math.round(bestBucket.totalH / bestBucket.count);
  const avgS = Math.min(0.85, Math.max(0.55, bestBucket.totalS / bestBucket.count));
  // Calibrate lightness for crisp UI contrast
  const targetL = 0.68;

  const rgb = hslToRgb(avgH, avgS, targetL);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

/**
 * Processes an uploaded image file according to the selected quality mode
 * and extracts its dominant accent color.
 */
export async function processWallpaperFile(
  file: File,
  qualityMode: WallpaperQualityMode = 'lightweight',
): Promise<ProcessedWallpaper> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = (e) => reject(new Error('Failed to load image file: ' + String(e)));
      image.src = objectUrl;
    });

    const is4KOriginal = qualityMode === 'original';
    const maxW = is4KOriginal ? 3840 : 1600;
    const maxH = is4KOriginal ? 2160 : 900;
    let targetW = img.naturalWidth || img.width;
    let targetH = img.naturalHeight || img.height;

    if (targetW > maxW || targetH > maxH) {
      const ratio = Math.min(maxW / targetW, maxH / targetH);
      targetW = Math.round(targetW * ratio);
      targetH = Math.round(targetH * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D canvas context');

    ctx.drawImage(img, 0, 0, targetW, targetH);

    let mimeType = 'image/jpeg';
    let quality = 0.80;
    if (is4KOriginal) {
      mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      quality = 0.95;
    }
    const dataUrl = canvas.toDataURL(mimeType, quality);
    const sizeKb = Math.round((dataUrl.length * 3) / 4 / 1024);
    // Canvas for fast 32x32 color sampling
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 32;
    sampleCanvas.height = 32;
    const sampleCtx = sampleCanvas.getContext('2d');

    let accentColor = '#928ee8';
    if (sampleCtx) {
      sampleCtx.drawImage(img, 0, 0, 32, 32);
      const pixelData = sampleCtx.getImageData(0, 0, 32, 32).data;
      accentColor = extractDominantColorFromRgba(pixelData, '#928ee8');
    }

    return { dataUrl, accentColor, sizeKb };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
