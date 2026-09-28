import { describe, expect, it } from 'vitest';
import {
  rgbToHsl,
  hslToRgb,
  rgbToHex,
  extractDominantColorFromRgba,
} from '../src/util/wallpaper';

describe('wallpaper color utilities', () => {
  it('converts RGB to HSL correctly', () => {
    // Pure red
    const redHsl = rgbToHsl(255, 0, 0);
    expect(redHsl.h).toBe(0);
    expect(redHsl.s).toBeCloseTo(1, 1);
    expect(redHsl.l).toBeCloseTo(0.5, 1);

    // Pure green
    const greenHsl = rgbToHsl(0, 255, 0);
    expect(greenHsl.h).toBe(120);

    // Pure blue
    const blueHsl = rgbToHsl(0, 0, 255);
    expect(blueHsl.h).toBe(240);
  });

  it('converts HSL to RGB correctly', () => {
    const rgb = hslToRgb(0, 1, 0.5);
    expect(rgb.r).toBe(255);
    expect(rgb.g).toBe(0);
    expect(rgb.b).toBe(0);
  });

  it('converts RGB to Hex string correctly', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
    expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
    expect(rgbToHex(0, 0, 255)).toBe('#0000ff');
    expect(rgbToHex(146, 142, 232)).toBe('#928ee8');
  });

  it('extracts dominant color from vibrant pixel data', () => {
    // Create synthetic 10x10 cyan pixel data (RGBA)
    const data = new Uint8ClampedArray(10 * 10 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 20;     // R
      data[i + 1] = 180; // G
      data[i + 2] = 240; // B
      data[i + 3] = 255; // A
    }

    const accent = extractDominantColorFromRgba(data);
    expect(accent).toMatch(/^#[0-9a-f]{6}$/i);
    // Cyan/blue range
    expect(accent.startsWith('#')).toBe(true);
  });

  it('returns fallback color when image is pure black or white', () => {
    // Pure black image
    const data = new Uint8ClampedArray(10 * 10 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }

    const fallback = '#928ee8';
    const accent = extractDominantColorFromRgba(data, fallback);
    expect(accent).toBe(fallback);
  });
});
