import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resizeForUpload } from './resize-for-upload';

interface MockBitmap {
  width: number;
  height: number;
  close: () => void;
}

const ORIGINAL_CREATE_BITMAP = globalThis.createImageBitmap as unknown as
  | typeof createImageBitmap
  | undefined;

function makeFile(size: number, mime = 'image/jpeg', name = 'receipt.jpg'): File {
  // Real Uint8Array so File.size is accurate; contents are irrelevant.
  const bytes = new Uint8Array(size);
  return new File([bytes], name, { type: mime });
}

function stubImageBitmap(width: number, height: number): MockBitmap {
  return {
    width,
    height,
    close: vi.fn(),
  };
}

function setCreateImageBitmap(fn: unknown): void {
  (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = fn;
}

afterEach(() => {
  if (typeof ORIGINAL_CREATE_BITMAP === 'function') {
    setCreateImageBitmap(ORIGINAL_CREATE_BITMAP);
  } else {
    Reflect.deleteProperty(globalThis, 'createImageBitmap');
  }
  vi.restoreAllMocks();
});

describe('resizeForUpload — fast path', () => {
  it('returns original file untouched when smaller than minBytesToResize', async () => {
    const file = makeFile(500_000, 'image/jpeg');
    const decoder = vi.fn();
    setCreateImageBitmap(decoder);

    const result = await resizeForUpload(file);

    expect(result.resized).toBe(false);
    expect(result.file).toBe(file);
    expect(result.originalBytes).toBe(500_000);
    expect(result.finalBytes).toBe(500_000);
    expect(decoder).not.toHaveBeenCalled();
  });
});

describe('resizeForUpload — HEIC / undecodable fallback', () => {
  it('returns original file when createImageBitmap throws', async () => {
    const file = makeFile(3_000_000, 'image/heic', 'photo.heic');
    const decoder = vi.fn().mockRejectedValue(new Error('unsupported'));
    setCreateImageBitmap(decoder);

    const result = await resizeForUpload(file);

    expect(result.resized).toBe(false);
    expect(result.file).toBe(file);
    expect(result.originalBytes).toBe(3_000_000);
    expect(decoder).toHaveBeenCalledOnce();
  });

  it('returns original file when createImageBitmap is not available', async () => {
    const file = makeFile(3_000_000, 'image/jpeg');
    Reflect.deleteProperty(globalThis, 'createImageBitmap');

    const result = await resizeForUpload(file);

    expect(result.resized).toBe(false);
    expect(result.file).toBe(file);
  });
});

describe('resizeForUpload — happy path', () => {
  let toBlobSpy: ReturnType<typeof vi.fn>;
  let drawImageSpy: ReturnType<typeof vi.fn>;
  let fillRectSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    toBlobSpy = vi.fn();
    drawImageSpy = vi.fn();
    fillRectSpy = vi.fn();

    // Patch HTMLCanvasElement methods on jsdom.
    const getContext = vi.fn().mockImplementation(() => ({
      fillRect: fillRectSpy,
      drawImage: drawImageSpy,
      fillStyle: '',
    }));
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = getContext;
    (HTMLCanvasElement.prototype as unknown as { toBlob: unknown }).toBlob = toBlobSpy;
  });

  it('downscales a large image to JPEG ≤ maxLongSide', async () => {
    const originalFile = makeFile(8_000_000, 'image/jpeg', 'big.jpg');
    setCreateImageBitmap(vi.fn().mockResolvedValue(stubImageBitmap(4000, 3000)));

    // Simulate toBlob returning a much smaller blob.
    toBlobSpy.mockImplementation((cb: (blob: Blob | null) => void) => {
      cb(new Blob([new Uint8Array(400_000)], { type: 'image/jpeg' }));
    });

    const result = await resizeForUpload(originalFile, { maxLongSide: 1600, quality: 0.85 });

    expect(result.resized).toBe(true);
    expect(result.originalBytes).toBe(8_000_000);
    expect(result.finalBytes).toBe(400_000);
    expect(result.file.type).toBe('image/jpeg');
    expect(result.file.name).toBe('big.jpg');
    expect(toBlobSpy).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.85);
    expect(drawImageSpy).toHaveBeenCalledOnce();
  });

  it('returns original if toBlob yields a blob ≥ original and no resize happened', async () => {
    const originalFile = makeFile(3_000_000, 'image/jpeg');
    setCreateImageBitmap(vi.fn().mockResolvedValue(stubImageBitmap(800, 600)));

    // Force toBlob to return a larger blob → passthrough kicks in.
    toBlobSpy.mockImplementation((cb: (blob: Blob | null) => void) => {
      cb(new Blob([new Uint8Array(4_000_000)], { type: 'image/jpeg' }));
    });

    const result = await resizeForUpload(originalFile);

    expect(result.resized).toBe(false);
    expect(result.file).toBe(originalFile);
  });

  it('returns original if toBlob returns null', async () => {
    const originalFile = makeFile(3_000_000, 'image/jpeg');
    setCreateImageBitmap(vi.fn().mockResolvedValue(stubImageBitmap(3000, 2000)));

    toBlobSpy.mockImplementation((cb: (blob: Blob | null) => void) => {
      cb(null);
    });

    const result = await resizeForUpload(originalFile);

    expect(result.resized).toBe(false);
    expect(result.file).toBe(originalFile);
  });
});
