import { describe, expect, it } from 'vitest';
import { FULL_SIDE, SMALL_SIDE, encodeWithin, extensionOf, fitWithin } from '../src/utils/photoProcessing';

/**
 * Сжатие фото точки (запись 87): размеры и вес. Само сжатие на холсте
 * проверяет сценарий в браузере — со снимком «с телефона» с поворотом и
 * местом съёмки.
 */
describe('fitWithin', () => {
  it('снимок с телефона — в 1600 и 640 по длинной стороне, пропорции те же', () => {
    expect(fitWithin(4000, 3000, FULL_SIDE)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, SMALL_SIDE)).toEqual({ width: 480, height: 640 });
  });

  it('маленький снимок не увеличивается', () => {
    expect(fitWithin(800, 600, FULL_SIDE)).toEqual({ width: 800, height: 600 });
  });
});

describe('encodeWithin', () => {
  const blobOf = (size: number) => new Blob([new Uint8Array(size)]);

  it('берёт первое качество, которое уложилось в вес', async () => {
    const tried: number[] = [];
    const blob = await encodeWithin(async (quality) => {
      tried.push(quality);
      return blobOf(quality >= 0.7 ? 300 : 100);
    }, 200);

    expect(blob.size).toBe(100);
    expect(tried).toEqual([0.8, 0.7, 0.6]);
  });

  it('не уложилось ни одно — самое лёгкое, а не отказ', async () => {
    const blob = await encodeWithin(async (quality) => blobOf(Math.round(quality * 1000)), 100);
    expect(blob.size).toBe(500);
  });
});

describe('extensionOf', () => {
  it('WebP, а без него — JPEG', () => {
    expect(extensionOf('image/webp')).toBe('webp');
    expect(extensionOf('image/jpeg')).toBe('jpg');
  });
});
