import { useEffect, useState } from 'react';
import { DEFAULT_STRENGTH, REFERENCE_TINT } from './lineArt';
import type { LineArtKind, Tint } from './lineArt';

/**
 * Картинка линий плана (запись 62): план → холст → фоновый поток → PNG с
 * прозрачным фоном. Картинка плана бывает любой: PNG, JPEG, SVG — её рисует
 * сам браузер, поток получает готовые пиксели.
 *
 * Большой план уменьшается до `MAX_SIDE`: линии для наложения, а не для
 * печати, и так расчёт укладывается в доли секунды.
 */

/** Наибольшая сторона картинки линий, пиксели. */
const MAX_SIDE = 2048;

/** Мелкий план считается крупнее: линии и контур на экране выходят ровнее. */
const MIN_SIDE = 1400;

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, (buffer: ArrayBuffer) => void>();

function lineWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./lineArt.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: number; buffer: ArrayBuffer }>) => {
      waiting.get(event.data.id)?.(event.data.buffer);
      waiting.delete(event.data.id);
    };
  }
  return worker;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`План не прочитался: ${url}`));
    img.src = url;
  });
}

const cache = new Map<string, Promise<string>>();

/**
 * Адрес картинки линий для плана; одна и та же картинка считается один раз.
 *
 * @param fallback размер плана, если у картинки своего нет (SVG без размеров)
 */
export function lineArtUrl(
  url: string,
  kind: LineArtKind,
  strength = DEFAULT_STRENGTH,
  fallback?: { width: number; height: number },
  tint: Tint = REFERENCE_TINT
): Promise<string> {
  const key = `${kind}|${strength}|${tint.join(',')}|${url}`;
  let result = cache.get(key);
  if (!result) {
    result = render(url, kind, strength, fallback, tint);
    cache.set(key, result);
    result.catch(() => cache.delete(key));
  }
  return result;
}

async function render(url: string, kind: LineArtKind, strength: number, fallback: { width: number; height: number } | undefined, tint: Tint): Promise<string> {
  const img = await loadImage(url);
  const naturalWidth = img.naturalWidth || fallback?.width || 1000;
  const naturalHeight = img.naturalHeight || fallback?.height || 700;
  const longest = Math.max(naturalWidth, naturalHeight);
  const scale = Math.min(MAX_SIDE / longest, Math.max(1, MIN_SIDE / longest));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Холст недоступен');
  ctx.drawImage(img, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height);

  const id = nextId++;
  const buffer = await new Promise<ArrayBuffer>((resolve) => {
    waiting.set(id, resolve);
    const source = pixels.data.buffer as ArrayBuffer;
    lineWorker().postMessage({ id, kind, width, height, buffer: source, tint, strength }, [source]);
  });

  ctx.putImageData(new ImageData(new Uint8ClampedArray(buffer), width, height), 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Картинка линий не собралась'))), 'image/png')
  );
  return URL.createObjectURL(blob);
}

/** Адрес картинки линий для плана или `null`, пока она считается (или плана нет). */
export function useLineArt(
  url: string | null,
  kind: LineArtKind | null,
  strength = DEFAULT_STRENGTH,
  fallback?: { width: number; height: number }
): string | null {
  const [result, setResult] = useState<{ key: string; url: string } | null>(null);
  const key = url && kind ? `${kind}|${strength}|${url}` : null;
  const width = fallback?.width;
  const height = fallback?.height;

  useEffect(() => {
    if (!url || !kind || !key) return;
    let cancelled = false;
    lineArtUrl(url, kind, strength, width !== undefined && height !== undefined ? { width, height } : undefined)
      .then((lines) => {
        if (!cancelled) setResult({ key, url: lines });
      })
      .catch(() => {
        // Не прочитался план — наложение остаётся без линий, шторка работает.
      });
    return () => {
      cancelled = true;
    };
  }, [url, kind, strength, key, width, height]);

  return result && result.key === key ? result.url : null;
}
