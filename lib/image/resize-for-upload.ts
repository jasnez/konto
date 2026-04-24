/**
 * Client-side image downscale + JPEG re-encode before upload.
 *
 * Why: phone cameras produce 4–12 MB / ~4000 px images; Gemini Vision reads
 * receipts well at 1600 px long side. Shrinking before upload cuts network
 * time, Supabase storage cost, and Gemini latency by ~10–20x.
 *
 * Behavior:
 * - Fast path: files < `minBytesToResize` (1.2 MB) skip decode entirely.
 * - Decodes with `createImageBitmap` honoring EXIF orientation (iOS photos).
 * - On decode failure (e.g. HEIC in Chrome/Firefox), returns the original
 *   file untouched so the server still gets something usable.
 * - Re-encoded output is always JPEG with a white background (strips alpha).
 *
 * This module only runs in the browser (uses `document`/`createImageBitmap`).
 */

export interface ResizeOptions {
  maxLongSide?: number;
  quality?: number;
  minBytesToResize?: number;
}

export interface ResizeResult {
  file: File;
  originalBytes: number;
  finalBytes: number;
  resized: boolean;
}

const DEFAULT_MAX_LONG_SIDE = 1600;
const DEFAULT_QUALITY = 0.85;
const DEFAULT_MIN_BYTES = 1_200_000;

export async function resizeForUpload(
  input: File,
  options: ResizeOptions = {},
): Promise<ResizeResult> {
  const maxLongSide = options.maxLongSide ?? DEFAULT_MAX_LONG_SIDE;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const minBytesToResize = options.minBytesToResize ?? DEFAULT_MIN_BYTES;
  const originalBytes = input.size;

  if (originalBytes < minBytesToResize) {
    return passthrough(input, originalBytes);
  }

  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return passthrough(input, originalBytes);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' });
  } catch {
    return passthrough(input, originalBytes);
  }

  try {
    const { width: srcW, height: srcH } = bitmap;
    if (srcW <= 0 || srcH <= 0) {
      return passthrough(input, originalBytes);
    }

    const longest = Math.max(srcW, srcH);
    const scale = longest > maxLongSide ? maxLongSide / longest : 1;
    const dstW = Math.max(1, Math.round(srcW * scale));
    const dstH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = dstW;
    canvas.height = dstH;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return passthrough(input, originalBytes);
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, dstW, dstH);
    ctx.drawImage(bitmap, 0, 0, dstW, dstH);

    const blob = await canvasToJpegBlob(canvas, quality);
    if (!blob) {
      return passthrough(input, originalBytes);
    }

    if (scale === 1 && blob.size >= originalBytes) {
      return passthrough(input, originalBytes);
    }

    const baseName = input.name.replace(/\.[^./]+$/u, '') || 'receipt';
    const file = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });

    return {
      file,
      originalBytes,
      finalBytes: file.size,
      resized: true,
    };
  } finally {
    if (typeof bitmap.close === 'function') {
      bitmap.close();
    }
  }
}

function passthrough(input: File, originalBytes: number): ResizeResult {
  return {
    file: input,
    originalBytes,
    finalBytes: originalBytes,
    resized: false,
  };
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}
