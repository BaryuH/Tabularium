/**
 * Ultra-lightweight local wallpaper processing.
 *
 * Downsamples large image files to max 1600x900 at 0.80 JPEG quality (~80-150KB),
 * preventing storage and memory bloat on New Tab cold starts.
 */

export interface ProcessedWallpaper {
  dataUrl: string;
  sizeKb: number;
}

export async function processWallpaperFile(file: File): Promise<ProcessedWallpaper> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = (e) => reject(new Error('Failed to load image file: ' + String(e)));
      image.src = objectUrl;
    });

    const maxW = 1600;
    const maxH = 900;
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

    const dataUrl = canvas.toDataURL('image/jpeg', 0.80);
    const sizeKb = Math.round((dataUrl.length * 3) / 4 / 1024);

    return { dataUrl, sizeKb };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
