/// <reference lib="webworker" />
import { lineArt, silhouette } from './lineArt';
import type { LineArtKind, Tint } from './lineArt';

/**
 * Фоновый поток линий плана (запись 62): расчёт по большой картинке занимает
 * десятые доли секунды, и в основном потоке он останавливал бы карту. Здесь
 * же — силуэт здания для сравнения этажей (запись 67).
 */

type Request =
  | { id: number; op: 'art'; kind: LineArtKind; width: number; height: number; buffer: ArrayBuffer; tint: Tint; strength: number }
  | { id: number; op: 'silhouette'; width: number; height: number; buffer: ArrayBuffer };

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  const pixels = { width: request.width, height: request.height, data: new Uint8ClampedArray(request.buffer) };
  const out =
    request.op === 'silhouette'
      ? (silhouette(pixels).buffer as ArrayBuffer)
      : (lineArt(request.kind, pixels, request.tint, request.strength).data.buffer as ArrayBuffer);
  (self as unknown as Worker).postMessage({ id: request.id, buffer: out }, [out]);
};
