import { useEffect, useState } from 'react';
import { DEFAULT_STRENGTH, REFERENCE_TINT } from './lineArt';
import type { LineArtKind, Tint } from './lineArt';
import type { PlanSilhouette } from './silhouetteMatch';

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

/** План на холсте: наибольшая сторона — не больше `maxSide`, мелкий план — не меньше `minSide`. */
async function planPixels(url: string, fallback: { width: number; height: number } | undefined, maxSide: number, minSide: number) {
  const img = await loadImage(url);
  const naturalWidth = img.naturalWidth || fallback?.width || 1000;
  const naturalHeight = img.naturalHeight || fallback?.height || 700;
  const longest = Math.max(naturalWidth, naturalHeight);
  const scale = Math.min(maxSide / longest, Math.max(1, minSide / longest));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Холст недоступен');
  ctx.drawImage(img, 0, 0, width, height);
  return { canvas, ctx, width, height, naturalWidth, pixels: ctx.getImageData(0, 0, width, height) };
}

/** Отдаёт пиксели фоновому потоку и ждёт ответа. */
function inWorker(message: Record<string, unknown>, source: ArrayBuffer): Promise<ArrayBuffer> {
  const id = nextId++;
  return new Promise<ArrayBuffer>((resolve) => {
    waiting.set(id, resolve);
    lineWorker().postMessage({ ...message, id, buffer: source }, [source]);
  });
}

async function render(url: string, kind: LineArtKind, strength: number, fallback: { width: number; height: number } | undefined, tint: Tint): Promise<string> {
  const { canvas, ctx, width, height, pixels } = await planPixels(url, fallback, MAX_SIDE, MIN_SIDE);
  const buffer = await inWorker({ op: 'art', kind, width, height, tint, strength }, pixels.data.buffer as ArrayBuffer);

  ctx.putImageData(new ImageData(new Uint8ClampedArray(buffer), width, height), 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Картинка линий не собралась'))), 'image/png')
  );
  return URL.createObjectURL(blob);
}

/** Силуэт считается по маленькой картинке: сравнить этажи хватает и её. */
const SILHOUETTE_SIDE = 512;

const silhouettes = new Map<string, Promise<PlanSilhouette>>();

/**
 * Силуэт здания на плане (запись 67) — для сравнения этажа с этажом входа;
 * один план считается один раз.
 *
 * @param planSize размер плана в его пикселях (`mapSize`): в них точки и
 *        привязка; у SVG размер картинки бывает другим
 */
export function planSilhouette(url: string, planSize?: { width: number; height: number }): Promise<PlanSilhouette> {
  let result = silhouettes.get(url);
  if (!result) {
    result = (async () => {
      const { width, height, naturalWidth, pixels } = await planPixels(url, planSize, SILHOUETTE_SIDE, 0);
      const buffer = await inWorker({ op: 'silhouette', width, height }, pixels.data.buffer as ArrayBuffer);
      return { width, height, mask: new Uint8Array(buffer), scale: (planSize?.width ?? naturalWidth) / width };
    })();
    silhouettes.set(url, result);
    result.catch(() => silhouettes.delete(url));
  }
  return result;
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
